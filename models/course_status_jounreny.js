import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const CourseStatusJourney = sequelize.define('course_status_journeys', {
  status_history_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  student_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    references: {
      model: 'students',
      key: 'student_id'
    }
  },
  course_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    references: {
      model: 'university_courses',
      key: 'course_id'
    }
  },
  counsellor_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    references: {
      model: 'counsellors',
      key: 'counsellor_id'
    }
  },
  course_status: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  deposit_amount: {
    type: DataTypes.DECIMAL,
    defaultValue: 0
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'INR'
  },
  exam_interview_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_admission_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  timestamps: false,
  underscored: true,
  freezeTableName: true
});

export default CourseStatusJourney;
