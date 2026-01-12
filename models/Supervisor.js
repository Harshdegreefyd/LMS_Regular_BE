import { DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database-config.js';

const Supervisor = sequelize.define('supervisors', {
  supervisor_id: {
    type: DataTypes.STRING(20),
    primaryKey: true,
    defaultValue: () => 'SUP-' + uuidv4().substring(0, 8).toUpperCase()
  },
  supervisor_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  supervisor_email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  supervisor_password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  supervisor_phone_number: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'active'
  },
  supervisor_last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_logout: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },

  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Supervisor;