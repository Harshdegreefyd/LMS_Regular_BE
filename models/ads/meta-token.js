import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 
const MetaAdsToken = sequelize.define('MetaAdsToken', {
  page_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  page_access_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  long_lived_user_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'meta_ads_tokens',
  underscored: true,
  timestamps: true,
});

export default MetaAdsToken;
