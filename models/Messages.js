import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
import {  v4 as uuidv4 } from 'uuid';

const Message = sequelize.define('message', {
    chat_id: {
    type: DataTypes.STRING,
    
    allowNull: false
  },
  message_id: {
  type: DataTypes.STRING,
  defaultValue: ()=>uuidv4(),
  primaryKey: true
}
,
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  message_type: {
    type: DataTypes.ENUM('text', 'template'),
    defaultValue: 'text'
  },
  sender: {
    type: DataTypes.STRING,
    allowNull: false
  },
  receiver: {
    type: DataTypes.STRING,
    allowNull: false
  },
  direction: {
    type: DataTypes.ENUM('sent', 'received'),
    allowNull: false
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  read_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'messages',
  underscored: true ,
   timestamps: false,
});

export default Message;
