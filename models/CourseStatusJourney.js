import  { DataTypes } from 'sequelize';
import {  v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database-config.js';
  const CourseStatusHistory = sequelize.define('course_status_journey', {
    status_history_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    student_id: { type: DataTypes.STRING },
    course_id: { type: DataTypes.STRING },
    counsellor_id: { type: DataTypes.STRING },
    course_status: DataTypes.STRING,
    deposit_amount: { type: DataTypes.DECIMAL, defaultValue: 0 },
    currency: { type: DataTypes.STRING, defaultValue: 'INR' },
    exam_interview_date: DataTypes.DATE,
    last_admission_date: DataTypes.DATE,
    notes: DataTypes.TEXT,
    created_at:{type:DataTypes.DATE,allowNull:true}
  }, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

export default CourseStatusHistory;