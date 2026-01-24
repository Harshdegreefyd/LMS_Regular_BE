import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
import { v4 as uuidv4 } from 'uuid';

const WebsiteChat = sequelize.define('WebsiteChat', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => uuidv4() 
  },
  studentId: {
    type: DataTypes.STRING,
    allowNull: true, 
    field: 'student_id'
  },
  studentName: { 
    type: DataTypes.STRING,
    allowNull: true,
    field: 'student_name'
  },
  studentPhone: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'student_phone'
  },
  counsellorId: {
    type: DataTypes.STRING,
    allowNull: true, 
    field: 'counsellor_id'
  },
   displayName: {
    type: DataTypes.STRING,
    allowNull: true, 
    field: 'display_name'
  },
  status: {
    type: DataTypes.ENUM('PENDING_ACCEPTANCE', 'ACTIVE', 'CLOSED_BY_STUDENT', 'CLOSED_BY_COUNSELLOR', 'AUTO_CLOSED','CLOSED'),
    defaultValue: 'PENDING_ACCEPTANCE',
    allowNull: false
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'last_message_at'
  },
    lastMessage: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'last_message'
  },

  unreadCountStudent: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'unread_count_student'
  },
  unreadCountCounsellor: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'unread_count_counsellor'
  },
  studentPlatformDetails: {
    type: DataTypes.JSONB, 
    defaultValue: {},
    field: 'student_platform_details'
  },
  closedBy: {
    type: DataTypes.STRING, 
    allowNull: true,
    field: 'closed_by'
  },
  closedReason: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'closed_reason'
  }
}, {
  tableName: 'website_chats',
  timestamps: true,
  underscored: true, 
  indexes: [
    { fields: ['status'] },
    { fields: ['counsellor_id'] },
    { fields: ['student_phone'] },
    { fields: ['updated_at'] }
  ]
});

export default WebsiteChat;
