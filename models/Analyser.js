import { DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database-config.js';

const Analyser = sequelize.define('analyser', {
  id: {
    type: DataTypes.STRING(24),
    primaryKey: true,
    defaultValue: () => 'ANLY-' + uuidv4().substring(0, 8).toUpperCase()
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    defaultValue: "Analyser"
  },
  sources: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  source_urls: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  student_creation_date: {
    type: DataTypes.STRING,
  },
  campaigns: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Analyser;