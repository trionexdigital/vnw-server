import { MySqlClient } from '../../../gen_db/database';
import { Logger } from '../../../pixels-utility/Logger';
import { MasterModel } from '../../../models/MasterModel';

const MAX_CAROUSEL_IMAGE_LENGTH = 4 * 1024 * 1024;

function cleanText(value: unknown, maxLength: number): string | null {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, maxLength) : null;
}

function cleanLink(value: unknown): string | null {
    const link = String(value ?? '').trim();
    if (!link) return null;
    if (link.startsWith('/') || /^https?:\/\//i.test(link)) return link.slice(0, 255);
    throw new Error('Carousel link must be a site path or an HTTP(S) URL.');
}

function validateCarouselImage(value: unknown): string {
    const image = String(value ?? '').trim();
    if (!image) throw new Error('A cropped carousel image is required.');
    if (image.length > MAX_CAROUSEL_IMAGE_LENGTH) {
        throw new Error('Carousel image is too large. Please crop or compress it again.');
    }
    const isDataImage = /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(image);
    const isStoredImage = image.startsWith('/') || /^https?:\/\//i.test(image);
    if (!isDataImage && !isStoredImage) throw new Error('Unsupported carousel image format.');
    return image;
}

export class Banners {
    private dao: MySqlClient;
    private logger: Logger;
    private masterModel: MasterModel;

    constructor() {
        this.dao = new MySqlClient('pixels');
        this.logger = new Logger();
        this.masterModel = new MasterModel();
    }

    async list(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const where = payload?.all ? '' : "WHERE is_active = 1 AND image IS NOT NULL AND image <> ''";
            const q: any = await this.dao.executeQuery(
                `SELECT banner_id, title, subtitle, image, cta_text, cta_link, is_active, sort_order
                 FROM banners ${where} ORDER BY sort_order ASC, banner_id ASC`, []
            );
            resModel.status = 1;
            resModel.info = 'OK';
            resModel.data = q.rows || [];
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async save(payload: any) {
        let startMS = new Date().getTime();
        let resModel = this.masterModel.getResponseModel();
        try {
            const bannerId = Number(payload.banner_id) || 0;
            const title = cleanText(payload.title, 160);
            const subtitle = cleanText(payload.subtitle, 255);
            const ctaText = cleanText(payload.cta_text, 64);
            const ctaLink = cleanLink(payload.cta_link);
            const isActive = payload.is_active === false || Number(payload.is_active) === 0 ? 0 : 1;
            const sortOrder = Math.max(0, Math.min(9999, Number(payload.sort_order) || 0));

            let image = String(payload.image ?? '').trim();
            if (bannerId && !image) {
                const existing: any = await this.dao.executeQuery(
                    `SELECT image FROM banners WHERE banner_id = ? LIMIT 1`, [bannerId]
                );
                image = String(existing.rows?.[0]?.image || '').trim();
            }
            image = validateCarouselImage(image);

            if (bannerId) {
                await this.dao.executeQuery(
                    `UPDATE banners SET title=?, subtitle=?, image=?, cta_text=?, cta_link=?, is_active=?, sort_order=? WHERE banner_id=?`,
                    [title, subtitle, image, ctaText, ctaLink, isActive, sortOrder, bannerId]
                );
                resModel.data = { banner_id: bannerId };
            } else {
                const q: any = await this.dao.executeQuery(
                    `INSERT INTO banners (title, subtitle, image, cta_text, cta_link, is_active, sort_order) VALUES (?,?,?,?,?,?,?)`,
                    [title, subtitle, image, ctaText, ctaLink, isActive, sortOrder]
                );
                resModel.data = { banner_id: q.insertId };
            }
            resModel.status = 1;
            resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33;
            resModel.info = 'catch : ' + error;
            this.logger.error(JSON.stringify(resModel));
        } finally {
            try { resModel.tat = (new Date().getTime() - startMS) / 1000; } catch (e) { }
        }
        return resModel;
    }

    async remove(payload: { banner_id: number }) {
        let resModel = this.masterModel.getResponseModel();
        try {
            const bannerId = Number(payload.banner_id);
            if (!bannerId) throw new Error('A valid carousel item is required.');
            await this.dao.executeQuery(`DELETE FROM banners WHERE banner_id = ?`, [bannerId]);
            resModel.status = 1; resModel.info = 'OK';
        } catch (error) {
            resModel.status = -33; resModel.info = 'catch : ' + error;
        }
        return resModel;
    }
}
