import express from 'express';
import {
  getTemplates,
  getTemplateById,
  sendWhatsAppTemplate,
  sendSessionMessage,
  handleCallback,
  getMessages,
  getAllChats,
  getMessagesFromPerspective,
  markMessagesAsRead,
  getUnreadMessages
} from '../controllers/watsaapChat.controller.js';

const router = express.Router();

// Template Management Routes
router.post('/getTemplates', getTemplates);
router.post('/getTemplatesById', getTemplateById);

// Message Sending Routes
router.post('/send-media-template', sendWhatsAppTemplate);
router.post('/send-session-message', sendSessionMessage);

// Callback Handling
router.get('/whatsappCallbackurl/icscallback', handleCallback);

// Chat Management Routes
router.post('/getMessages', getMessages);
router.post('/getAllChats', getAllChats);
router.post('/getMessagesFromPerspective', getMessagesFromPerspective);

// Read Status Management Routes
router.post('/markMessagesAsRead', markMessagesAsRead);
router.post('/getUnreadMessages', getUnreadMessages);

export default router;