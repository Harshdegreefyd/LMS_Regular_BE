import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 

const CuRequestAndResponse = sequelize.define('cu_request_and_response', {
  student_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  student_email: {
    type: DataTypes.STRING,
    allowNull: false,
    lowercase: true,
    unique: true,
  },
  student_phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  
  source: {
    type: DataTypes.STRING,
    defaultValue: 'Nuvora',
    lowercase: true,
  },
  mx_program_code_new: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  mx_program_new: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  mx_discipline_new: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  state: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  date_of_birth: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  campus: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  response_message_id: {
    type: DataTypes.STRING,
  },
  response_message_related_id: {
    type: DataTypes.STRING,
  },
  response_message_is_created: {
    type: DataTypes.BOOLEAN,
  },
  response_status: {
    type: DataTypes.STRING,
  },
  lead_generated_by: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'cu_request_and_response',
  timestamps: false,
  underscored: true,
});

export default CuRequestAndResponse;
