import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 

const LpuRequestAndResponse = sequelize.define('lpu_request_and_response', {
  student_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  student_email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  student_phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  college_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  college_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lead_generated_by: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  field_program: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  field_session: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  response_message: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  response_status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'lpu_request_and_response',
  timestamps: false,
  underscored: true,
});

export default LpuRequestAndResponse;
