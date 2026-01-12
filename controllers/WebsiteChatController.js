import WebsiteChatService from '../service/WebsiteChatService.js';

class WebsiteChatController {
  
  static async initiateChat(req, res) {
    try {
      const { phone, name, email, ...otherDetails } = req.body;
      if (!phone || !name) {
        return res.status(400).json({ success: false, message: 'Phone and Name are required' });
      }

      const result = await WebsiteChatService.initiateChat({ 
        phone, name, email, ...otherDetails 
      });

      if (result.isOffline) {
          return res.status(200).json({ 
              success: false, 
              isOffline: true, 
              message: result.message 
          });
      }

      const { isNew, chat } = result;

      res.status(200).json({ 
        success: true, 
        data: chat, 
        message: isNew ? 'Chat initiated' : 'Chat resumed' 
      });
    } catch (error) {
      console.error('Controller Error:', error);
      res.status(500).json({ success: false, message: 'Failed to initiate chat' });
    }
  }

  static async getHistory(req, res) {
    try {
      const { chatId } = req.params;
      const aggregated = req.query.aggregated === 'true';
      const history = await WebsiteChatService.getChatHistory(chatId, 1000, 0, aggregated);
      res.status(200).json({ success: true, data: history });
    } catch (error) {
      console.error('Controller Error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch history' });
    }
  }

  static async closeChat(req, res) {
      try {
          const { chatId } = req.params;
          const { operatorId, role, reason } = req.body;
          await WebsiteChatService.closeChat(chatId, operatorId, role, reason);
          res.status(200).json({ success: true, message: 'Chat closed successfully' });
      } catch (error) {
          console.error('Controller Error:', error);
          res.status(500).json({ success: false, message: 'Failed to close chat' });
      }
  }

  static async getUnreadCount(req, res) {
      try {
          const { operatorId, role } = req.query;
          if (!operatorId || !role) {
             return res.status(400).json({ success: false, message: 'OperatorId and Role required' });
          }
          const count = await WebsiteChatService.getUnreadCount(operatorId, role);
          res.status(200).json({ success: true, data: { count } });
      } catch (error) {
          console.error('Controller Error:', error);
          res.status(500).json({ success: false, message: 'Failed to get unread count' });
      }
  }
}

export default WebsiteChatController;
