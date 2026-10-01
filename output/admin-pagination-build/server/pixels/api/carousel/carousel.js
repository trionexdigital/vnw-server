"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CarouselStudio = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const DESKTOP = { width: 1600, height: 900 };
const MOBILE = { width: 1080, height: 1920 };
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 3 * 1024 * 1024;
const MAX_UPLOAD_LAYERS = 10;
const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'];
const ALLOWED_PURPOSE = ['source', 'sticker', 'preview-desktop', 'preview-mobile'];
const ALLOWED_TRANSITIONS = ['fade', 'slide', 'zoom', 'flip'];
function cleanName(value) {
    return (String(value !== null && value !== void 0 ? value : '').trim() || 'Untitled carousel').slice(0, 120);
}
function cleanLink(value) {
    const link = String(value !== null && value !== void 0 ? value : '').trim();
    if (!link)
        return null;
    if ((link.startsWith('/') && !link.startsWith('//')) || /^https?:\/\//i.test(link))
        return link.slice(0, 1024);
    throw new Error('Links must be relative site paths or HTTP(S) URLs.');
}
function blankDocument(device) {
    const size = device === 'desktop' ? DESKTOP : MOBILE;
    return {
        version: 1,
        artboard: Object.assign({}, size),
        fabric: {
            version: '6',
            objects: [{
                    type: 'Rect', vnwId: `${device}-background`, left: 0, top: 0,
                    width: size.width, height: size.height, fill: '#120d0a',
                    selectable: false, evented: false,
                }],
            background: '#120d0a',
        },
        settings: { background: '#120d0a' },
    };
}
function parseJson(value) {
    if (value && typeof value === 'object')
        return value;
    if (typeof value !== 'string' || !value.trim())
        return null;
    try {
        return JSON.parse(value);
    }
    catch (_a) {
        throw new Error('The carousel document is not valid JSON.');
    }
}
function walkObjects(objects, visit) {
    for (const object of objects) {
        if (!object || typeof object !== 'object')
            continue;
        visit(object);
        if (Array.isArray(object.objects))
            walkObjects(object.objects, visit);
    }
}
function validateDocument(value, device) {
    var _a, _b;
    const document = parseJson(value);
    if (!document)
        throw new Error(`A ${device} design is required.`);
    const expected = device === 'desktop' ? DESKTOP : MOBILE;
    if (Number(document.version) !== 1)
        throw new Error('Unsupported carousel document version.');
    if (Number((_a = document.artboard) === null || _a === void 0 ? void 0 : _a.width) !== expected.width || Number((_b = document.artboard) === null || _b === void 0 ? void 0 : _b.height) !== expected.height) {
        throw new Error(`The ${device} artboard must be exactly ${expected.width}×${expected.height}.`);
    }
    if (!document.fabric || !Array.isArray(document.fabric.objects)) {
        throw new Error(`The ${device} Fabric document is incomplete.`);
    }
    const ids = new Set();
    const assetIds = new Set();
    let uploadedLayerCount = 0;
    let objectCount = 0;
    walkObjects(document.fabric.objects, (object) => {
        objectCount += 1;
        const id = String(object.vnwId || '').trim();
        if (!id)
            throw new Error(`Every ${device} layer must have an object ID.`);
        if (ids.has(id))
            throw new Error(`Duplicate layer ID '${id}' in the ${device} design.`);
        ids.add(id);
        if (object.vnwLink != null && object.vnwLink !== '')
            object.vnwLink = cleanLink(object.vnwLink);
        const assetId = Number(object.vnwAssetId || 0);
        if (assetId > 0) {
            assetIds.add(assetId);
            uploadedLayerCount += 1;
        }
    });
    if (uploadedLayerCount > MAX_UPLOAD_LAYERS) {
        throw new Error(`The ${device} artboard can contain at most ${MAX_UPLOAD_LAYERS} uploaded image or sticker layers.`);
    }
    const json = JSON.stringify(document);
    if (Buffer.byteLength(json, 'utf8') > MAX_DOCUMENT_BYTES) {
        throw new Error(`The ${device} document exceeds the 2 MB editing-data limit.`);
    }
    return { json, assetIds: Array.from(assetIds), objectCount };
}
function parseRowDocument(value) {
    if (!value)
        return null;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    }
    catch (_a) {
        return null;
    }
}
function isImageMagic(buffer, mime) {
    if (mime === 'image/png')
        return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mime === 'image/jpeg')
        return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (mime === 'image/webp')
        return buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    return false;
}
function remapAssetIds(value, mapping) {
    if (Array.isArray(value))
        return value.map((entry) => remapAssetIds(entry, mapping));
    if (!value || typeof value !== 'object')
        return value;
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
        if (key === 'vnwAssetId' && mapping.has(Number(entry)))
            next[key] = mapping.get(Number(entry));
        else
            next[key] = remapAssetIds(entry, mapping);
    }
    return next;
}
class CarouselStudio {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    response() { return this.masterModel.getResponseModel(); }
    assertQuery(query) {
        if (!query || query.status !== 1)
            throw new Error((query === null || query === void 0 ? void 0 : query.info) || 'Database operation failed.');
        return query;
    }
    project(carouselId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const q = this.assertQuery(yield this.dao.executeQuery(`SELECT * FROM carousel_projects WHERE carousel_id = ? LIMIT 1`, [carouselId]));
            const row = (_a = q.rows) === null || _a === void 0 ? void 0 : _a[0];
            if (!row)
                throw new Error('Carousel project not found.');
            return row;
        });
    }
    assertOwnedAssets(carouselId, assetIds) {
        return __awaiter(this, void 0, void 0, function* () {
            const unique = Array.from(new Set(assetIds.filter((id) => Number.isInteger(id) && id > 0)));
            if (!unique.length)
                return;
            const placeholders = unique.map(() => '?').join(',');
            const q = this.assertQuery(yield this.dao.executeQuery(`SELECT asset_id FROM carousel_assets WHERE carousel_id = ? AND asset_id IN (${placeholders})`, [carouselId, ...unique]));
            if ((q.rows || []).length !== unique.length)
                throw new Error('One or more media layers do not belong to this carousel.');
        });
    }
    adminList() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            try {
                const q = this.assertQuery(yield this.dao.executeQuery(`SELECT carousel_id, name, sort_order, is_published, draft_revision, published_revision,
                        draft_desktop_preview_id, draft_mobile_preview_id,
                        published_desktop_preview_id, published_mobile_preview_id,
                        transition_style, autoplay_seconds, updated_at, published_at
                 FROM carousel_projects ORDER BY sort_order ASC, carousel_id ASC`, []));
                result.status = 1;
                result.info = 'OK';
                result.data = q.rows || [];
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    create(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const result = this.response();
            try {
                const desktop = validateDocument(payload.desktop || blankDocument('desktop'), 'desktop');
                const mobile = validateDocument(payload.mobile || blankDocument('mobile'), 'mobile');
                const maxOrder = this.assertQuery(yield this.dao.executeQuery(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM carousel_projects`, []));
                const q = this.assertQuery(yield this.dao.executeQuery(`INSERT INTO carousel_projects
                 (name, sort_order, draft_desktop, draft_mobile, created_by, updated_by)
                 VALUES (?,?,?,?,?,?)`, [cleanName(payload.name), Number(((_b = (_a = maxOrder.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.next_order) || 0), desktop.json, mobile.json, payload.user_id, payload.user_id]));
                result.status = 1;
                result.info = 'OK';
                result.data = { carousel_id: q.insertId, revision: 1 };
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    get(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            try {
                const id = Number(payload.carousel_id);
                if (!id)
                    throw new Error('A valid carousel project is required.');
                const row = yield this.project(id);
                const assets = this.assertQuery(yield this.dao.executeQuery(`SELECT asset_id, purpose, original_name, mime_type, byte_size, width, height, created_at
                 FROM carousel_assets WHERE carousel_id = ? ORDER BY asset_id`, [id]));
                result.status = 1;
                result.info = 'OK';
                result.data = Object.assign(Object.assign({}, row), { draft_desktop: parseRowDocument(row.draft_desktop), draft_mobile: parseRowDocument(row.draft_mobile), published_desktop: parseRowDocument(row.published_desktop), published_mobile: parseRowDocument(row.published_mobile), assets: assets.rows || [] });
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    saveDraft(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            try {
                const id = Number(payload.carousel_id);
                const revision = Number(payload.revision);
                if (!id || !revision)
                    throw new Error('Carousel ID and revision are required.');
                const desktop = validateDocument(payload.desktop, 'desktop');
                const mobile = validateDocument(payload.mobile, 'mobile');
                yield this.assertOwnedAssets(id, [...desktop.assetIds, ...mobile.assetIds]);
                const desktopPreview = Number(payload.desktop_preview_id) || null;
                const mobilePreview = Number(payload.mobile_preview_id) || null;
                yield this.assertOwnedAssets(id, [desktopPreview || 0, mobilePreview || 0]);
                const transition = ALLOWED_TRANSITIONS.includes(String(payload.transition_style)) ? String(payload.transition_style) : 'fade';
                const autoplay = Math.max(3, Math.min(15, Number(payload.autoplay_seconds) || 6));
                const q = this.assertQuery(yield this.dao.executeQuery(`UPDATE carousel_projects SET name=?, draft_desktop=?, draft_mobile=?,
                        draft_desktop_preview_id=?, draft_mobile_preview_id=?, transition_style=?,
                        autoplay_seconds=?, updated_by=?, draft_revision=draft_revision+1
                 WHERE carousel_id=? AND draft_revision=?`, [cleanName(payload.name), desktop.json, mobile.json, desktopPreview, mobilePreview,
                    transition, autoplay, payload.user_id, id, revision]));
                if (!q.affectedRows) {
                    const current = yield this.project(id);
                    result.status = -409;
                    result.info = 'Conflict: this carousel was changed in another editor tab.';
                    result.data = { current_revision: Number(current.draft_revision) };
                    return result;
                }
                result.status = 1;
                result.info = 'Saved';
                result.data = { revision: revision + 1 };
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    publish(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            const connection = yield this.dao.getConnection();
            try {
                const id = Number(payload.carousel_id);
                const revision = Number(payload.revision);
                if (!id || !revision)
                    throw new Error('Carousel ID and revision are required.');
                yield connection.beginTransaction();
                const [rows] = yield connection.query(`SELECT * FROM carousel_projects WHERE carousel_id=? FOR UPDATE`, [id]);
                const row = rows === null || rows === void 0 ? void 0 : rows[0];
                if (!row)
                    throw new Error('Carousel project not found.');
                if (Number(row.draft_revision) !== revision) {
                    yield connection.rollback();
                    result.status = -409;
                    result.info = 'Conflict: reload the latest draft before publishing.';
                    result.data = { current_revision: Number(row.draft_revision) };
                    return result;
                }
                validateDocument(row.draft_desktop, 'desktop');
                validateDocument(row.draft_mobile, 'mobile');
                if (!row.draft_desktop_preview_id || !row.draft_mobile_preview_id) {
                    throw new Error('Generate both desktop and mobile previews before publishing.');
                }
                yield connection.query(`UPDATE carousel_projects SET is_published=1, published_revision=draft_revision,
                        published_desktop=draft_desktop, published_mobile=draft_mobile,
                        published_desktop_preview_id=draft_desktop_preview_id,
                        published_mobile_preview_id=draft_mobile_preview_id,
                        updated_by=?, published_at=CURRENT_TIMESTAMP WHERE carousel_id=?`, [payload.user_id, id]);
                yield connection.commit();
                result.status = 1;
                result.info = 'Published';
                result.data = { published_revision: revision };
            }
            catch (error) {
                try {
                    yield connection.rollback();
                }
                catch (_a) { }
                result.status = -33;
                result.info = String(error);
            }
            finally {
                connection.release();
            }
            return result;
        });
    }
    unpublish(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            try {
                const id = Number(payload.carousel_id);
                if (!id)
                    throw new Error('A valid carousel project is required.');
                this.assertQuery(yield this.dao.executeQuery(`UPDATE carousel_projects SET is_published=0, updated_by=? WHERE carousel_id=?`, [payload.user_id, id]));
                result.status = 1;
                result.info = 'Unpublished';
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    duplicate(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const result = this.response();
            const connection = yield this.dao.getConnection();
            try {
                const id = Number(payload.carousel_id);
                if (!id)
                    throw new Error('A valid carousel project is required.');
                yield connection.beginTransaction();
                const [rows] = yield connection.query(`SELECT * FROM carousel_projects WHERE carousel_id=?`, [id]);
                const source = rows === null || rows === void 0 ? void 0 : rows[0];
                if (!source)
                    throw new Error('Carousel project not found.');
                const [orderRows] = yield connection.query(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM carousel_projects`);
                const [insert] = yield connection.query(`INSERT INTO carousel_projects (name, sort_order, draft_desktop, draft_mobile, transition_style,
                 autoplay_seconds, created_by, updated_by) VALUES (?,?,?,?,?,?,?,?)`, [`${String(source.name).slice(0, 108)} copy`, Number(((_a = orderRows === null || orderRows === void 0 ? void 0 : orderRows[0]) === null || _a === void 0 ? void 0 : _a.next_order) || 0),
                    source.draft_desktop, source.draft_mobile, source.transition_style, source.autoplay_seconds,
                    payload.user_id, payload.user_id]);
                const newId = Number(insert.insertId);
                const [assets] = yield connection.query(`SELECT * FROM carousel_assets WHERE carousel_id=?`, [id]);
                const mapping = new Map();
                for (const asset of (assets || [])) {
                    const [copy] = yield connection.query(`INSERT INTO carousel_assets (carousel_id,purpose,original_name,mime_type,byte_size,width,height,content_sha256,content)
                     VALUES (?,?,?,?,?,?,?,?,?)`, [newId, asset.purpose, asset.original_name, asset.mime_type, asset.byte_size, asset.width,
                        asset.height, asset.content_sha256, asset.content]);
                    mapping.set(Number(asset.asset_id), Number(copy.insertId));
                }
                const desktop = JSON.stringify(remapAssetIds(parseRowDocument(source.draft_desktop), mapping));
                const mobile = JSON.stringify(remapAssetIds(parseRowDocument(source.draft_mobile), mapping));
                yield connection.query(`UPDATE carousel_projects SET draft_desktop=?, draft_mobile=?, draft_desktop_preview_id=?, draft_mobile_preview_id=? WHERE carousel_id=?`, [desktop, mobile, mapping.get(Number(source.draft_desktop_preview_id)) || null,
                    mapping.get(Number(source.draft_mobile_preview_id)) || null, newId]);
                yield connection.commit();
                result.status = 1;
                result.info = 'Duplicated';
                result.data = { carousel_id: newId };
            }
            catch (error) {
                try {
                    yield connection.rollback();
                }
                catch (_b) { }
                result.status = -33;
                result.info = String(error);
            }
            finally {
                connection.release();
            }
            return result;
        });
    }
    reorder(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const result = this.response();
            const ids = Array.isArray(payload.carousel_ids) ? payload.carousel_ids.map(Number).filter(Boolean) : [];
            const connection = yield this.dao.getConnection();
            try {
                if (!ids.length || new Set(ids).size !== ids.length)
                    throw new Error('A unique ordered carousel ID list is required.');
                const [countRows] = yield connection.query(`SELECT COUNT(*) AS count FROM carousel_projects`);
                if (Number((_a = countRows === null || countRows === void 0 ? void 0 : countRows[0]) === null || _a === void 0 ? void 0 : _a.count) !== ids.length)
                    throw new Error('The reorder list must contain every carousel project.');
                yield connection.beginTransaction();
                for (let i = 0; i < ids.length; i += 1) {
                    const [updated] = yield connection.query(`UPDATE carousel_projects SET sort_order=?, updated_by=? WHERE carousel_id=?`, [i, payload.user_id, ids[i]]);
                    if (!updated.affectedRows)
                        throw new Error('A carousel in the reorder list was not found.');
                }
                yield connection.commit();
                result.status = 1;
                result.info = 'Reordered';
            }
            catch (error) {
                try {
                    yield connection.rollback();
                }
                catch (_b) { }
                result.status = -33;
                result.info = String(error);
            }
            finally {
                connection.release();
            }
            return result;
        });
    }
    remove(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            const connection = yield this.dao.getConnection();
            try {
                const id = Number(payload.carousel_id);
                if (!id)
                    throw new Error('A valid carousel project is required.');
                yield connection.beginTransaction();
                yield connection.query(`DELETE FROM carousel_assets WHERE carousel_id=?`, [id]);
                const [deleted] = yield connection.query(`DELETE FROM carousel_projects WHERE carousel_id=?`, [id]);
                if (!deleted.affectedRows)
                    throw new Error('Carousel project not found.');
                yield connection.commit();
                result.status = 1;
                result.info = 'Deleted';
            }
            catch (error) {
                try {
                    yield connection.rollback();
                }
                catch (_a) { }
                result.status = -33;
                result.info = String(error);
            }
            finally {
                connection.release();
            }
            return result;
        });
    }
    uploadAsset(payload, file) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const result = this.response();
            try {
                const carouselId = Number(payload.carousel_id);
                if (!carouselId)
                    throw new Error('A valid carousel project is required.');
                yield this.project(carouselId);
                const purpose = ALLOWED_PURPOSE.includes(String(payload.purpose)) ? String(payload.purpose) : 'source';
                if (!file || Array.isArray(file) || !Buffer.isBuffer(file.data))
                    throw new Error('Choose one image to upload.');
                const mime = String(file.mimetype || '').toLowerCase();
                if (!ALLOWED_MIME.includes(mime) || !isImageMagic(file.data, mime)) {
                    throw new Error('Only genuine PNG, JPEG, and WebP images are accepted.');
                }
                const width = Math.round(Number(payload.width));
                const height = Math.round(Number(payload.height));
                if (!width || !height || width > 12000 || height > 12000)
                    throw new Error('Valid image dimensions are required.');
                const isPreview = purpose.startsWith('preview-');
                const maxBytes = isPreview ? MAX_PREVIEW_BYTES : MAX_SOURCE_BYTES;
                if (Number(file.size) > maxBytes)
                    throw new Error(`This image exceeds the ${isPreview ? '3 MB preview' : '12 MB source'} limit.`);
                if (!isPreview) {
                    const total = this.assertQuery(yield this.dao.executeQuery(`SELECT COALESCE(SUM(byte_size),0) AS bytes FROM carousel_assets
                     WHERE carousel_id=? AND purpose IN ('source','sticker')`, [carouselId]));
                    if (Number(((_b = (_a = total.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.bytes) || 0) + Number(file.size) > MAX_SOURCE_BYTES) {
                        throw new Error('This project has reached its 12 MB source-asset limit.');
                    }
                }
                const hash = crypto_1.default.createHash('sha256').update(file.data).digest('hex');
                const duplicate = this.assertQuery(yield this.dao.executeQuery(`SELECT asset_id, purpose, original_name, mime_type, byte_size, width, height
                 FROM carousel_assets WHERE carousel_id=? AND content_sha256=? AND purpose=? LIMIT 1`, [carouselId, hash, purpose]));
                if ((_c = duplicate.rows) === null || _c === void 0 ? void 0 : _c[0]) {
                    result.status = 1;
                    result.info = 'Already uploaded';
                    result.data = duplicate.rows[0];
                    return result;
                }
                const q = this.assertQuery(yield this.dao.executeQuery(`INSERT INTO carousel_assets (carousel_id,purpose,original_name,mime_type,byte_size,width,height,content_sha256,content)
                 VALUES (?,?,?,?,?,?,?,?,?)`, [carouselId, purpose, String(file.name || 'image').slice(0, 180), mime, Number(file.size),
                    width, height, hash, file.data]));
                result.status = 1;
                result.info = 'Uploaded';
                result.data = { asset_id: q.insertId, purpose, original_name: String(file.name || 'image').slice(0, 180), mime_type: mime, byte_size: Number(file.size), width, height };
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    deleteAsset(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            try {
                const id = Number(payload.carousel_id);
                const assetId = Number(payload.asset_id);
                if (!id || !assetId)
                    throw new Error('Carousel ID and asset ID are required.');
                const project = yield this.project(id);
                const documents = [project.draft_desktop, project.draft_mobile, project.published_desktop, project.published_mobile].join(' ');
                const previewIds = [project.draft_desktop_preview_id, project.draft_mobile_preview_id, project.published_desktop_preview_id, project.published_mobile_preview_id].map(Number);
                if (documents.includes(`\"vnwAssetId\":${assetId}`) || previewIds.includes(assetId)) {
                    throw new Error('Remove this asset from all designs and previews before deleting it.');
                }
                const q = this.assertQuery(yield this.dao.executeQuery(`DELETE FROM carousel_assets WHERE carousel_id=? AND asset_id=?`, [id, assetId]));
                if (!q.affectedRows)
                    throw new Error('Asset not found.');
                result.status = 1;
                result.info = 'Deleted';
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    publicList() {
        return __awaiter(this, void 0, void 0, function* () {
            const result = this.response();
            try {
                const q = this.assertQuery(yield this.dao.executeQuery(`SELECT carousel_id, name, sort_order, published_revision, published_desktop, published_mobile,
                        published_desktop_preview_id, published_mobile_preview_id, transition_style,
                        autoplay_seconds, published_at
                 FROM carousel_projects
                 WHERE is_published=1 AND published_desktop IS NOT NULL AND published_mobile IS NOT NULL
                 ORDER BY sort_order ASC, carousel_id ASC`, []));
                result.status = 1;
                result.info = 'OK';
                result.data = (q.rows || []).map((row) => (Object.assign(Object.assign({}, row), { published_desktop: parseRowDocument(row.published_desktop), published_mobile: parseRowDocument(row.published_mobile) })));
            }
            catch (error) {
                result.status = -33;
                result.info = String(error);
            }
            return result;
        });
    }
    getAsset(assetId_1, publicOnly_1) {
        return __awaiter(this, arguments, void 0, function* (assetId, publicOnly, previewOnly = false) {
            var _a;
            const params = [assetId];
            let where = 'a.asset_id=?';
            if (publicOnly)
                where += ' AND p.is_published=1';
            if (previewOnly)
                where += " AND a.purpose IN ('preview-desktop','preview-mobile')";
            const q = this.assertQuery(yield this.dao.executeQuery(`SELECT a.asset_id, a.mime_type, a.byte_size, a.content_sha256, a.content
             FROM carousel_assets a INNER JOIN carousel_projects p ON p.carousel_id=a.carousel_id
             WHERE ${where} LIMIT 1`, params));
            return ((_a = q.rows) === null || _a === void 0 ? void 0 : _a[0]) || null;
        });
    }
}
exports.CarouselStudio = CarouselStudio;
//# sourceMappingURL=carousel.js.map