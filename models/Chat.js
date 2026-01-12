import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const Chat = sequelize.define('chat', {
  chat_id: {
    type: DataTypes.STRING,
    unique: true,
    primaryKey:true,
   
  },
  participants: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: false,
    validate: {
      isTwoParticipants(value) {
        if (!value || value.length !== 2) {
          throw new Error('Chat must have exactly 2 participants');
        }
      }
    }
  },
  initiated_by: {
    type: DataTypes.STRING,
    allowNull: true
  },
  is_locked: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  unread_count: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  last_message_time: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'chats',
  underscored: true,
  timestamps:true,
  createdAt:'created_at',
  updatedAt:false,
   // adds updated_at, created_at automatically in snake_case
  indexes: [
    { fields: ['participants'] },
    { fields: ['last_message_time'] }
  ],
  hooks: {
    beforeCreate: (chat) => {
      if (!chat.chat_id && chat.participants?.length === 2) {
        const sorted = [...chat.participants].sort();
        chat.chat_id = sorted.join('-');
        chat.unread_count = {
          [sorted[0]]: 0,
          [sorted[1]]: 0
        };
      }
    }
  },
   id: false 
});

export default Chat;
