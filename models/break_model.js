import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const counsellorBreak = sequelize.define('counsellorBreak', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  counsellor_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  break_start: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  break_type:{
  type:DataTypes?.STRING,
  defaultValue:""
  },
  notes:{
  type:DataTypes?.STRING,
  defaultValue:""
  },
  break_end: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in minutes',
  },
  duration_seconds: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Duration in seconds',
  },
  duration_formatted: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Formatted duration as HH:MM:SS',
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'counsellor_break_logs',
  timestamps: false,
  underscored: true,
  hooks: {
    beforeUpdate: (counsellorBreak) => {
      counsellorBreak.updated_at = new Date();
    },
  },
});

export default counsellorBreak;