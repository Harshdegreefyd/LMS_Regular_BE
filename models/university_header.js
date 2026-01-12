import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 

const UniversitiesAPIHeader = sequelize.define('universities_api_header', {
  university_name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  headers: {
    type: DataTypes.JSONB, 
    allowNull: false,
    defaultValue: {},
  },
}, {
  tableName: 'universities_api_header',
  timestamps: true,
  underscored: true,
});

export default UniversitiesAPIHeader;
