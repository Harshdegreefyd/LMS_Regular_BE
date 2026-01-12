import { Chat, Message } from '../models/index.js';
import { Op } from 'sequelize';

/**
 * Find existing chat between two participants
 */
export const findChatBetween = async (number1, number2) => {
  const sorted = [number1, number2].sort();
  const chatId = `${sorted[0]}-${sorted[1]}`;

  const chat = await Chat.findByPk(chatId);
  return chat;
};

/**
 * Add a new message to a chat
 */
export const addMessageToChat = async (chatId, messageData) => {
  const chat = await Chat.findByPk(chatId);
  if (!chat) throw new Error('Chat not found');

  const { sender, receiver } = messageData;

  if (!sender || !receiver) throw new Error('Sender and receiver are required');

  if (!chat.participants.includes(sender) || !chat.participants.includes(receiver)) {
    throw new Error('Sender and receiver must be participants of this chat');
  }

  const newMessage = await Message.create({
    ...messageData,
    is_read: false,
    read_at: null,
    chat_id: chatId
  });

  const unread = chat.unread_count || {};
  unread[receiver] = (unread[receiver] || 0) + 1;

  await chat.update({
    last_message_time: new Date(),
    unread_count: unread
  });

  return newMessage;
};

/**
 * Mark messages as read by participant
 */
export const markMessagesAsRead = async (chatId, participantNumber, messageIds = []) => {
  const messages = await Message.findAll({
    where: {
      chat_id: chatId,
      receiver: participantNumber,
      is_read: false,
      ...(messageIds.length > 0 && { message_id: messageIds })
    }
  });

  const markedCount = messages.length;

  await Promise.all(messages.map(msg =>
    msg.update({ is_read: true, read_at: new Date() })
  ));

  const chat = await Chat.findByPk(chatId);
  const unread = chat.unread_count || {};
  unread[participantNumber] = Math.max(0, (unread[participantNumber] || 0) - markedCount);

  await chat.update({ unread_count: unread });

  return markedCount;
};

/**
 * Get unread count for participant
 */
export const getUnreadCount = async (chatId, participantNumber) => {
  const chat = await Chat.findByPk(chatId);
  if (!chat) throw new Error('Chat not found');

  return chat.unread_count?.[participantNumber] || 0;
};

/**
 * Get all messages in a chat with isSentByMe/isReceivedByMe flags
 */
export const getMessagesForParticipant = async (chatId, participantNumber) => {
  const messages = await Message.findAll({
    where: { chat_id: chatId },
    order: [['timestamp', 'ASC']]
  });

  return messages.map(msg => ({
    ...msg.toJSON(),
    isSentByMe: msg.sender === participantNumber,
    isReceivedByMe: msg.receiver === participantNumber
  }));
};

/**
 * Get only unread messages for participant
 */
export const getUnreadMessagesForParticipant = async (chatId, participantNumber) => {
  const messages = await Message.findAll({
    where: {
      chat_id: chatId,
      receiver: participantNumber,
      is_read: false
    },
    order: [['timestamp', 'ASC']]
  });

  return messages.map(msg => ({
    ...msg.toJSON(),
    isSentByMe: msg.sender === participantNumber,
    isReceivedByMe: true
  }));
};
