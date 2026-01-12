// routes/metaAdsRoutes.js (ES module format)
import express from 'express';
import { Webhook, PostWebhook, Manual1} from '../../controllers/Meta_Ads/ads.js';
import { PostWebhook as universityAdmitWebhook,Webhook as HandShakeProtocal_of_univeristy_admit } from '../../controllers/Meta_Ads/university_admit.js';
const router = express.Router();

router.post('/webhook', PostWebhook);
router.post("/webhook/university-admit", universityAdmitWebhook);
router.get('/webhook', Webhook);
router.get("/webhook/university-admit", HandShakeProtocal_of_univeristy_admit);
router.post('/manual', Manual1);


export default router;
