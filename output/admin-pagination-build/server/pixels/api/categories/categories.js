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
exports.Categories = void 0;
const database_1 = require("../../../gen_db/database");
const Logger_1 = require("../../../pixels-utility/Logger");
const MasterModel_1 = require("../../../models/MasterModel");
const categoryClassifier_1 = require("./categoryClassifier");
class Categories {
    constructor() {
        this.dao = new database_1.MySqlClient('pixels');
        this.logger = new Logger_1.Logger();
        this.masterModel = new MasterModel_1.MasterModel();
    }
    /** Public immutable catalog with a live available-number count per category. */
    list() {
        return __awaiter(this, arguments, void 0, function* (_payload = {}) {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                const q = yield this.dao.executeQuery(`SELECT vnc.category_slug AS slug, COUNT(DISTINCT vnc.number_id) AS number_count
                 FROM vip_number_categories vnc
                 INNER JOIN vip_numbers n ON n.number_id = vnc.number_id
                 WHERE n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE' AND vnc.classifier_version = ?
                 GROUP BY vnc.category_slug`, [categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION]);
                if (q.status !== 1)
                    throw new Error(q.info || 'Unable to load category counts.');
                const counts = new Map();
                for (const row of (q.rows || []))
                    counts.set(String(row.slug), Number(row.number_count) || 0);
                const subs = yield this.dao.executeQuery(`SELECT vns.category_id, vns.subcategory_id, COUNT(DISTINCT vns.number_id) AS number_count
                 FROM vip_number_subcategories vns
                 INNER JOIN vip_numbers n ON n.number_id = vns.number_id
                 WHERE n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type = 'ONLINE' AND vns.classifier_version = ?
                 GROUP BY vns.category_id, vns.subcategory_id`, [categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION]);
                if (subs.status !== 1)
                    throw new Error(subs.info || 'Unable to load subcategory counts.');
                const subCounts = new Map();
                for (const row of (subs.rows || []))
                    subCounts.set(`${row.category_id}:${row.subcategory_id}`, Number(row.number_count) || 0);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = categoryClassifier_1.CATEGORY_CATALOG.map((category) => (Object.assign(Object.assign({}, (0, categoryClassifier_1.categoryToApiModel)(category)), { subcategories: category.subcategories.map(subcategory => (Object.assign(Object.assign({}, subcategory), { number_count: subCounts.get(`${category.id}:${subcategory.id}`) || 0 }))), number_count: counts.get(category.slug) || 0, is_active: true, classifier_version: categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION })));
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
    /** Read-only preview used by listing forms before the number is submitted. */
    classify(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const startMS = new Date().getTime();
            const resModel = this.masterModel.getResponseModel();
            try {
                const classification = (0, categoryClassifier_1.classifyNumber)((_a = payload === null || payload === void 0 ? void 0 : payload.number) !== null && _a !== void 0 ? _a : payload === null || payload === void 0 ? void 0 : payload.number_value);
                resModel.status = 1;
                resModel.info = 'OK';
                resModel.data = {
                    canonical_number: classification.canonicalNumber,
                    categories: classification.categories.map(categoryClassifier_1.categoryMatchToApiModel),
                    primary_category: classification.primaryCategory ? (0, categoryClassifier_1.categoryMatchToApiModel)(classification.primaryCategory) : null,
                    classifier_version: classification.classifierVersion,
                };
            }
            catch (error) {
                resModel.status = -2;
                resModel.info = error instanceof Error ? error.message : String(error);
            }
            finally {
                resModel.tat = (new Date().getTime() - startMS) / 1000;
            }
            return resModel;
        });
    }
    /** Retained for one release so rolling clients receive an explicit response. */
    save(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                resModel.status = -410;
                resModel.info = 'Category Master has been retired. Categories are detected automatically from the number.';
                resModel.data = { retired: true, classifier_version: categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION };
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
    remove(_payload) {
        return __awaiter(this, void 0, void 0, function* () {
            let startMS = new Date().getTime();
            let resModel = this.masterModel.getResponseModel();
            try {
                resModel.status = -410;
                resModel.info = 'Category Master has been retired. Automatic categories cannot be deleted.';
                resModel.data = { retired: true, classifier_version: categoryClassifier_1.CATEGORY_CLASSIFIER_VERSION };
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
}
exports.Categories = Categories;
//# sourceMappingURL=categories.js.map