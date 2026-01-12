import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 

const GoogleAdsLead = sequelize.define('GoogleAdsLead', {
  created_time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  full_name: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
  form_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  additional_fields: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  campaign_id: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'google_ads_leads',
  timestamps: false, 
});

export default GoogleAdsLead;
