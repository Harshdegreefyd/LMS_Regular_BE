import WebsiteChatService from '../../service/WebsiteChatService.js';

export default (io) => {
  const chatNamespace = io.of('/website-chat'); 

  const chatRoomUsers = new Map();

  chatNamespace.on('connection', (socket) => {
    const { operatorId, role } = socket.handshake.query;

    const normalizedRole = role ? role.toLowerCase() : '';
    
    if (['supervisor', 'admin', 'analyser', 'superadmin'].includes(normalizedRole)) {
        socket.join('supervisors');
    }
    
    if (operatorId) {
        socket.join(operatorId);
    }

    socket.on('join_chat', async ({ chatId, userType }) => {
      if (!chatId) return;
      socket.join(chatId);
    
      if (!chatRoomUsers.has(chatId)) chatRoomUsers.set(chatId, new Set());
      chatRoomUsers.get(chatId).add(socket.id);

      socket.userInfo = { chatId, userType };

      const timestamp = new Date();
      chatNamespace.to(chatId).emit('user_joined', { userType, timestamp });

      if (userType === 'Student') {
          chatNamespace.to(chatId).emit('user_status', { chatId, userType, status: 'online' });
          chatNamespace.to(chatId).emit('messages_delivered', { chatId, userType: 'Student' });
      }
    });

    socket.on('join_dashboard', async ({ operatorId: reqOpId, role: reqRole }) => {
        try {
            const targetOpId = operatorId || reqOpId; 
            const targetRole = role || reqRole;

            
            const chats = await WebsiteChatService.getChatsForOperator(targetOpId, targetRole);
            
            socket.emit('chat_list_update', chats);
        } catch (error) {
            console.error('Dashboard Fetch Error:', error);
        }
    });

    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, senderType, senderId,senderName } = data;
        
        const message = await WebsiteChatService.addMessage(chatId, senderType, senderId, content,senderName);
        
        let isDelivered = false;
        if (senderType === 'Operator') {
             const roomSockets = chatNamespace.adapter.rooms.get(chatId);
             if (roomSockets && roomSockets.size > 1) {
                 isDelivered = true;
             }
        }
        chatNamespace.to(chatId).emit('new_message', {
          id: message.id,
          chatId,
          content,
          senderType,
          createdAt: message.createdAt,
          isDelivered 
        });

      } catch (error) {
        console.error('Socket Message Error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('typing', ({ chatId, isTyping, userType }) => {
      socket.to(chatId).emit('typing_status', { chatId, isTyping, userType });
    });

    socket.on('mark_read', async ({ chatId, userType }) => {
        try {
            await WebsiteChatService.markMessagesAsRead(chatId, userType);
        } catch (error) {
            console.error('Mark Read Error:', error);
        }
    });

    socket.on('disconnect', () => {
      
      if (socket.userInfo) {
          const { chatId, userType } = socket.userInfo;
           
          if (chatRoomUsers.has(chatId)) {
              chatRoomUsers.get(chatId).delete(socket.id);
              if (chatRoomUsers.get(chatId).size === 0) chatRoomUsers.delete(chatId);
          }

          if (userType === 'Student') {
              chatNamespace.to(chatId).emit('user_status', { chatId, userType, status: 'offline' });
          }
      }
    });
  });
};
