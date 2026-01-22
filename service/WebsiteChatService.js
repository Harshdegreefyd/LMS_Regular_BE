import WebsiteChat from '../models/WebsiteChat.js';
import WebsiteChatMessage from '../models/WebsiteChatMessage.js';
import Counsellor from '../models/Counsellor.js';
import Student from '../models/Student.js';
import sequelize from '../config/database-config.js';
import redis from '../config/redis.js';
import { Op } from 'sequelize';
import { processStudentLead } from '../helper/leadAssignmentService.js';
class WebsiteChatService {

  static async initiateChat(studentData) {
    try {
      const { phone, name, email } = studentData;
      const requesteddata={
        phone_number:phone,...studentData}
      const leadResult = await processStudentLead(requesteddata);
      
      if (!leadResult.success) {
          throw new Error(leadResult.error || 'Failed to process student lead');
      }

      if (!this.isBusinessHours()) {
          return { isOffline: true, message: 'Our counsellors are currently offline.' };
      }

      const { student, assignedCounsellor } = leadResult;

      let chat = await WebsiteChat.findOne({
          where: {
              studentId: student.student_id,
              status: { [Op.notIn]: ['CLOSED_BY_STUDENT', 'CLOSED_BY_COUNSELLOR', 'AUTO_CLOSED', 'CLOSED'] } 
          },
          include: [{ model: Counsellor, required: false }]
      });

      if (chat) {
           return { isNew: false, chat };
      }
      chat = await WebsiteChat.create({
          studentId: student.student_id,
          studentName: student.student_name,
          studentPhone: student.student_phone,
          counsellorId: assignedCounsellor.counsellor_id,
          studentPlatformDetails: studentData,
          status: 'ACTIVE', 
          lastMessageAt: new Date(),
          unreadCountStudent: 0,
          unreadCountCounsellor: 0,
          display_name:assignedCounsellor.counsellor_name
      });

      const fullChat = await WebsiteChat.findByPk(chat.id, {
          include: [{ model: Counsellor }] 
      });
      fullChat.setDataValue('lastMessage', 'New Chat Started');

      await this.publishToStream('CHAT_CREATED', { chatId: chat.id });
      
      this.notifySupervisors('chat_created', fullChat.get({ plain: true }));
       this.notifyCounsellors('chat_assigned',chat.counsellorId,fullChat.get({ plain: true }));
      // if (global.io && chat.counsellorId) {
      //     console.log(`Socket Debug: Emitting chat_assigned to ${chat.counsellorId}`);
      //     global.io.of('/website-chat').to(chat.counsellorId).emit('chat_assigned', fullChat);
      // }

      return { isNew: true, chat: fullChat };

    } catch (error) {
      console.error('Error in initiateChat:', error);
      throw error;
    }
  }

  static async markMessagesAsRead(chatId, readerType) {
    try {
      const senderTypeToUpdate = readerType === 'Student' ? ['Operator', 'System'] : ['Student'];

      await WebsiteChatMessage.update({ 
        isRead: true,
        readAt: new Date()
      }, {
        where: {
          chatId,
          senderType: { [Op.in]: senderTypeToUpdate },
          isRead: false
        }
      });

      const updateData = readerType === 'Student' 
        ? { unreadCountStudent: 0 } 
        : { unreadCountCounsellor: 0 };
      
      await WebsiteChat.update(updateData, { where: { id: chatId } });

      const readEventData = { chatId, readerType, readAt: new Date() };
      await this.publishToStream('MESSAGES_READ', readEventData);
      
      if (global.io) {
          global.io.of('/website-chat').to(chatId).emit('messages_read', readEventData);
      }
    } catch (error) {
      console.error('Error marking read:', error);
    }
  }

  static async addMessage(chatId, senderType, senderUserId, content,senderName) {
    const t = await sequelize.transaction();
    try {
      const chat = await WebsiteChat.findByPk(chatId, { 
          include: [{ model: Counsellor }],
          transaction: t 
      });
      if (!chat) throw new Error('Chat not found');

      let displayName = '';
      let userID=senderUserId;
      if (senderType === 'Student') {
          displayName = chat.studentName;
            userID=chat.studentId;
      } else {
           displayName = senderName;
      }

      const message = await WebsiteChatMessage.create({
        chatId,
        senderType, 
        senderUserId:userID, 
        displayName,
        content,
        isRead: false
      }, { transaction: t });

      const updates = { lastMessageAt: new Date() };
      if (senderType === 'Student') {
          updates.unreadCountCounsellor = sequelize.literal('unread_count_counsellor + 1');
      } else {
          updates.unreadCountStudent = sequelize.literal('unread_count_student + 1');
      }
      
      await chat.update(updates, { transaction: t });
      
      await chat.reload({ transaction: t });

      await t.commit();

      const eventData = { 
          chatId, 
          messageId: message.id, 
          content, 
          senderType,
          displayName,
          createdAt: message.createdAt
      };

      await this.publishToStream('NEW_MESSAGE', eventData);

      this.notifySupervisors('chat_updated', { 
        chatId, 
        lastMessage: content, 
        lastMessageAt: new Date(),
        unreadCountStudent: chat.unreadCountStudent,
        unreadCountStudent: chat.unreadCountStudent,
        unreadCountCounsellor: chat.unreadCountCounsellor
      });

      this.notifyGlobalListeners({
          chatId,
          studentName: chat.studentName,
          studentPhone: chat.studentPhone,
          counsellorId: chat.counsellorId,
          messageContent: content,
          senderType,
          unreadCountCounsellor: chat.unreadCountCounsellor
      });

      return message;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }


  static async getChatHistory(chatId, limit = 1000, offset = 0, aggregated = false) {
      if (!aggregated) {
          return await WebsiteChatMessage.findAll({
              where: { chatId },
              order: [['createdAt', 'ASC']],
              limit,
              offset
          });
      }

      try {
        const currentChat = await WebsiteChat.findByPk(chatId);

        if (!currentChat || !currentChat.studentId) {
            return await WebsiteChatMessage.findAll({
                where: { chatId },
                order: [['createdAt', 'ASC']],
                limit,
                offset
            });
        }

        const allStudentChats = await WebsiteChat.findAll({
            where: { studentId: currentChat.studentId },
            attributes: ['id']
        });
        const allChatIds = allStudentChats.map(c => c.id);

        if (allChatIds.length === 0) {
             return [];
        }

        return await WebsiteChatMessage.findAll({
            where: { chatId: { [Op.in]: allChatIds } },
            order: [['createdAt', 'ASC']],
            limit,
            offset: 0 
        });
      } catch (error) {
          console.error('getChatHistory Error:', error);
          return await WebsiteChatMessage.findAll({
                where: { chatId },
                order: [['createdAt', 'ASC']],
                limit,
                offset
          });
      }
  }


  static async getChatsForOperator(operatorId, role) {
      try {
          let whereClause = {};

          const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';

          if (['Supervisor', 'Admin', 'Analyser'].includes(normalizedRole)) {
               whereClause = {}; 
          } else {
               whereClause = { counsellorId: operatorId };
          }

          const allChats = await WebsiteChat.findAll({
              where: whereClause,
              order: [['lastMessageAt', 'DESC']],
              limit: 500
          });
          
          const studentMap = new Map();
          
          allChats.forEach(chat => {
              if (!chat.studentId) return;
              
              const existing = studentMap.get(chat.studentId);
              
              if (!existing) {
                  studentMap.set(chat.studentId, chat);
              } else {
                
                  const isExistingActive = existing.status === 'ACTIVE';
                  const isNewActive = chat.status === 'ACTIVE';
                  
                  if (isNewActive && !isExistingActive) {
                      studentMap.set(chat.studentId, chat);
                  } else if (isNewActive === isExistingActive) {
                      if (new Date(chat.lastMessageAt) > new Date(existing.lastMessageAt)) {
                          studentMap.set(chat.studentId, chat);
                      }
                  }
              }
          });
          
          return Array.from(studentMap.values()).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

      } catch (error) {
          console.error('Error fetching dashboard chats:', error);
          return [];
      }
  }


  static notifySupervisors(event, data) {
    if (global.io) {
      global.io.of('/website-chat').to('supervisors').emit(event, data);
          if (global.io && event !== 'chat_updated') {
          global.io.to('all_supervisors').emit('global_chat_notification', {
              event,
              data: {
                  ...data,
                  type: 'website_chat', 
                  title: event === 'chat_created' ? 'New Chat Started' : 'Chat Closed',
                  message: event === 'chat_created' 
                      ? `${data.studentName || 'Student'} started a new chat` 
                      : `Chat with ${data.studentName || 'Student'} was closed`
              }
          });
      }
    }
  }
    static notifyCounsellors(event, id, data) {
    if (global.io) {
      global.io.of('/website-chat').to(id).emit(event, data);
      if(event=='chat_closed')
      {

      
      global.io.to('all_supervisors').emit('global_chat_notification', {
        event,
        data: {
            ...data,
            type: 'website_chat',
            title: 'Chat Assigned',
            message: `New chat assigned with ${data.studentName || 'Student'}`
        }
      });
    }
    }
  }
  static notifyGlobalListeners(data) {
      if (global.io) {
          const ns = global.io.of('/website-chat');
          
           if (data.senderType === 'Student') {
              ns.to('supervisors').emit('global_message_notification', {
                  ...data,
                  forRole: 'supervisor'
              });

              if (data.counsellorId) {
                 ns.to(data.counsellorId).emit('global_message_notification', {
                     ...data,
                     forRole: 'counsellor'
                 });
              }
          }
      }
  }
  static async publishToStream(event, data) {
      try {
         
          await redis.xadd('website_chat:stream', '*', 
              'event', event,
              'data', JSON.stringify(data)
          );
      } catch (err) {

          console.error('Redis Stream Publish Error:', err);
      }
  }

  static async closeChat(chatId, operatorId, role, reason) {
      try {
          const chat = await WebsiteChat.findByPk(chatId);
          if (!chat) throw new Error('Chat not found');

          const closedBy = role === 'Student' ? 'STUDENT' : 'COUNSELLOR';
          const newStatus = role === 'Student' ? 'CLOSED_BY_STUDENT' : 'CLOSED_BY_COUNSELLOR';
          await chat.update({
              status: newStatus,
              closedBy: operatorId || 'SYSTEM',
              closedReason: reason || 'Ended by user',
              updatedAt: new Date()
          });

          await this.publishToStream('CHAT_CLOSED', { chatId, closedBy });
          
          if (global.io) {
               global.io.of('/website-chat').to(chatId).emit('chat_closed', { closedBy, chatId,name:chat.studentName  });
          }
          
          return { success: true };
      } catch (error) {
          console.error('Error closing chat:', error);
          throw error;
      }
      }


  static async getUnreadCount(operatorId, role) {
      try {
          const normalizedRole = role ? role.toLowerCase() : '';
          console.log(`Getting unread count for Role: ${normalizedRole}, ID: ${operatorId}`);

          let whereClause = {
              status: {
                  [Op.or]: ['ACTIVE', 'CLOSED_BY_STUDENT', 'CLOSED_BY_COUNSELLOR', 'AUTO_CLOSED']
              }
          };

          if (normalizedRole === 'counsellor' || normalizedRole === 'agent') {
              whereClause[Op.and] = [
                  { counsellorId: operatorId },
                  { unreadCountCounsellor: { [Op.gt]: 0 } }
              ];
              return await WebsiteChat.count({ where: whereClause });
          } else if (['supervisor', 'admin', 'analyser', 'superadmin'].includes(normalizedRole)) {
              whereClause.unreadCountCounsellor = { [Op.gt]: 0 };
              return await WebsiteChat.count({ where: whereClause });
          }
          
          return 0;
      } catch (error) {
          console.error('Error getting unread count:', error);
          throw error;
      }
  }



static isBusinessHours() {
  const istTime = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );

  const hours = istTime.getHours();
  return hours >= 9 && hours < 24;
}


}

export default WebsiteChatService;
