import { createServer } from 'http';
import { Server } from 'socket.io';
import { configDotenv } from 'dotenv';
import app from './app.js';
import databaseConnection from './config/database-connection.js';
import { Counsellor, Student } from './models/index.js';
import manageWebsiteChat from './router/sockets/websiteChat.socket.js';
import redis from './config/redis.js';
import CallbackNotificationService from './service/CallbackNotificationService.js';
import { createAdapter } from '@socket.io/redis-adapter';

configDotenv();
databaseConnection();

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://lms.degreefyd.com', 'https://testing-lms.degreefyd.com', 'https://lms-api-test.degreefyd.com'],
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 120000,
  pingInterval: 45000,
  connectTimeout: 60000,
  upgradeTimeout: 30000,
  allowEIO3: true,
  maxHttpBufferSize: 1e8,
  cookie: false,
  serveClient: false,
  connectionStateRecovery: {
    maxDisconnectionDuration: 5 * 60 * 1000,
    skipMiddlewares: true,
  },
  allowUpgrades: true,
  perMessageDeflate: false,
});

const pubClient = redis.duplicate();
const subClient = redis.duplicate();

io.adapter(createAdapter(pubClient, subClient));
console.log('Socket.IO Redis adapter enabled');

global.connectedCounsellors = new Map();

const callbackNotificationService = new CallbackNotificationService(io);
callbackNotificationService.init();

class WhatsAppNotificationService {
  constructor(io) {
    this.io = io;
    this.redis = redis;
  }

  async init() {
    console.log('WhatsApp Notification Service initialized');
    manageWebsiteChat(this.io);
    return this;
  }

  async sendWhatsAppNotification(studentPhone, messageData, counsellorId) {
    try {
      let student = null;
      try {
        student = await Student.findOne({
          where: { student_phone: studentPhone },
          attributes: ['student_id', 'student_name', 'student_phone']
        });
      } catch (err) {}

      const notification = {
        id: `whatsapp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'whatsapp_message',
        student_phone: studentPhone,
        student_id: student?.student_id,
        student_name: student?.student_name || 'Unknown Student',
        message: messageData.replymessage,
        waba_number: messageData.wabanumber,
        timestamp: new Date().toISOString(),
        counsellorId: counsellorId,
        persistent: true,
        priority: 'high',
        icon: '💬',
        _alreadyProcessed: false
      };

      const sent = await this.sendViaWebSocket(counsellorId, notification, 'whatsapp_notification');

      if (sent) {
        notification._alreadySent = true;
        return true;
      } else {
        await this.storePendingNotification(counsellorId, notification, 'whatsapp');
        return true;
      }
    } catch (error) {
      return false;
    }
  }

  async sendViaWebSocket(userId, notification, eventName) {
    try {
      let userData = await this.redis.hget('connected:counsellors', userId);
      let userType = 'counsellor';

      if (!userData) {
        userData = await this.redis.hget('connected:supervisors', userId);
        userType = 'supervisor';
      }

      if (userData) {
        userData = JSON.parse(userData);

        if (userData.socketId) {
          this.io.to(userData.socketId).emit(eventName, notification);

          userData.lastSeen = new Date().toISOString();
          const userDataString = JSON.stringify(userData);

          if (userType === 'counsellor') {
            await this.redis.hset('connected:counsellors', userId, userDataString);
          } else {
            await this.redis.hset('connected:supervisors', userId, userDataString);
          }

          return true;
        }
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  async storePendingNotification(userId, notification, type) {
    const pendingKey = `pending:${userId}`;
    const notificationWithType = {
      ...notification,
      _type: type,
      _storedAt: Date.now()
    };

    const pendingList = await this.redis.lrange(pendingKey, 0, -1);
    const exists = pendingList.some(item => {
      const parsed = JSON.parse(item);
      return parsed.id === notification.id;
    });

    if (!exists) {
      await this.redis.rpush(pendingKey, JSON.stringify(notificationWithType));
      await this.redis.ltrim(pendingKey, -50, -1);
      await this.redis.expire(pendingKey, 7 * 24 * 60 * 60);
      return true;
    }

    return false;
  }

  async getPendingNotifications(userId) {
    const pendingKey = `pending:${userId}`;
    const notifications = await this.redis.lrange(pendingKey, 0, -1);
    return notifications.map(n => JSON.parse(n));
  }

  async clearPendingNotifications(userId) {
    const pendingKey = `pending:${userId}`;
    await this.redis.del(pendingKey);
  }
}

class NotificationService {
  constructor(io) {
    this.io = io;
    this.redis = redis;
    this.whatsAppService = new WhatsAppNotificationService(io);
  }

  async init() {
    await this.whatsAppService.init();
    return this;
  }

  async sendLeadNotification(counsellorId, student, studentStatus) {
    try {
      const leadKey = `lead_${student.student_id || student.id}_${Date.now()}`;

      if (await this.isRecentDuplicate(leadKey)) {
        return;
      }

      const isPremium = student.source === 'Google_Lead_Form' || student.source === 'Google_Lead_Form_New';

      const notification = {
        id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'new_lead',
        student_id: student.student_id || student.id,
        student_name: student.student_name || student.name || 'New Lead',
        student_phone: student.student_phone || student.phone || 'N/A',
        source: student.source || 'Unknown',
        notification_type: isPremium ? 'premium_lead' : 'regular_lead',
        priority: isPremium ? 'high' : 'medium',
        icon: isPremium ? '🎯' : '📝',
        timestamp: new Date().toISOString(),
        studentStatus: studentStatus || 'new',
        counsellorId: counsellorId,
        is_premium: isPremium,
        persistent: true
      };

      const sentToCounsellor = await this.whatsAppService.sendViaWebSocket(counsellorId, notification, 'new_lead');

      if (!sentToCounsellor) {
        await this.storePendingNotification(counsellorId, notification, 'lead');
      }

      try {
        const counsellor = await Counsellor.findOne({
          where: { counsellor_id: counsellorId },
          attributes: ['counsellor_id', 'assigned_to']
        });

        if (counsellor && counsellor.assigned_to && counsellor.assigned_to !== counsellorId) {
          const supervisorId = counsellor.assigned_to;

          const supervisorNotification = {
            ...notification,
            is_supervisor_copy: true,
            assigned_counsellor_id: counsellorId,
            counsellor_name: 'Counsellor'
          };

          const sentToSupervisor = await this.whatsAppService.sendViaWebSocket(supervisorId, supervisorNotification, 'new_lead');

          if (!sentToSupervisor) {
            await this.storePendingNotification(supervisorId, supervisorNotification, 'lead');
          }
        }
      } catch (dbError) {}

      await this.markMessageAsProcessed(leadKey);
      return notification;

    } catch (error) {
      return null;
    }
  }

  async sendWhatsAppNotification(studentPhone, messageData, counsellorId) {
    return await this.whatsAppService.sendWhatsAppNotification(studentPhone, messageData, counsellorId);
  }

  async sendToSupervisorRoom(supervisorId, notificationData) {
    try {
      const notification = {
        id: `supervisor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'supervisor_message',
        ...notificationData,
        timestamp: new Date().toISOString(),
        persistent: true,
        priority: 'medium',
        icon: '👨‍💼'
      };

      this.io.to(`supervisor_room_${supervisorId}`).emit('supervisor_notification', notification);
      return true;
    } catch (error) {
      return false;
    }
  }

  async broadcastToAllSupervisors(notificationData) {
    try {
      const notification = {
        id: `supervisor_broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'supervisor_broadcast',
        ...notificationData,
        timestamp: new Date().toISOString(),
        persistent: true,
        priority: 'medium',
        icon: '📢'
      };

      this.io.to('all_supervisors').emit('supervisor_broadcast', notification);
      return true;
    } catch (error) {
      return false;
    }
  }

  async getOnlineSupervisors() {
    const supervisorsHash = await this.redis.hgetall('connected:supervisors');
    const supervisors = [];

    for (const [id, data] of Object.entries(supervisorsHash)) {
      supervisors.push({
        supervisor_id: id,
        ...JSON.parse(data)
      });
    }

    return supervisors;
  }

  async getOnlineCounsellors() {
    const counsellorsHash = await this.redis.hgetall('connected:counsellors');
    const counsellors = [];

    for (const [id, data] of Object.entries(counsellorsHash)) {
      counsellors.push({
        counsellor_id: id,
        ...JSON.parse(data)
      });
    }

    return counsellors;
  }

  async isRecentDuplicate(messageKey) {
    const lastTime = await this.redis.get(`recent:${messageKey}`);
    if (!lastTime) return false;
    return (Date.now() - parseInt(lastTime)) < 10000;
  }

  async markMessageAsProcessed(messageKey) {
    await this.redis.set(`recent:${messageKey}`, Date.now(), 'EX', 30);
  }

  async storePendingNotification(userId, notification, type) {
    return await this.whatsAppService.storePendingNotification(userId, notification, type);
  }

  async sendPendingNotifications(userId, socketId) {
    const pending = await this.whatsAppService.getPendingNotifications(userId);

    if (pending.length > 0) {
      const leads = pending.filter(n => n._type === 'lead');
      const whatsappNotifs = pending.filter(n => n._type === 'whatsapp');

      if (leads.length > 0) {
        setTimeout(() => {
          this.io.to(socketId).emit('lead_pending_notifications', {
            count: leads.length,
            notifications: leads
          });
        }, 300);
      }

      if (whatsappNotifs.length > 0) {
        setTimeout(() => {
          this.io.to(socketId).emit('whatsapp_pending_notifications', {
            count: whatsappNotifs.length,
            notifications: whatsappNotifs
          });
        }, 500);
      }

      await this.whatsAppService.clearPendingNotifications(userId);
    }
  }

  async registerUserConnection(userId, userData, role) {
    const key = role === 'supervisor' ? 'connected:supervisors' : 'connected:counsellors';
    await this.redis.hset(key, userId, JSON.stringify(userData));
    
    if (role === 'counsellor') {
      global.connectedCounsellors.set(userId, userData);
    }
  }

  async removeUserConnection(userId, role) {
    const key = role === 'supervisor' ? 'connected:supervisors' : 'connected:counsellors';
    await this.redis.hdel(key, userId);
    
    if (role === 'counsellor') {
      global.connectedCounsellors.delete(userId);
    }
  }

  async getUserConnection(userId) {
    let userData = await this.redis.hget('connected:counsellors', userId);
    if (userData) return { ...JSON.parse(userData), role: 'counsellor' };

    userData = await this.redis.hget('connected:supervisors', userId);
    if (userData) return { ...JSON.parse(userData), role: 'supervisor' };

    return null;
  }
}

const notificationService = new NotificationService(io);
notificationService.init().then(() => {
  global.notificationService = notificationService;
  global.whatsAppNotificationService = notificationService.whatsAppService;
  global.sendLeadNotification = (counsellorId, student, studentStatus) => {
    return notificationService.sendLeadNotification(counsellorId, student, studentStatus);
  };
});

io.on('connection', (socket) => {
  const userData = {
    socketId: socket.id,
    userId: null,
    role: null,
    connectedAt: new Date().toISOString(),
    lastSeen: new Date().toISOString(),
    pingCount: 0,
    transport: socket.conn.transport.name,
    sessionId: null
  };

  socket.on('heartbeat', (data) => {
    userData.lastSeen = new Date().toISOString();
    socket.emit('heartbeat-ack', {
      timestamp: data.timestamp,
      serverTime: Date.now()
    });
  });

  socket.on('counsellor-login', async (data) => {
    const { counsellorId, role, sessionId } = data;

    if (!counsellorId) {
      socket.emit('login-error', { message: 'Missing counsellor ID' });
      return;
    }

    try {
      userData.userId = counsellorId;
      userData.role = role.toLowerCase();
      userData.sessionId = sessionId || 'unknown';
      userData.lastSeen = new Date().toISOString();

      const existingConnection = await notificationService.getUserConnection(counsellorId);

      if (existingConnection && existingConnection.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(existingConnection.socketId);
        if (oldSocket) {
          oldSocket.emit('multiple-tabs-detected', {
            message: 'Multiple tabs detected',
            newSocketId: socket.id
          });
        }
      }

      if (role === "Supervisor" || role === "supervisor") {
        await notificationService.registerUserConnection(counsellorId, userData, 'supervisor');

        socket.join(`supervisor_room_${counsellorId}`);
        socket.join('all_supervisors');

        const [onlineSupervisors, onlineCounsellors] = await Promise.all([
          notificationService.getOnlineSupervisors(),
          notificationService.getOnlineCounsellors()
        ]);

        socket.emit('supervisor-login-success', {
          message: 'Supervisor connected successfully',
          supervisorId: counsellorId,
          role: role,
          socketId: socket.id,
          transport: userData.transport,
          serverTime: Date.now(),
          onlineSupervisors,
          onlineCounsellors
        });

        socket.to('all_supervisors').emit('supervisor-online', {
          supervisorId: counsellorId,
          socketId: socket.id,
          connectedAt: userData.connectedAt
        });

      } else {
        await notificationService.registerUserConnection(counsellorId, userData, 'counsellor');
        socket.join(`counsellor_${counsellorId}`);

        await notificationService.sendPendingNotifications(counsellorId, socket.id);

        socket.emit('login-success', {
          message: 'Connected successfully',
          counsellorId,
          role,
          socketId: socket.id,
          transport: userData.transport,
          serverTime: Date.now()
        });

        io.to('all_supervisors').emit('counsellor-online', {
          counsellorId: counsellorId,
          socketId: socket.id,
          connectedAt: userData.connectedAt,
          role: role
        });
      }

    } catch (error) {
      socket.emit('login-error', { message: 'Login failed' });
    }
  });

  socket.on('supervisor-message', async (data) => {
    const { targetCounsellorId, message, supervisorId } = data;

    if (userData.role !== 'supervisor') {
      socket.emit('error', { message: 'Unauthorized: Supervisor access required' });
      return;
    }

    if (targetCounsellorId) {
      const counsellorData = await notificationService.getUserConnection(targetCounsellorId);
      if (counsellorData && counsellorData.socketId) {
        io.to(counsellorData.socketId).emit('supervisor-message', {
          fromSupervisor: supervisorId,
          message: message,
          timestamp: new Date().toISOString()
        });
      }
    }

    if (!targetCounsellorId) {
      io.emit('supervisor-broadcast', {
        fromSupervisor: supervisorId,
        message: message,
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('get-online-users', async () => {
    if (userData.role === 'supervisor') {
      const [supervisors, counsellors] = await Promise.all([
        notificationService.getOnlineSupervisors(),
        notificationService.getOnlineCounsellors()
      ]);

      socket.emit('online-users-list', {
        supervisors,
        counsellors
      });
    }
  });

  socket.on('keep-this-tab', async (data) => {
    const { counsellorId, sessionId } = data;

    if (counsellorId && sessionId) {
      const existingConnection = await notificationService.getUserConnection(counsellorId);

      if (existingConnection && existingConnection.sessionId !== sessionId) {
        const otherSocket = io.sockets.sockets.get(existingConnection.socketId);
        if (otherSocket) {
          otherSocket.emit('tab-disconnected', {
            message: 'Another tab was chosen to stay connected'
          });
          otherSocket.disconnect();
        }

        userData.userId = counsellorId;
        userData.sessionId = sessionId;

        if (existingConnection.role === 'supervisor') {
          await notificationService.registerUserConnection(counsellorId, userData, 'supervisor');
        } else {
          await notificationService.registerUserConnection(counsellorId, userData, 'counsellor');
        }
      }
    }
  });

  socket.on('disconnect', async (reason) => {
    if (userData.userId && userData.role) {
      if (reason === 'transport close' || reason === 'ping timeout') {
        setTimeout(async () => {
          const currentData = await notificationService.getUserConnection(userData.userId);
          if (currentData && currentData.socketId === socket.id) {
            await notificationService.removeUserConnection(userData.userId, userData.role);
          }
        }, 30000);
      } else {
        await notificationService.removeUserConnection(userData.userId, userData.role);
      }
    }
  });

  socket.on('error', (error) => {});
});

setInterval(async () => {
  const now = Date.now();
  const TEN_MINUTES = 10 * 60 * 1000;

  try {
    const counsellors = await notificationService.getOnlineCounsellors();
    for (const counsellor of counsellors) {
      const timeSinceLastSeen = now - new Date(counsellor.lastSeen).getTime();
      if (timeSinceLastSeen > TEN_MINUTES) {
        const socket = io.sockets.sockets.get(counsellor.socketId);
        if (socket) {
          socket.emit('connection-idle', {
            message: 'Connection idle for too long'
          });
          socket.disconnect();
        }

        await notificationService.removeUserConnection(counsellor.counsellor_id, 'counsellor');
      }
    }

    const supervisors = await notificationService.getOnlineSupervisors();
    for (const supervisor of supervisors) {
      const timeSinceLastSeen = now - new Date(supervisor.lastSeen).getTime();
      if (timeSinceLastSeen > TEN_MINUTES) {
        const socket = io.sockets.sockets.get(supervisor.socketId);
        if (socket) {
          socket.emit('connection-idle', {
            message: 'Connection idle for too long'
          });
          socket.disconnect();
        }

        await notificationService.removeUserConnection(supervisor.supervisor_id, 'supervisor');
      }
    }
  } catch (error) {}
}, 300000);

io.engine.on('connection_error', (err) => {});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});