import { Router, Request, Response } from 'express';
import { MasterModel } from "../../../models/MasterModel";
import * as gtUtil from "../../../pixels-utility";
import { Site } from './site';
import { DealsOfDay } from '../dealsOfDay/dealsOfDay';
import { MarketplaceContent } from './marketplaceContent';
import { HomePremium } from './homePremium';
import { Translation } from './translation';
import { DeliveryCities } from './deliveryCities';

const masterModel = new MasterModel();
const site = new Site();
const dealsOfDay = new DealsOfDay();
const marketplace = new MarketplaceContent();
const homePremium = new HomePremium();
const router = Router();

// All public (path is in the auth bypass list).
const pub = (fn: (p: any) => Promise<any>) => async (req: Request, res: Response) => {
    let startMS = new Date().getTime();
    let resModel = masterModel.getResponseModel();
    try {
        resModel = await fn(req.body || {});
    } catch (error) {
        resModel.status = -9;
        resModel.info = 'catch: ' + error;
    } finally {
        resModel.endDT = new Date();
        resModel.tat = (new Date().getTime() - startMS) / 1000;
        res.status(gtUtil.Constants.HTTP_OK).json(resModel);
    }
};

const translation = new Translation();
router.post('/translate', async (req, res) => res.json(await translation.translate(req.body || {}, req.ip)));

router.post('/settings', pub((p) => site.settings()));
router.post('/delivery-cities', pub(() => new DeliveryCities().list()));
router.post('/hero-stats', pub((p) => site.heroStats()));
router.post('/deals-of-day', pub(() => dealsOfDay.publicList()));
router.post('/newsletter', pub((p) => site.subscribe(p)));
router.post('/enquiry', pub((p) => site.enquiry(p)));
router.post('/family-packs', pub((p) => marketplace.packs(p)));
router.post('/corporate-packs', pub((p) => marketplace.packs(p, true)));
router.post('/operators', pub(() => marketplace.operators()));
router.post('/home-premium-numbers', pub(() => homePremium.list(false)));
router.post('/trusted-clients', pub(() => marketplace.clients(false)));
router.post('/faqs', pub(() => marketplace.faqs(false)));

router.get('/trusted-clients/:id/logo', async (req: Request, res: Response) => {
    try {
        const logo = await marketplace.clientLogo(Number(req.params.id));
        if (!logo?.logo_data) return res.status(404).end();
        const etag = `\"${logo.logo_sha256}\"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.setHeader('Content-Type', logo.logo_mime);
        res.setHeader('Content-Length', String(logo.logo_data.length));
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('ETag', etag);
        return res.status(200).send(logo.logo_data);
    } catch { return res.status(404).end(); }
});

export default router;
