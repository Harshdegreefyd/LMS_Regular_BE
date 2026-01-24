import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
import { v4 as uuidv4 } from 'uuid';

const WebsiteChatMessage = sequelize.define('WebsiteChatMessage', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => uuidv4()
  },
  chatId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'chat_id',
    references: {
      model: 'website_chats',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  senderType: {
    type: DataTypes.ENUM('Student', 'Operator', 'System', 'Counsellor', 'Admin'),
    allowNull: false,
    field: 'sender_type'
  },
  senderUserId: {
    type: DataTypes.STRING,
    allowNull: true, 
    field: 'sender_user_id'
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'display_name'
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_read'
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'read_at'
  },
  metadata: {
    type: DataTypes.JSONB, 
    defaultValue: {}
  }
}, {
  tableName: 'website_chat_messages',
  timestamps: true, // createdAt acts as message timestamp
  updatedAt: false, // Messages usually aren't updated
  underscored: true,
  indexes: [
    { fields: ['chat_id'] },
    { fields: ['created_at'] } // Important for ordering history
  ]
});

export default WebsiteChatMessage;
