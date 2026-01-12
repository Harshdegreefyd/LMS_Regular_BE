import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 
const MetaAdsLead = sequelize.define('MetaAdsLead', {
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
  campaign_name: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '',
  },
  source_url: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'meta_ads_leads',
  underscored: true,
  timestamps: false,
});

export default MetaAdsLead;
