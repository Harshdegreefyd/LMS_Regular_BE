import axios from 'axios';
import { Op } from 'sequelize';
import { Chat, Message, sequelize, Student, Template } from '../models/index.js';
import {
  findChatBetween,
  addMessageToChat,
  getMessagesForParticipant,
  getUnreadMessagesForParticipant,
  getUnreadCount,
  markMessagesAsRead as markAsRead
} from '../helper/Chats.helper.js';

const WHATSAPP_API_BASE = 'https://wsapi.sendmsg.in';
const MEDIA_API_BASE = 'https://media.sendmsg.in';
const COUNTRY_CODE = '91';
const WHATSAPP_USER = 'degreefyd';
const WHATSAPP_PASS = 'zUoZxiaKynbZ';
const FROM_NUMBER = '919667550618';

const TEMPLATE_CACHE = new Map();
const TEMPLATE_CACHE_TTL = 300000;

const processTemplatePlaceholders = (template, studentData) => {
  if (!template?.placeholders || typeof template.placeholders !== 'object') {
    return {};
  }

  const resolvedPlaceholders = {};
  const placeholdersObj = template.placeholders;

  for (const [key, path] of Object.entries(placeholdersObj)) {
    if (key.startsWith('$__') || typeof path !== 'string') continue;
    const cleanedPath = path.startsWith('student.') ? path.replace('student.', '') : path;
    const value = getNestedValue(studentData, cleanedPath);
    resolvedPlaceholders[key] = value || '';
  }

  return resolvedPlaceholders;
};

const enhanceMessagePayload = async (messageData, templateName) => {
  const cacheKey = `template:${templateName}`;
  const cachedTemplate = TEMPLATE_CACHE.get(cacheKey);

  if (cachedTemplate && (Date.now() - cachedTemplate.timestamp) < TEMPLATE_CACHE_TTL) {
    return cachedTemplate.data;
  }

  const template = await Template.findOne({
    where: { template_name: templateName },
    attributes: ['image', 'pdf_url', 'template_name', 'placeholders']
  });

  if (!template) {
    throw new Error('Template not found');
  }

  TEMPLATE_CACHE.set(cacheKey, { data: template, timestamp: Date.now() });

  if (template.image) messageData.url = template.image;
  if (template.pdf_url) {
    messageData.url = template.pdf_url;
    messageData.filename = `${template.template_name}.pdf`;
  }

  return template;
};

const getNestedValue = (obj, path) => {
  if (!obj || !path) return '';
  return path.split('.').reduce((acc, part) => acc?.[part], obj) || '';
};

const ensureCountryCode = (phoneNumber) => {
  return phoneNumber?.startsWith(COUNTRY_CODE) ? phoneNumber : `${COUNTRY_CODE}${phoneNumber}`;
};

const removeCountryCode = (phoneNumber) => {
  return phoneNumber?.replace(new RegExp(`^${COUNTRY_CODE}`), '');
};

const createApiError = (error, defaultMessage = 'Server error') => ({
  status: error.response?.status || 500,
  message: error.response?.data?.message || error.message || defaultMessage,
  code: error.code
});

const validatePhoneNumber = (phone) => {
  const phoneRegex = /^[0-9]{10,12}$/;
  return phoneRegex.test(phone?.replace(/\D/g, ''));
};

const retryOperation = async (operation, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
};

export const getTemplates = async (req, res) => {
  try {
    const response = await axios.post(
      `${WHATSAPP_API_BASE}/WhatsappTemplates/getTemplates`,
      { username: WHATSAPP_USER },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    const approvedTemplates = (response.data?.templates || [])
      .filter(template => template.status === 'APPROVED')
      .map(({ id, name, language, category, components }) => ({
        id, name, language, category, components
      }));

    res.status(200).json({ success: true, templates: approvedTemplates });
  } catch (error) {
    const { status, message } = createApiError(error);
    res.status(status).json({ success: false, message: `Failed to fetch templates: ${message}` });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const { templateid } = req.body;

    if (!templateid) {
      return res.status(400).json({ success: false, message: 'Template ID is required' });
    }

    const response = await axios.post(
      `${WHATSAPP_API_BASE}/WhatsappTemplates/gettemplateById`,
      { username: WHATSAPP_USER, templateid },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    const { status, message } = createApiError(error);
    res.status(status).json({ success: false, message: `Failed to fetch template: ${message}` });
  }
};

export const sendWhatsAppTemplate = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const payload = req.body;
    const messageData = payload.whatsapptosend?.[0];

    if (!messageData) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid payload structure' });
    }

    if (!validatePhoneNumber(messageData.to)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    const studentId = payload.student;
    if (!studentId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Student ID is required' });
    }

    const [template, studentData] = await Promise.all([
      enhanceMessagePayload(messageData, messageData.templateid),
      Student.findOne({
        where: { student_id: studentId },
        attributes: ['student_id', 'student_phone', 'student_name', 'student_email'],
        transaction
      })
    ]);

    if (!studentData) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const resolvedPlaceholders = processTemplatePlaceholders(template, studentData);
    messageData.placeholders = [resolvedPlaceholders];
    messageData.to = ensureCountryCode(messageData.to);
    messageData.from = FROM_NUMBER;

    const whatsappPayload = {
      user: WHATSAPP_USER,
      pass: WHATSAPP_PASS,
      student: studentId,
      whatsapptosend: [messageData]
    };

    const response = await retryOperation(() =>
      axios.post(`${MEDIA_API_BASE}/mediasend`, whatsappPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      })
    );

    const templateContent = await axios.post(
      `${WHATSAPP_API_BASE}/WhatsappTemplates/gettemplateById`,
      { username: WHATSAPP_USER, templateid: messageData.templateid },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    if (response.status === 200) {
      try {
        await saveMessageToChat(
          FROM_NUMBER,
          messageData.to,
          JSON.stringify(templateContent.data),
          'template',
          'sent',
          transaction
        );
        await transaction.commit();
      } catch (dbError) {
        await transaction.rollback();
      }
    }

    res.status(200).json({ success: true, data: response.data, messageId: response.data?.messageId });
  } catch (error) {
    await transaction.rollback();
    const { status, message } = createApiError(error, 'Error sending WhatsApp template');
    res.status(status).json({ success: false, message: `Failed to send template: ${message}` });
  }
};

export const sendSessionMessage = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const payload = req.body;
    const { sessiondata } = payload;

    if (!sessiondata) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Session data is required' });
    }

    if (!validatePhoneNumber(sessiondata.to)) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    const formattedPayload = {
      user: WHATSAPP_USER,
      pass: WHATSAPP_PASS,
      sessiondata: {
        ...sessiondata,
        from: FROM_NUMBER,
        to: ensureCountryCode(sessiondata.to)
      }
    };

    const response = await retryOperation(() =>
      axios.post(`${MEDIA_API_BASE}/sessioncomm`, formattedPayload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      })
    );

    if (response.status === 200) {
      try {
        await saveMessageToChat(
          FROM_NUMBER,
          formattedPayload.sessiondata.to,
          sessiondata.message.text,
          'text',
          'sent',
          transaction
        );
        await transaction.commit();
      } catch (dbError) {
        await transaction.rollback();
      }
    }

    res.status(200).json({ success: true, data: response.data });
  } catch (error) {
    await transaction.rollback();
    const { status, message } = createApiError(error, 'Error sending session message');
    res.status(status).json({ success: false, message: `Failed to send message: ${message}` });
  }
};

export const handleCallback = async (req, res) => {
  try {
    const { customernumber, replymessage, wabanumber } = req.query;

    if (!customernumber || !replymessage || !wabanumber) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const formattedCustomerNumber = ensureCountryCode(customernumber);
    const studentPhone = removeCountryCode(customernumber);

    await saveMessageToChat(
      formattedCustomerNumber,
      FROM_NUMBER,
      replymessage,
      'text',
      'received'
    );

    await checkAndCreateStudent(studentPhone);

    await Promise.all([
      updateStudentUnreadCount(studentPhone),
      updateChatOnMessageReceive(formattedCustomerNumber, FROM_NUMBER)
    ]);
    const student = await Student.findOne({
      where: { student_phone: studentPhone },
      attributes: ['student_id', 'student_name', 'student_phone', 'assigned_counsellor_id']
    });
    if (student.assigned_counsellor_id) {
      console.log(`Counsellor assigned: ${student.assigned_counsellor_id}`);

      if (global.whatsAppNotificationService) {
        await global.whatsAppNotificationService.sendWhatsAppNotification(
          studentPhone,
          { replymessage, wabanumber },
          student.assigned_counsellor_id
        );
      } else {
        console.log('WhatsApp notification service not available');
      }
    } else {
      console.log('No counsellor assigned');
    }
    res.status(200).json({ success: true, message: 'Callback processed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error processing callback' });
  }
};

const checkAndCreateStudent = async (studentPhone) => {
  try {
    const existingStudent = await Student.findOne({
      where: { student_phone: studentPhone },
      attributes: ['student_id']
    });

    if (!existingStudent) {
      await axios.post('https://lms-api-test.degreefyd.com/v1/student/create', {
        phone_number: studentPhone,
        name: 'N/A',
        email: `${studentPhone}@gmail.com`,
        source: 'WhatsApp',
        campaignName: 'WhatsApp Inbound'
      }, { timeout: 10000 });
    }
  } catch (error) { }
};

const updateStudentUnreadCount = async (studentPhone) => {
  try {
    await Student.update(
      { number_of_unread_messages: sequelize.literal('COALESCE(number_of_unread_messages, 0) + 1') },
      { where: { student_phone: studentPhone } }
    );
  } catch (error) { }
};

const updateChatOnMessageReceive = async (customerNumber, wabaNumber) => {
  try {
    const chat = await Chat.findOne({
      where: { participants: { [Op.contains]: [customerNumber, wabaNumber] } }
    });

    if (chat) {
      const unread = chat.unread_count || {};
      unread[customerNumber] = (unread[customerNumber] || 0) + 1;
      await chat.update({ unread_count: unread, is_locked: false, last_message_time: new Date() });
    }
  } catch (error) { }
};

export const saveMessageToChat = async (
  sender,
  receiver,
  messageText,
  messageType,
  direction = 'sent',
  transaction = null
) => {
  try {
    let chat = await findChatBetween(sender, receiver);

    if (!chat) {
      const sortedParticipants = [sender, receiver].sort();
      chat = await Chat.create({
        chat_id: sortedParticipants.join('-'),
        participants: [sender, receiver],
        initiated_by: sender,
        unread_count: { [sortedParticipants[0]]: 0, [sortedParticipants[1]]: 0 }
      }, { transaction });
    }

    await addMessageToChat(chat.chat_id, {
      message: messageText,
      message_type: messageType,
      sender,
      receiver,
      direction,
      timestamp: new Date(),
      is_read: direction === 'sent'
    }, transaction);

    await chat.update({ last_message_time: new Date() }, { transaction });

    return chat;
  } catch (error) {
    throw error;
  }
};

export const getMessages = async (req, res) => {
  try {
    const { toNumber } = req.body;

    if (!toNumber) {
      return res.status(400).json({ success: false, message: 'toNumber is required' });
    }

    if (!validatePhoneNumber(toNumber)) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format' });
    }

    const formattedFromNumber = FROM_NUMBER;
    const formattedToNumber = ensureCountryCode(toNumber);

    const chat = await findChatBetween(formattedFromNumber, formattedToNumber);

    if (!chat) {
      return res.status(200).json({
        success: true,
        count: 0,
        messages: [],
        chatExists: false,
        unreadCount: 0,
        participants: [formattedFromNumber, formattedToNumber]
      });
    }

    const [messagesWithPerspective, unreadCount] = await Promise.all([
      getMessagesForParticipant(chat.chat_id, formattedFromNumber),
      getUnreadCount(chat.chat_id, formattedFromNumber)
    ]);

    const otherParticipant = chat.participants.find(p => p !== formattedFromNumber);

    res.status(200).json({
      success: true,
      count: messagesWithPerspective.length,
      messages: messagesWithPerspective,
      chatExists: true,
      chatId: chat.chat_id,
      participants: chat.participants,
      initiatedBy: chat.initiated_by,
      otherParticipant,
      lastMessageTime: chat.last_message_time,
      createdAt: chat.created_at,
      currentUser: formattedFromNumber,
      unreadCount,
      isLocked: chat.is_locked
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching messages' });
  }
};

export const getAllChats = async (req, res) => {
  try {
    const formattedPhoneNumber = FROM_NUMBER;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 50;
    const offset = (page - 1) * limit;

    const { count, rows: chats } = await Chat.findAndCountAll({
      where: { participants: { [Op.contains]: [formattedPhoneNumber] } },
      order: [['last_message_time', 'DESC']],
      limit,
      offset,
      distinct: true
    });

    if (chats.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        chats: [],
        currentUser: formattedPhoneNumber,
        totalUnreadCount: 0,
        pagination: { page, limit, totalPages: 0 }
      });
    }

    const chatIds = chats.map(chat => chat.chat_id);

    const latestMessages = await Message.findAll({
      where: { chat_id: chatIds },
      attributes: ['chat_id', [sequelize.fn('MAX', sequelize.col('timestamp')), 'latest_timestamp']],
      group: ['chat_id'],
      raw: true
    });

    const latestTimestamps = latestMessages.reduce((acc, msg) => {
      acc[msg.chat_id] = msg.latest_timestamp;
      return acc;
    }, {});

    const latestMessageDetails = await Message.findAll({
      where: sequelize.where(
        sequelize.fn('CONCAT', sequelize.col('chat_id'), '-', sequelize.col('timestamp')),
        { [Op.in]: Object.entries(latestTimestamps).map(([chatId, timestamp]) => `${chatId}-${timestamp}`) }
      ),
      order: [['timestamp', 'DESC']]
    });

    const messageMap = latestMessageDetails.reduce((acc, msg) => {
      acc[msg.chat_id] = msg;
      return acc;
    }, {});

    const formattedChats = chats.map(chat => {
      const otherParticipant = chat.participants.find(p => p !== formattedPhoneNumber);
      const lastMessage = messageMap[chat.chat_id];
      const unreadCount = chat.unread_count?.[formattedPhoneNumber] || 0;

      return {
        chatId: chat.chat_id,
        otherParticipant,
        isInitiator: chat.initiated_by === formattedPhoneNumber,
        lastMessage: lastMessage ? {
          message: lastMessage.message,
          messageType: lastMessage.message_type,
          sender: lastMessage.sender,
          receiver: lastMessage.receiver,
          direction: lastMessage.direction,
          isRead: lastMessage.is_read,
          readAt: lastMessage.read_at,
          timestamp: lastMessage.timestamp,
          isSentByMe: lastMessage.sender === formattedPhoneNumber,
          isReceivedByMe: lastMessage.receiver === formattedPhoneNumber
        } : null,
        unreadCount,
        lastMessageTime: chat.last_message_time,
        createdAt: chat.created_at,
        isLocked: chat.is_locked
      };
    });

    const totalUnreadCount = formattedChats.reduce((total, chat) => total + chat.unreadCount, 0);

    res.status(200).json({
      success: true,
      count: formattedChats.length,
      chats: formattedChats,
      currentUser: formattedPhoneNumber,
      totalUnreadCount,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching chats' });
  }
};

export const getMessagesFromPerspective = async (req, res) => {
  try {
    const { otherParticipantNumber } = req.body;

    if (!otherParticipantNumber) {
      return res.status(400).json({
        success: false,
        message: 'otherParticipantNumber is required'
      });
    }

    const formattedParticipantNumber = FROM_NUMBER;
    const formattedOtherNumber = ensureCountryCode(otherParticipantNumber);

    const chat = await findChatBetween(formattedParticipantNumber, formattedOtherNumber);

    if (!chat) {
      return res.status(200).json({
        success: true,
        count: 0,
        messages: [],
        chatExists: false,
        unreadCount: 0
      });
    }

    const [messagesFromPerspective, unreadCount] = await Promise.all([
      getMessagesForParticipant(chat.chat_id, formattedParticipantNumber),
      getUnreadCount(chat.chat_id, formattedParticipantNumber)
    ]);

    res.status(200).json({
      success: true,
      count: messagesFromPerspective.length,
      messages: messagesFromPerspective,
      chatExists: true,
      chatId: chat.chat_id,
      currentParticipant: formattedParticipantNumber,
      otherParticipant: formattedOtherNumber,
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching messages from perspective' });
  }
};

export const markMessagesAsRead = async (req, res) => {
  const transaction = await sequelize.transaction();
  console.log("hi")
  try {
    const { otherParticipantNumber } = req.body;

    if (!otherParticipantNumber) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'otherParticipantNumber is required' });
    }

    const formattedParticipantNumber = FROM_NUMBER;
    const formattedOtherNumber = ensureCountryCode(otherParticipantNumber);
    console.log("trigger22")
    // const chat = await findChatBetween(formattedParticipantNumber, formattedOtherNumber);

    // if (!chat) {
    //   await transaction.rollback();
    //   return res.status(404).json({ success: false, message: 'Chat not found' });
    // }

    // const markedCount = await markAsRead(chat.chat_id, formattedParticipantNumber, null, transaction);

    const studentPhone = removeCountryCode(formattedOtherNumber);
    console.log(studentPhone)
    let a = await Student.update(
      { number_of_unread_messages: 0 },
      { where: { student_phone: studentPhone }, transaction }
    );
    console.log(a)
    // if (chat.unread_count?.[formattedParticipantNumber]) {
    //   await chat.update({
    //     unread_count: { ...chat.unread_count, [formattedParticipantNumber]: 0 }
    //   }, { transaction });
    // }

    await transaction.commit();

    res.status(200).json({ success: true, message: `messages marked as read` });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({ success: false, message: 'Error marking messages as read' });
  }
};

export const getUnreadMessages = async (req, res) => {
  try {
    const { otherParticipantNumber } = req.body;
    const formattedParticipantNumber = FROM_NUMBER;

    if (otherParticipantNumber) {
      const formattedOtherNumber = ensureCountryCode(otherParticipantNumber);
      const chat = await findChatBetween(formattedParticipantNumber, formattedOtherNumber);

      if (!chat) {
        return res.status(200).json({ success: true, count: 0, messages: [], unreadCount: 0 });
      }

      const unreadMessages = await getUnreadMessagesForParticipant(chat.chat_id, formattedParticipantNumber);

      res.status(200).json({
        success: true,
        count: unreadMessages.length,
        messages: unreadMessages,
        unreadCount: unreadMessages.length,
        otherParticipant: formattedOtherNumber,
        chatId: chat.chat_id
      });
    } else {
      const chats = await Chat.findAll({
        where: { participants: { [Op.contains]: [formattedParticipantNumber] } },
        attributes: ['chat_id', 'participants', 'unread_count']
      });

      const chatIds = chats.map(chat => chat.chat_id);

      const allUnreadMessages = await Message.findAll({
        where: { chat_id: chatIds, receiver: formattedParticipantNumber, is_read: false },
        order: [['timestamp', 'DESC']]
      });

      const messagesByChat = {};
      allUnreadMessages.forEach(msg => {
        if (!messagesByChat[msg.chat_id]) messagesByChat[msg.chat_id] = [];
        messagesByChat[msg.chat_id].push(msg);
      });

      const formattedMessages = [];
      chats.forEach(chat => {
        const messages = messagesByChat[chat.chat_id] || [];
        const otherParticipant = chat.participants.find(p => p !== formattedParticipantNumber);

        messages.forEach(msg => {
          formattedMessages.push({
            ...msg.toJSON(),
            chatId: chat.chat_id,
            otherParticipant,
            unreadCount: chat.unread_count?.[formattedParticipantNumber] || 0
          });
        });
      });

      formattedMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.status(200).json({
        success: true,
        count: formattedMessages.length,
        messages: formattedMessages,
        totalUnreadCount: formattedMessages.length
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching unread messages' });
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of TEMPLATE_CACHE.entries()) {
    if (now - value.timestamp > TEMPLATE_CACHE_TTL) {
      TEMPLATE_CACHE.delete(key);
    }
  }
}, 60000);