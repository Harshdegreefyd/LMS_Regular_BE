import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 

const StudentCollegeCred = sequelize.define('student_college_credentials', {
  form_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  coupon_code: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  user_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  student_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  counsellor_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  
  course_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  
}, {
  tableName: 'student_college_credentials',
  timestamps: true,
  underscored: true, 
});

export default StudentCollegeCred;
