import express from 'express';
import WebsiteChatController from '../controllers/WebsiteChatController.js';

const router = express.Router();

router.post('/init', WebsiteChatController.initiateChat);
router.get('/unread-count', WebsiteChatController.getUnreadCount);
router.get('/:chatId/history', WebsiteChatController.getHistory);
router.post('/:chatId/close', WebsiteChatController.closeChat);

export default router;
