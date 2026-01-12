import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const StudentCollegeApiSentStatus = sequelize.define('student_college_api_sent_status', {
  student_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  student_email: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  student_phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  isPrimary: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  college_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  api_sent_status: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  request_to_api: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  response_from_api: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  request_header_to_api: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  response_header_from_api: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  sent_type: {
    type: DataTypes.STRING,
    defaultValue: "manual"
  }
}, {
  tableName: 'student_college_api_sent_status',
  timestamps: true,
  underscored: true,
});

export default StudentCollegeApiSentStatus;
