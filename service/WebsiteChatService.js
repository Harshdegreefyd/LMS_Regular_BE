import WebsiteChat from '../models/WebsiteChat.js';
import WebsiteChatMessage from '../models/WebsiteChatMessage.js';
import Counsellor from '../models/Counsellor.js';
import Student from '../models/Student.js';
import sequelize from '../config/database-config.js';
import redis from '../config/redis.js';
import { Op } from 'sequelize';
import { processStudentLead } from '../helper/leadAssignmentService.js';

const STREAM_KEY = 'regular_website_chat:stream';
const REDIS_TTL = 60 * 60 * 24 * 7; 

class WebsiteChatService {

  static getKeys(chatId) {
    return {
      unread: `chat:${chatId}:unread`,
      lastMsg: `chat:${chatId}:last_message`,
      meta: `chat:${chatId}:meta`
    };
  }

  static getTimelineKeys(counsellorId) {
    return {
      global: 'regular:timeline:global',
      counsellor: `regular:timeline:counsellor:${counsellorId}`
    };
  }

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

      // Initialize Redis Timeline
      const timestamp = Date.now();
      const timelines = this.getTimelineKeys(chat.counsellorId);
      await redis.pipeline()
        .zadd(timelines.global, timestamp, chat.id)
        .zadd(timelines.counsellor, timestamp, chat.id)
        .exec();

      await redis.expire(`chat:${chat.id}:last_message`, REDIS_TTL);

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

      const chat = await WebsiteChat.findByPk(chatId, { attributes: ['counsellorId', 'unreadCountCounsellor', 'unreadCountStudent'] });

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

      const keys = this.getKeys(chatId);
      const field = readerType === 'Student' ? 'student' : 'counsellor';
      await redis.hset(keys.unread, field, 0);

      const updateData = readerType === 'Student' 
        ? { unreadCountStudent: 0 } 
        : { unreadCountCounsellor: 0 };
        
      if (readerType !== 'Student') {
            const countToDecr = (chat && chat.unreadCountCounsellor) ? parseInt(chat.unreadCountCounsellor) : 0;
            
            if (countToDecr > 0) {
                 if (chat && chat.counsellorId) {
                      const statsKey = `user:${chat.counsellorId}:stats`;
                      await redis.hincrby(statsKey, 'unread_count', -countToDecr);
                 }
                 await redis.hincrby('stats:global', 'unread_count', -countToDecr);
            }
      }
      
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
    try {
      
      const chat = await WebsiteChat.findByPk(chatId, { 
          include: [{ model: Counsellor }] 
      });
              console.log(`Chat found for ID: ${chatId} type: ${typeof chatId}`);

      if (!chat) {
        console.error(`Chat not found for ID: ${chatId} type: ${typeof chatId}`);
        throw new Error(`Chat not found for ID: ${chatId}`);
      }

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
      });

      const updateData = {
          lastMessageAt: new Date(),
          lastMessage: content
      };

      if (senderType === 'Student') {
          updateData.unreadCountCounsellor = (chat.unreadCountCounsellor || 0) + 1;
      } else {
          updateData.unreadCountStudent = (chat.unreadCountStudent || 0) + 1;
      }
      console.log('Updating chat with data:', updateData);

      await chat.update(updateData);

      const keys = this.getKeys(chatId);
      const timelines = this.getTimelineKeys(chat.counsellorId);
      const timestamp = Date.now();
      const targetField = senderType === 'Student' ? 'counsellor' : 'student';

      const pipeline = redis.pipeline();
      
      pipeline.hincrby(keys.unread, targetField, 1);
      
      pipeline.hmset(keys.lastMsg, {
        content: content.substring(0, 100),
        createdAt: new Date().toISOString(),
        senderName: displayName
      });
      // FIX 2: Stop TTL reset spam
      // pipeline.expire(keys.lastMsg, REDIS_TTL);
      // pipeline.expire(keys.unread, REDIS_TTL); 
      
      if (senderType === 'Student' && chat.counsellorId) {
          const statsKey = `user:${chat.counsellorId}:stats`;
          pipeline.hincrby(statsKey, 'unread_count', 1);
      } 
      if (senderType === 'Student') {
          pipeline.hincrby('stats:global', 'unread_count', 1);
      } 

      pipeline.zadd(timelines.global, timestamp, chatId);
      if (chat.counsellorId) {
        pipeline.zadd(timelines.counsellor, timestamp, chatId);
      }

      const results = await pipeline.exec();
      const newUnreadCount = results[0][1];

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
        unreadCountStudent: senderType === 'Operator' ? newUnreadCount : 0, 
        unreadCountCounsellor: senderType === 'Student' ? newUnreadCount : 0
      });

      this.notifyGlobalListeners({
          chatId,
          studentName: chat.studentName,
          studentPhone: chat.studentPhone,
          counsellorId: chat.counsellorId,
          messageContent: content,
          senderType,
          unreadCountCounsellor: senderType === 'Student' ? newUnreadCount : 0
      });

      return message;
    } catch (error) {
      console.error('addMessage Error:', error);
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
        const normalizedRole = role ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() : '';
        const isSupervisor = ['Supervisor', 'Admin', 'Analyser'].includes(normalizedRole);

        let whereClause = {};
        if (!isSupervisor) {
            whereClause = { counsellorId: operatorId };
        }
        
        let subQueryWhere = '';
        if (!isSupervisor) {
             subQueryWhere = `WHERE counsellor_id = '${operatorId}'`;
        }

        const dbChats = await WebsiteChat.findAll({
            where: {
                ...whereClause,
                id: {
                    [Op.in]: sequelize.literal(`(
                        SELECT id FROM (
                            SELECT id, ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY last_message_at DESC) as rn 
                            FROM website_chats 
                            ${subQueryWhere}
                        ) t WHERE rn = 1
                    )`)
                }
            },
            include: [{ model: Counsellor, required: false }],
            order: [['lastMessageAt', 'DESC']],
            limit: 100
        });

        if (dbChats.length === 0) return [];
        console.log(`Fetched ${dbChats.length} chats from DB for operatorId: ${operatorId}, role: ${role}`);
        const enrichedChats = dbChats.map((chat) => {
            const chatJSON = chat.toJSON();
            
             const redisUnreadStudent = chat.unreadCountStudent || 0;
            const redisUnreadCounsellor = chat.unreadCountCounsellor || 0;
            
            const lastMessageAt = chatJSON.lastMessageAt;
            const lastMessage = chatJSON.lastMessage;
            const senderName = chatJSON.senderName; 

            return {
                ...chatJSON,
                unreadCountStudent: redisUnreadStudent,
                unreadCountCounsellor: redisUnreadCounsellor,
                lastMessageAt: lastMessageAt,
                lastMessageAtDate: new Date(lastMessageAt),
                lastMessage: lastMessage,
                senderName: senderName
            };
        });



        const studentMap = new Map();
        enrichedChats.forEach(chat => {
            if (!chat.studentId) return;
            const existing = studentMap.get(chat.studentId);
            
            if (!existing) {
                studentMap.set(chat.studentId, chat);
            } else {
                 if (chat.lastMessageAtDate > existing.lastMessageAtDate) {
                    studentMap.set(chat.studentId, chat);
                }
            }
        });
        
        const finalChats = Array.from(studentMap.values()).sort((a, b) => b.lastMessageAtDate - a.lastMessageAtDate);

        return finalChats;

    } catch (error) {
        console.error('Error fetching dashboard chats:', error);
        return [];
    }
}


 static notifySupervisors(event, data) {
    console.log(`Notifying supervisors of event: ${event}`,global.io? 'Socket.io available':'Socket.io not available');
    if (global.io) {
      global.io.of('/website-chat').to('supervisors').emit(event, data);

      if(event==='chat_created' || event==='chat_assigned')
      {
    global.io.to('all_supervisors').emit('global_chat_notification', {
        eventType: event,
        ...data
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
          await redis.xadd(STREAM_KEY, 'MAXLEN', '~', 1000, '*', 
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

          const keys = this.getKeys(chatId);
          const timelines = this.getTimelineKeys(chat.counsellorId);
          
          const pipeline = redis.pipeline();
          
          pipeline.zrem(timelines.global, chatId);
          if (chat.counsellorId) {
            pipeline.zrem(timelines.counsellor, chatId);
          }
          pipeline.del(keys.unread, keys.lastMsg, keys.meta);
          
          await pipeline.exec();

          await this.publishToStream('CHAT_CLOSED', { chatId, closedBy });
          
          if (global.io) {
               global.io.of('/website-chat').to(chatId).emit('chat_closed', { closedBy, chatId,name:chat.studentName  });
            //    if (chat.counsellorId) {
            //        this.notifyCounsellors('chat_closed', chat.counsellorId, { closedBy, chatId, name: chat.studentName });
            //    }
            //    this.notifySupervisors('chat_closed', { closedBy, chatId, name: chat.studentName });
        
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
          let timelineKey = null;
          let targetField = 'counsellor'; 

          if (normalizedRole === 'counsellor' || normalizedRole === 'agent') {
              const statsKey = `user:${operatorId}:stats`;
              const cachedCount = await redis.hget(statsKey, 'unread_count');
              return parseInt(cachedCount) || 0;

          } else if (['supervisor', 'admin', 'analyser', 'superadmin'].includes(normalizedRole)) {
              const statsKey = 'stats:global';
              const cachedCount = await redis.hget(statsKey, 'unread_count');
              if (cachedCount === null) {
                  await redis.hset(statsKey, 'unread_count', 0);
                  return 0;
              }
              return parseInt(cachedCount) || 0;
          } else {
              return 0;
          }

      } catch (error) {
          console.error('Error getting exact unread count from Redis:', error);
          return 0;
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
