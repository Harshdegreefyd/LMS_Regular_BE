import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const FilterOptions = sequelize.define('Filter_Options', {
  mode: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'mode',
  },
  source: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'source',
  },
  first_source_url: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'first_source_url',
  },
  lead_status: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'lead_status',
  },
  sub_lead_status: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'sub_lead_status',
  },
  calling_status: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'calling_status',
  },
  calling_sub_status: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'calling_sub_status',
  },
  campaign_name: {
    type: DataTypes.ARRAY(DataTypes.TEXT),
    defaultValue: [],
    field: 'campaign_name',
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at',
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at',
  },
}, {
  tableName: 'filter_options',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default FilterOptions;
