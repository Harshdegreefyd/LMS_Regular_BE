import express from 'express';
import { Postwebhook,Func1Controller } from '../../controllers/google-ads/google-webhook.js';

const router = express.Router();

router.post('/google-webhook', Postwebhook);
router.post('/manual',Func1Controller)
router.get('/', (req, res) => {
    res.send('Google Webhook Route');
});

export default router;
