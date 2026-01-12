import { DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import sequelize from '../config/database-config.js';

const UniversityCourse = sequelize.define('university_courses', {
  course_id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => 'CRS-' + uuidv4().substring(0, 8).toUpperCase(),
  },
  university_name: DataTypes.STRING,
  university_state: DataTypes.STRING,
  university_city: DataTypes.STRING,
  degree_name: DataTypes.STRING,
  specialization: DataTypes.STRING,
  stream: DataTypes.STRING,
  level: DataTypes.STRING,
  course_name: DataTypes.STRING,
  total_fees: DataTypes.DECIMAL,
  semester_fees: DataTypes.DECIMAL,
  annual_fees: DataTypes.DECIMAL,
  study_mode: DataTypes.STRING,
  duration: DataTypes.STRING,
  duration_type: {
    type: DataTypes.STRING,
    validate: { isIn: [['Years', 'Month', 'Semester', 'Annual']] }
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'Active',
    validate: { isIn: [['Active', 'Inactive']] }
  },
  // NEW FIELDS
  brochure_url: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isUrl: true
    }
  },
  usp: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
  eligibility: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
  },
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
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['university_name'] },
    { fields: ['stream'] },
    { fields: ['level'] },
    { fields: ['study_mode'] },
    { fields: ['degree_name'] },
    { fields: ['specialization'] },
    { fields: ['course_id'] }
  ]
});

export default UniversityCourse;
