import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const UserActivityLog = sequelize.define('user_activity_logs', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },

  user_id: {
    type: DataTypes.STRING, 
    allowNull: true,
    comment: 'The ID of the logged-in user, null if guest'
  },

  endpoint: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'API endpoint or page user accessed'
  },

  method: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'HTTP method (GET, POST, PUT, DELETE)'
  },

  request_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Payload or query params sent by the user'
  },

  response_data: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Response sent to the user (can store only meta, not full data if large)'
  },

  status_code: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'HTTP status code returned'
  },

  ip_address: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'IP address of the user'
  },

  user_agent: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Browser/device info'
  },

  referrer: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Where the request came from (Referer header)'
  },

  location: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Geo location based on IP if resolved'
  }
}, {
  timestamps: true, 
  indexes: [
    { fields: ['user_id'] },
    { fields: ['endpoint'] },
    { fields: ['createdAt'] }
  ]
});

export default UserActivityLog;
