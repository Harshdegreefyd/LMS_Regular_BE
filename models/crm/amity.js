import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 

const AmityRequestAndResponse = sequelize.define('amity_request_and_response', {
  student_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  student_email: {
    type: DataTypes.STRING,
    allowNull: false,
    lowercase: true,
  },
  student_phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'nuvora',
  },
  source_medium: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  course: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  source_campaign: {
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
  campus: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  response_message_id: {
    type: DataTypes.STRING,
    field: 'response_message_id',
  },
  response_message_related_id: {
    type: DataTypes.STRING,
    field: 'response_message_related_id',
  },
  response_message_is_created: {
    type: DataTypes.BOOLEAN,
    field: 'response_message_is_created',
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
  tableName: 'amity_request_and_response',
  timestamps: false,
  underscored: true,
});

export default AmityRequestAndResponse;
