import  { DataTypes } from 'sequelize';
import {  v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database-config.js';
const CourseStatus = sequelize.define('latest_course_status', {
  course_id: DataTypes.STRING,
  student_id: DataTypes.STRING,
  created_by:DataTypes.STRING ,
  latest_course_status: { type: DataTypes.STRING, defaultValue: 'Shortlisted' },
  is_shortlisted: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  college_api_sent_status: { type: DataTypes.STRING, defaultValue: '' },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [{ unique: true, fields: ['course_id', 'student_id'] }]
});
export default CourseStatus;