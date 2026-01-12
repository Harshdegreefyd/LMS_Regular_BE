import  { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
const StudentLeadActivity = sequelize.define('student_lead_activities', {
  student_id: { type: DataTypes.STRING },
  student_name: { type: DataTypes.STRING, defaultValue: '' },
  student_email: { type: DataTypes.STRING, defaultValue: '' },
  student_phone: { type: DataTypes.STRING, defaultValue: '' },
  parents_number: { type: DataTypes.STRING, defaultValue: '' },
  whatsapp: { type: DataTypes.STRING, defaultValue: '' },
  cta_name: { type: DataTypes.STRING, defaultValue: '' },
  form_name: { type: DataTypes.STRING, defaultValue: '' },
  source: { type: DataTypes.STRING, defaultValue: '' },
  source_url: { type: DataTypes.TEXT, defaultValue: '' },
  utm_source: { type: DataTypes.STRING, defaultValue: '' },
  utm_medium: { type: DataTypes.STRING, defaultValue: '' },
  utm_keyword: { type: DataTypes.STRING, defaultValue: '' },
  utm_campaign: { type: DataTypes.STRING, defaultValue: '' },
  utm_campaign_id: { type: DataTypes.STRING, defaultValue: '' },
  utm_adgroup_id: { type: DataTypes.STRING, defaultValue: '' },
  utm_creative_id: { type: DataTypes.STRING, defaultValue: '' },
  ip_city: { type: DataTypes.STRING, defaultValue: '' },
  browser: { type: DataTypes.STRING, defaultValue: '' },
  device: { type: DataTypes.STRING, defaultValue: '' },
  student_comment: { type: DataTypes.JSONB, defaultValue: [] },
  highest_qualification: { type: DataTypes.STRING, defaultValue: '' },
  working_professional: { type: DataTypes.BOOLEAN, defaultValue: false },
  student_status: {
    type: DataTypes.STRING,
    defaultValue: 'new',
    validate: { isIn: [['new', 'in_progress', 'converted', 'closed']] }
  },
  destination_number: { type: DataTypes.STRING, defaultValue: '' },
  dial_whom_number: { type: DataTypes.STRING, defaultValue: '' },
  call_duration: { type: DataTypes.STRING, defaultValue: '' },
  ivr_status: { type: DataTypes.STRING, defaultValue: '' },
  start_time: { type: DataTypes.STRING, defaultValue: '' },
  end_time: { type: DataTypes.STRING, defaultValue: '' },
  call_sid: { type: DataTypes.STRING, defaultValue: '' },
  call_recording_url: { type: DataTypes.STRING, defaultValue: '' },
  talk_duration: { type: DataTypes.STRING, defaultValue: '' },
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

export default StudentLeadActivity;

