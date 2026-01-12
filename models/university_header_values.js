import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 

const UniversitiesAPIHeaderValues = sequelize.define('universities_api_header_values', {
  course_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  university_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  values: {
    type: DataTypes.JSONB,  
    allowNull: false,
    defaultValue: {},
  },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
  tableName: 'universities_api_header_values',
  timestamps: false,
  underscored: true,
});

export default UniversitiesAPIHeaderValues;
