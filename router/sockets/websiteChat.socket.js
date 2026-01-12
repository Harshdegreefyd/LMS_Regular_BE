import WebsiteChatService from '../../service/WebsiteChatService.js';

export default (io) => {
  const chatNamespace = io.of('/website-chat');

  const chatRoomUsers = new Map();

  chatNamespace.on('connection', (socket) => {
    const { operatorId, role } = socket.handshake.query;
    const normalizedRole = role ? role.toLowerCase() : null;

    if (['supervisor', 'admin', 'analyser', 'superadmin'].includes(normalizedRole)) {
      socket.join('supervisors');
    }

    if (operatorId) {
      socket.join(operatorId);
    }
    console.log("socket?.rooms",socket?.rooms)
   
    socket.on('join_chat', async ({ chatId, userType }) => {
      if (!chatId) return;

     

      socket.join(chatId);

      if (!chatRoomUsers.has(chatId)) {
        chatRoomUsers.set(chatId, new Map());
      }

      const roomUsers = chatRoomUsers.get(chatId);

      const userKey =
        userType === 'Student'
          ? `student-${chatId}`
          : `operator-${operatorId}`;

      const resolvedRole =
        userType === 'Student'
          ? 'student'
          : normalizedRole || 'operator';

      if (!roomUsers.has(userKey)) {
        roomUsers.set(userKey, {
          userType,
          role: resolvedRole,
          operatorId: operatorId || null,
          sockets: new Set()
        });
      }

      const userSession = roomUsers.get(userKey);
      userSession.sockets.add(socket.id);

      socket.userInfo = { chatId, userType, userKey };

      const usersSnapshot = Array.from(roomUsers.values()).map(u => ({
        userType: u.userType,
        role: u.role,
        operatorId: u.operatorId,
        sockets: u.sockets.size
      }));
       console.log("logical user are connected in a same chat ",usersSnapshot)
       const isStudentAlreadyJoined=usersSnapshot.some((val)=>val.userType=='Student')
      chatNamespace.to(chatId).emit('user_joined', {
        joinedUser: userKey,
        users: usersSnapshot,
        timestamp: new Date()
      });
      if(userType!='Student' && isStudentAlreadyJoined)
      {
         chatNamespace.to(chatId).emit('user_status', {
          chatId,
          userType:"Student",
          status: 'online'
        });
      }
      if (userType === 'Student') {
        chatNamespace.to(chatId).emit('user_status', {
          chatId,
          userType,
          status: 'online'
        });

        chatNamespace.to(chatId).emit('messages_delivered', {
          chatId,
          userType: 'Student'
        });
      }
    });

    socket.on('join_dashboard', async ({ operatorId: reqOpId, role: reqRole }) => {
      try {
        const targetOpId = operatorId || reqOpId;
        const targetRole = role || reqRole;

        const chats = await WebsiteChatService.getChatsForOperator(
          targetOpId,
          targetRole
        );

        socket.emit('chat_list_update', chats);
      } catch (error) {
        console.error('Dashboard Fetch Error:', error);
      }
    });

   
    socket.on('send_message', async (data) => {
      try {
        const { chatId, content, senderType, senderId, senderName } = data;

        if (!chatRoomUsers.has(chatId)) return;

        const message = await WebsiteChatService.addMessage(
          chatId,
          senderType,
          senderId,
          content,
          senderName
        );

        let isDelivered = false;
        const roomUsers = chatRoomUsers.get(chatId);

        for (const session of roomUsers.values()) {
          if (
            (senderType === 'Operator' && session.userType === 'Student') ||
            (senderType === 'Student' && session.userType !== 'Student')
          ) {
            if (session.sockets.size > 0) {
              isDelivered = true;
              break;
            }
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
      const info = socket.userInfo;
      if (!info) return;

      const { chatId, userType, userKey } = info;
      const roomUsers = chatRoomUsers.get(chatId);
      if (!roomUsers) return;

      const session = roomUsers.get(userKey);
      if (!session) return;

      session.sockets.delete(socket.id);

      if (session.sockets.size === 0) {
        roomUsers.delete(userKey);

        if (userType === 'Student') {
          chatNamespace.to(chatId).emit('user_status', {
            chatId,
            userType,
            status: 'offline'
          });
        }
      }

      if (roomUsers.size === 0) {
        chatRoomUsers.delete(chatId);
        return;
      }

      const usersSnapshot = Array.from(roomUsers.values()).map(u => ({
        userType: u.userType,
        role: u.role,
        operatorId: u.operatorId,
        sockets: u.sockets.size
      }));

      chatNamespace.to(chatId).emit('presence_update', {
        users: usersSnapshot
      });
    });
  });
};
