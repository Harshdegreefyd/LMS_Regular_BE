// models/template.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 

const Template = sequelize.define('template', {
  template_name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  content_type: {
    type: DataTypes.ENUM('image', 'carousel', 'pdf', 'location'),
    allowNull: false
  },
  image: {
    type: DataTypes.TEXT, 
  },
  carousel_images: {
    type: DataTypes.ARRAY(DataTypes.TEXT) 
  },
  pdf_file: {
    type: DataTypes.TEXT
  },
  pdf_url: {
    type: DataTypes.TEXT
  },
  pdf_name: {
    type: DataTypes.TEXT
  },
  location_link: {
    type: DataTypes.TEXT
  },
  is_dynamic: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  placeholders: {
    type: DataTypes.JSONB, 
    defaultValue: {}
  },
 created_at:{
    type:DataTypes.DATE,
    defaultValue:Date.now()
  },
  updated_at:{
    type:DataTypes.DATE,
    allowNull:true
  }
}, {
  tableName: 'templates',
  underscored: true,
  timestamps: true,
  createdAt:'created_at',
  updatedAt:'updated_at'
});

export default Template;
