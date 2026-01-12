import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 

const CgcRequestAndResponse = sequelize.define('cgc_request_and_response', {
  source: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'nuvora',
  },
  college_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  student_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  student_email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  student_phone: {
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
  course: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  response_message: {
    type: DataTypes.STRING,
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
  tableName: 'cgc_request_and_response',
  timestamps: false,
  underscored: true,
});

export default CgcRequestAndResponse;
