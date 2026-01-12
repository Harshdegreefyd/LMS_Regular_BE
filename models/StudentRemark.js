import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const StudentRemark = sequelize.define('student_remarks', {
  remark_id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  feesAmount: { type: DataTypes.INTEGER, defaultValue: 0 },
  student_id: { type: DataTypes.STRING },
  counsellor_id: { type: DataTypes.STRING },
  supervisor_id: { type: DataTypes.STRING },
  isdisabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  lead_status: DataTypes.STRING,
  lead_sub_status: DataTypes.STRING,
  calling_status: DataTypes.STRING,
  sub_calling_status: DataTypes.STRING,
  remarks: DataTypes.TEXT,
  callback_date: DataTypes.DATEONLY,
  callback_time: DataTypes.STRING,
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  timestamps: true,
  updatedAt: 'updated_at',
  createdAt: 'created_at'
});

export default StudentRemark;