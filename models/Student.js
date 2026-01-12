import { DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database-config.js';

const Student = sequelize.define('students', {
  student_id: {
    type: DataTypes.STRING(20),
    primaryKey: true,
    defaultValue: () => 'STD-' + uuidv4().substr(0, 8).toUpperCase(),
  },
  student_name: DataTypes.STRING,
  student_email: { type: DataTypes.STRING, unique: true },
  student_phone: { type: DataTypes.STRING, unique: true },
  parents_number: DataTypes.STRING,
  whatsapp: DataTypes.STRING,
  assigned_counsellor_id: DataTypes.STRING,
  assigned_counsellor_l3_id: DataTypes.STRING,
  highest_degree: DataTypes.STRING,
  completion_year: DataTypes.STRING,
  current_profession: DataTypes.STRING,
  current_role: DataTypes.STRING,
  work_experience: DataTypes.STRING,
  student_age: { type: DataTypes.INTEGER, defaultValue: 0 },
  objective: DataTypes.STRING,
  mode: { type: DataTypes.STRING, defaultValue: 'Regular' },
  preferred_stream: DataTypes.ARRAY(DataTypes.TEXT),
  preferred_budget: { type: DataTypes.STRING, defaultValue: '' },
  preferred_degree: DataTypes.ARRAY(DataTypes.TEXT),
  preferred_level: DataTypes.ARRAY(DataTypes.TEXT),
  preferred_specialization: DataTypes.ARRAY(DataTypes.TEXT),
  preferred_city: DataTypes.ARRAY(DataTypes.TEXT),
  preferred_state: DataTypes.ARRAY(DataTypes.TEXT),
  preferred_university: DataTypes.ARRAY(DataTypes.TEXT),
  source: DataTypes.STRING,
  first_source_url: DataTypes.TEXT,
  student_secondary_email: DataTypes.STRING,
  student_current_city: DataTypes.STRING,
  student_current_state: DataTypes.STRING,
  is_opened: DataTypes.BOOLEAN,
  is_connected_yet: { type: DataTypes.BOOLEAN, defaultValue: false },
  number_of_unread_messages: { type: DataTypes.INTEGER, defaultValue: 0 },
  assigned_l3_date: DataTypes.DATE,
  calling_status_l3: DataTypes.STRING,
  sub_calling_status_l3: DataTypes.STRING,
  remarks_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  remarks_l3: DataTypes.TEXT,
  next_call_date_l3: DataTypes.DATE,
  last_call_date_l3: DataTypes.DATE,
  next_call_time_l3: DataTypes.STRING,
  is_connected_yet_l3: { type: DataTypes.BOOLEAN, defaultValue: false },
  total_remarks_l3: { type: DataTypes.INTEGER, defaultValue: 0 },
  first_callback_l2: DataTypes.DATE,
  first_callback_l3: DataTypes.DATE,
  first_form_filled_date: DataTypes.DATE,
  online_ffh: { type: DataTypes.INTEGER, defaultValue: 0 },
  is_reactivity: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  assigned_team_owner_date: {
    type: DataTypes.DATE,
    defaultValue: null,
  },
  assigned_team_owner_id: {
    type: DataTypes.STRING,
    defaultValue: null,
  },
  reassigneddate: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null,
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default Student;
