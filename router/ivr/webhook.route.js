import express from 'express';
import { handleWebhook } from '../../controllers/ivr/webhook.controller.js';

const router = express.Router();

router.get('/', handleWebhook);

export default router;
