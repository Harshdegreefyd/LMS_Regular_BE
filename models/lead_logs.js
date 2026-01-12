import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const LeadAssignmentLog = sequelize.define('lead_assignment_log', {
  student_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  assigned_counsellor_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  assigned_by: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  reference_from: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  }
}, {
  tableName: 'lead_assignment_log',
  timestamps: true,
  underscored: true, 
  createdAt: 'created_at',  
  updatedAt: false
});

export default LeadAssignmentLog;