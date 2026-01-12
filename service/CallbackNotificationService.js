import cron from 'node-cron';
import StudentRemark from '../models/StudentRemark.js';
import Student from '../models/Student.js';
import redis from '../config/redis.js'; 
import { Op } from 'sequelize';

class CallbackNotificationService {
  constructor(io) {
    this.io = io;
    this.isCronRunning = false;
    this.debugMode = true;
  }

  async init() {
    console.log('Initializing Real-time Callback Notification System...');

    if (!this.io) {
      console.error('ERROR: io instance is required for CallbackNotificationService');
      return this;
    }
    
    this.setupNotificationCron(); 
    this.setupHealthCheck();

    console.log('Real-time Callback Notification System initialized');
    return this;
  }

  setupNotificationCron() {
    // Changed from 8-20 to 8-21 to include 9 PM (21:00)
    cron.schedule('24,54 8-21 * * *', async () => {
      if (this.isCronRunning) {
        return;
      }

      this.isCronRunning = true;
      const startTime = Date.now();
      
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      let targetTime;
      
      if (currentMinute === 54) {
        const nextHour = currentHour + 1;
        targetTime = `${nextHour.toString().padStart(2, '0')}:00`;
      } else if (currentMinute === 24) {
        targetTime = `${currentHour.toString().padStart(2, '0')}:30`;
      } else {
        this.isCronRunning = false;
        return;
      }

      // Updated from 20 to 21 for 9 PM
      // Also prevent 9:30 PM (21:30) notifications
      const targetHour = parseInt(targetTime.split(':')[0]);
      const targetMinute = targetTime.split(':')[1];
      
      // Don't send notifications beyond 9:30 PM
      if (targetHour > 21 || (targetHour === 21 && targetMinute === '30')) {
        this.isCronRunning = false;
        return;
      }

      await this.calculateAndStoreSchedule();
      await this.checkAndSendNotifications(targetTime);

      this.isCronRunning = false;
    });
  }

  async calculateAndStoreSchedule() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const todaysCallbacks = await StudentRemark.findAll({
        where: {
          callback_date: today,
          // Updated regex to include 21 (9 PM) but exclude 21:30 (9:30 PM)
          // Since we don't want to notify for 9:30 PM
          callback_time: {
            [Op.regexp]: '^(0[8-9]|1[0-9]|20|21):(00)$|^(0[8-9]|1[0-9]|20):(30)$'
          },
          counsellor_id: {
            [Op.ne]: null,
            [Op.ne]: ''
          }
        },
        attributes: ['student_id', 'callback_time', 'counsellor_id', 'callback_date', 'remarks', 'created_at'],
        raw: true
      });
      
      if (todaysCallbacks.length === 0) {
        await redis.setex(`callbacks:${today}`, 15 * 3600, JSON.stringify({}));
        return { success: true, callbacks: 0 };
      }

      const studentIds = [...new Set(todaysCallbacks.map(cb => cb.student_id))];
      
      const students = await Student.findAll({
        where: { student_id: studentIds },
        attributes: ['student_id', 'student_name', 'student_phone', 'student_email'],
        raw: true
      });

      const studentMap = {};
      students.forEach(student => {
        studentMap[student.student_id] = student;
      });

      const schedule = {};
      const now = new Date();
      let immediateCallbacks = 0;

      todaysCallbacks.forEach(remark => {
        const time = remark.callback_time;
        const counsellorId = remark.counsellor_id;
        const student = studentMap[remark.student_id];
        
        const createdAt = new Date(remark.created_at);
        const isCreatedToday = createdAt.toISOString().split('T')[0] === today;
        const isImmediate = isCreatedToday && 
                           (time.split(':')[0] > createdAt.getHours() || 
                           (time.split(':')[0] == createdAt.getHours() && 
                            time.split(':')[1] > createdAt.getMinutes()));

        if (isImmediate) {
          immediateCallbacks++;
        }

        if (!counsellorId) return;

        if (!schedule[time]) schedule[time] = {};
        if (!schedule[time][counsellorId]) schedule[time][counsellorId] = [];

        schedule[time][counsellorId].push({
          student_id: remark.student_id,
          student_name: student?.student_name || 'N/A',
          student_phone: student?.student_phone || 'N/A',
          student_email: student?.student_email || 'N/A',
          callback_date: remark.callback_date,
          callback_time: remark.callback_time,
          remarks: remark.remarks || 'No remarks',
          counsellor_id: counsellorId,
          created_at: remark.created_at,
          is_immediate: isImmediate,
          created_today: isCreatedToday
        });
      });

      const redisKey = `callbacks:${today}`;
      await redis.setex(redisKey, 15 * 3600, JSON.stringify(schedule));

      return { 
        success: true, 
        callbacks: todaysCallbacks.length, 
        timeSlots: Object.keys(schedule).length,
        immediate: immediateCallbacks 
      };

    } catch (error) {
      console.error('Schedule calculation failed:', error);
      return { success: false, error: error.message };
    }
  }

  async checkAndSendNotifications(targetTime) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const scheduleStr = await redis.get(`callbacks:${today}`);

      if (!scheduleStr) {
        return;
      }

      const schedule = JSON.parse(scheduleStr);
      const notifications = schedule[targetTime] || {};

      if (Object.keys(notifications).length === 0) {
        return;
      }

      let totalNotifications = 0;
      let onlineCount = 0;
      let offlineCount = 0;
      let immediateCount = 0;

      for (const [counsellorId, students] of Object.entries(notifications)) {
        const isOnline = await this.isCounsellorOnline(counsellorId);

        const immediateStudents = students.filter(s => s.is_immediate);
        if (immediateStudents.length > 0) {
          immediateCount += immediateStudents.length;
        }

        if (isOnline) {
          await this.sendCallbackNotification(counsellorId, {
            targetTime,
            students,
            count: students.length,
            immediate_count: immediateStudents.length,
            timestamp: new Date(),
            message: `You have ${students.length} callback(s) in 6 minutes (${targetTime})`,
            notification_type: 'callback_reminder'
          });

          totalNotifications += students.length;
          onlineCount++;
        } else {
          offlineCount++;
          await this.queueOfflineNotifications(counsellorId, students.length, targetTime);
        }
      }

    } catch (error) {
      console.error('Error in checkAndSendNotifications:', error);
    }
  }

  async isCounsellorOnline(counsellorId) {
    try {
      const counsellorDataStr = await redis.hget('connected:counsellors', counsellorId);
      return counsellorDataStr !== null;
    } catch (error) {
      return false;
    }
  }

  async sendCallbackNotification(counsellorId, notificationData) {
    try {
      const ioInstance = this.io || global.io;
      
      if (!ioInstance) {
        return false;
      }

      const counsellorDataStr = await redis.hget('connected:counsellors', counsellorId);
      
      if (!counsellorDataStr) {
        return false;
      }
      
      const counsellorData = JSON.parse(counsellorDataStr);
      
      if (!counsellorData.socketId) {
        return false;
      }
      
      const notification = {
        type: 'callback_reminder',
        ...notificationData,
        priority: notificationData.immediate_count > 0 ? 'urgent' : 'high',
        timestamp: new Date().toISOString(),
        icon: notificationData.immediate_count > 0 ? '⚡' : '⏰',
        sound: 'callback'
      };

      ioInstance.to(counsellorData.socketId).emit('callback_reminder', notification);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async queueOfflineNotifications(counsellorId, studentCount, targetTime) {
    try {
      const queueKey = `offline_callbacks:${counsellorId}:${new Date().toISOString().split('T')[0]}`;
      const notification = {
        counsellorId,
        studentCount,
        targetTime,
        timestamp: new Date().toISOString(),
        message: `You missed ${studentCount} callback(s) at ${targetTime}`
      };

      await redis.lpush(queueKey, JSON.stringify(notification));
      await redis.expire(queueKey, 24 * 3600);
    } catch (error) {}
  }

  setupHealthCheck() {
    cron.schedule('*/10 * * * *', () => {});
  }

  async triggerManualCheck(targetTime = null) {
    if (targetTime) {
      await this.calculateAndStoreSchedule();
      await this.checkAndSendNotifications(targetTime);
    } else {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      
      let targetTime;
      if (currentMinute < 24) {
        targetTime = `${currentHour.toString().padStart(2, '0')}:30`;
      } else if (currentMinute < 54) {
        const nextHour = currentHour + 1;
        targetTime = `${nextHour.toString().padStart(2, '0')}:00`;
      } else {
        const nextHour = currentHour + 1;
        targetTime = `${nextHour.toString().padStart(2, '0')}:00`;
      }
      
      await this.calculateAndStoreSchedule();
      await this.checkAndSendNotifications(targetTime);
    }
  }

  async getTodaySchedule() {
    const today = new Date().toISOString().split('T')[0];
    const scheduleStr = await redis.get(`callbacks:${today}`);

    if (!scheduleStr) {
      return { today, schedule: {}, message: 'No schedule calculated yet' };
    }

    const schedule = JSON.parse(scheduleStr);
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    let totalCallbacks = 0;
    let immediateCallbacks = 0;
    
    Object.values(schedule).forEach(timeSlot => {
      Object.values(timeSlot).forEach(callbacks => {
        totalCallbacks += callbacks.length;
        immediateCallbacks += callbacks.filter(cb => cb.is_immediate).length;
      });
    });
    
    return {
      today,
      currentTime,
      schedule,
      totalTimeSlots: Object.keys(schedule).length,
      totalCallbacks,
      immediateCallbacks,
      totalCounsellors: new Set(Object.values(schedule).flatMap(time => Object.keys(time))).size,
      activeCounsellors: Array.from(global.connectedCounsellors?.keys() || []),
      notificationSchedule: 'At :24 and :54 (8:24 AM - 8:54 PM)',
      nextCheck: this.getNextCheckTime()
    };
  }

  getNextCheckTime() {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    
    if (currentMinute < 24) {
      return `${currentHour.toString().padStart(2, '0')}:24`;
    } else if (currentMinute < 54) {
      return `${currentHour.toString().padStart(2, '0')}:54`;
    } else {
      const nextHour = currentHour + 1;
      return `${nextHour.toString().padStart(2, '0')}:24`;
    }
  }
}

export default CallbackNotificationService;