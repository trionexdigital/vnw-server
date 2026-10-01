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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Banners = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const MAX_CAROUSEL_IMAGE_LENGTH = 4 * 1024 * 1024;
function cleanText(value, maxLength) {
    const text = String(value !== null && value !== void 0 ? value : '').trim();
    return text ? text.slice(0, maxLength) : null;
}
function cleanLink(value) {
    const link = String(value !== null && value !== void 0 ? value : '').trim();
    if (!link)
        return null;
    if (link.startsWith('/') || /^https?:\/\//i.test(link))
        return link.slice(0, 255);
    throw new Error('Carousel link must be a site path or an HTTP(S) URL.');
}
function cleanPosition(value, fallback) {
    const position = Number(value);
    if (!Number.isFinite(position))
        return fallback;
    return Math.round(Math.max(8, Math.min(92, position)));
}
function cleanRange(value, fallback, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.round(Math.max(min, Math.min(max, number)));
}
function cleanChoice(value, choices, fallback) {
    const choice = String(value !== null && value !== void 0 ? value : '').trim();
    return choices.includes(choice) ? choice : fallback;
}
function validateCarouselImage(value) {
    const image = String(value !== null && value !== void 0 ? value : '').trim();
    if (!image)
        throw new Error('A cropped carousel image is required.');
    if (image.length > MAX_CAROUSEL_IMAGE_LENGTH) {
        throw new Error('Carousel image is too large. Please crop or compress it again.');
    }
    const isDataImage = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(image);
    const isStoredImage = image.startsWith('/') || /^https?:\/\//i.test(image);
    if (!isDataImage && !isStoredImage)
        throw new Error('Unsupported carousel image format.');
    return image;
}
class Banners {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    list(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const where = (payload === null || payload === void 0 ? void 0 : payload.all) ? '' : "WHERE is_active = 1 AND image IS NOT NULL AND image <> ''";
                const q = yield this.dao.executeQuery(`SELECT banner_id, eyebrow, title, subtitle, image, cta_text, cta_link, content_x, content_y,
                        content_width, content_rotation, content_style, text_align, font_style, title_size, overlay_style,
                        is_active, sort_order
                 FROM banners ${where} ORDER BY sort_order ASC, banner_id ASC`, []);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = q.rows || [];
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
    save(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const bannerId = Number(payload.banner_id) || 0;
                const eyebrow = cleanText(payload.eyebrow, 96);
                const title = cleanText(payload.title, 160);
                const subtitle = cleanText(payload.subtitle, 255);
                const ctaText = cleanText(payload.cta_text, 64);
                const ctaLink = cleanLink(payload.cta_link);
                const contentX = cleanPosition(payload.content_x, 25);
                const contentY = cleanPosition(payload.content_y, 62);
                const contentWidth = cleanRange(payload.content_width, 34, 24, 68);
                const contentRotation = cleanRange(payload.content_rotation, 0, -12, 12);
                const contentStyle = cleanChoice(payload.content_style, ['light', 'dark', 'brand', 'minimal'], 'light');
                const textAlign = cleanChoice(payload.text_align, ['left', 'center', 'right'], 'left');
                const fontStyle = cleanChoice(payload.font_style, ['serif', 'sans', 'display'], 'serif');
                const titleSize = cleanChoice(payload.title_size, ['small', 'medium', 'large'], 'medium');
                const overlayStyle = cleanChoice(payload.overlay_style, ['soft', 'dark', 'light', 'brand', 'none'], 'soft');
                const isActive = payload.is_active === false || Number(payload.is_active) === 0 ? 0 : 1;
                const sortOrder = Math.max(0, Math.min(9999, Number(payload.sort_order) || 0));
                let image = String((_a = payload.image) !== null && _a !== void 0 ? _a : '').trim();
                if (bannerId && !image) {
                    const existing = yield this.dao.executeQuery(`SELECT image FROM banners WHERE banner_id = ? LIMIT 1`, [bannerId]);
                    image = String(((_c = (_b = existing.rows) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.image) || '').trim();
                }
                image = validateCarouselImage(image);
                if (bannerId) {
                    yield this.dao.executeQuery(`UPDATE banners SET eyebrow=?, title=?, subtitle=?, image=?, cta_text=?, cta_link=?, content_x=?, content_y=?, content_width=?, content_rotation=?, content_style=?, text_align=?, font_style=?, title_size=?, overlay_style=?, is_active=?, sort_order=? WHERE banner_id=?`, [eyebrow, title, subtitle, image, ctaText, ctaLink, contentX, contentY, contentWidth, contentRotation, contentStyle, textAlign, fontStyle, titleSize, overlayStyle, isActive, sortOrder, bannerId]);
                    resModel.data = { banner_id: bannerId };
                }
                else {
                    const q = yield this.dao.executeQuery(`INSERT INTO banners (eyebrow, title, subtitle, image, cta_text, cta_link, content_x, content_y, content_width, content_rotation, content_style, text_align, font_style, title_size, overlay_style, is_active, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [eyebrow, title, subtitle, image, ctaText, ctaLink, contentX, contentY, contentWidth, contentRotation, contentStyle, textAlign, fontStyle, titleSize, overlayStyle, isActive, sortOrder]);
                    resModel.data = { banner_id: q.insertId };
                }
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
                this.logger.error(JSON.stringify(resModel));
            }
            finally {
                try {
                    resModel.tat = (new Date().getTime() - startMS) / 1000;
                }
                catch (e) { }
            }
            return resModel;
        });
    }
    remove(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let resModel = this.masterModel.getResponseModel();
            try {
                const bannerId = Number(payload.banner_id);
                if (!bannerId)
                    throw new Error('A valid carousel item is required.');
                yield this.dao.executeQuery(`DELETE FROM banners WHERE banner_id = ?`, [bannerId]);
                resModel.status = 1;
                resModel.info = 'OK';
            }
            catch (error) {
                resModel.status = -33;
                resModel.info = 'catch : ' + error;
            }
            return resModel;
        });
    }
}
exports.Banners = Banners;
//# sourceMappingURL=banners.js.map