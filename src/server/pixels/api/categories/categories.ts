import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';
import {
    CATEGORY_CATALOG,
    CATEGORY_CLASSIFIER_VERSION,
    categoryMatchToApiModel,
    categoryToApiModel,
    classifyNumber,
} from './categoryClassifier';

export class Categories {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    /** Public immutable catalog with a live available-number count per category. */
    async list(_payload: any = {}) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const q: any = await this.dao.executeQuery(
                `SELECT vnc.category_slug AS slug, COUNT(DISTINCT vnc.number_id) AS number_count
                 FROM vip_number_categories vnc
                 INNER JOIN vip_numbers n ON n.number_id = vnc.number_id
                 WHERE n.deleted_at IS NULL AND n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type='ONLINE' AND n.rtp_status <> 'RTA' AND vnc.classifier_version = ?
                 GROUP BY vnc.category_slug`, [CATEGORY_CLASSIFIER_VERSION]
            );
            if (q.status !== 1) throw new Error(q.info || 'Unable to load category counts.');
            const counts = new Map<string, number>();
            for (const row of (q.rows || [])) counts.set(String(row.slug), Number(row.number_count) || 0);

            const subs: any = await this.dao.executeQuery(
                `SELECT vns.category_id, vns.subcategory_id, COUNT(DISTINCT vns.number_id) AS number_count
                 FROM vip_number_subcategories vns
                 INNER JOIN vip_numbers n ON n.number_id = vns.number_id
                 WHERE n.deleted_at IS NULL AND n.status = 'AVAILABLE' AND n.stock > 0 AND n.visibility_type = 'ONLINE' AND n.rtp_status <> 'RTA' AND vns.classifier_version = ?
                 GROUP BY vns.category_id, vns.subcategory_id`, [CATEGORY_CLASSIFIER_VERSION],
            );
            if (subs.status !== 1) throw new Error(subs.info || 'Unable to load subcategory counts.');
            const subCounts = new Map<string, number>();
            for (const row of (subs.rows || [])) subCounts.set(`${row.category_id}:${row.subcategory_id}`, Number(row.number_count) || 0);

            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = CATEGORY_CATALOG.map((category) => ({
                ...categoryToApiModel(category),
                subcategories: category.subcategories.map(subcategory => ({
                    ...subcategory,
                    number_count: subCounts.get(`${category.id}:${subcategory.id}`) || 0,
                })),
                number_count: counts.get(category.slug) || 0,
                is_active: true,
                classifier_version: CATEGORY_CLASSIFIER_VERSION,
            }));
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    /** Read-only preview used by listing forms before the number is submitted. */
    async classify(payload: { number?: unknown, number_value?: unknown }) {
        const startMS = new Date().getTime();
        const resModel = this.masterModel.getResponseModel();
        try {
            const classification = classifyNumber(payload?.number ?? payload?.number_value);
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = {
                canonical_number: classification.canonicalNumber,
                categories: classification.categories.map(categoryMatchToApiModel),
                primary_category: classification.primaryCategory ? categoryMatchToApiModel(classification.primaryCategory) : null,
                classifier_version: classification.classifierVersion,
            };
        } catch (error) {
            resModel.status = -2;
            resModel.info = error instanceof Error ? error.message : String(error);
        } finally {
            resModel.tat = (new Date().getTime() - startMS) / 1000;
        }
        return resModel;
    }

    /** Retained for one release so rolling clients receive an explicit response. */
    async save(_payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            resModel.status = -410;
            resModel.info = 'Category Master has been retired. Categories are detected automatically from the number.';
            resModel.data = { retired: true, classifier_version: CATEGORY_CLASSIFIER_VERSION };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async remove(_payload: { category_id?: number }) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            resModel.status = -410;
            resModel.info = 'Category Master has been retired. Automatic categories cannot be deleted.';
            resModel.data = { retired: true, classifier_version: CATEGORY_CLASSIFIER_VERSION };
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }
}
