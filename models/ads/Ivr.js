import { DataTypes } from 'sequelize';
import sequelize from '../../config/database-config.js'; 

const IvrCall = sequelize.define('ivr_call', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING,
    defaultValue: 'NA',
  },
  email: {
    type: DataTypes.STRING,
  },
  phone_number: {
    type: DataTypes.STRING,
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'IVR',
  },
  first_source_url: {
    type: DataTypes.STRING,
  },
  destination_number: {
    type: DataTypes.STRING,
  },
  dial_whom_number: {
    type: DataTypes.STRING,
  },
  call_duration: {
    type: DataTypes.INTEGER,
  },
  status: {
    type: DataTypes.STRING,
  },
  start_time: {
    type: DataTypes.DATE,
  },
  end_time: {
    type: DataTypes.DATE,
  },
  call_sid: {
    type: DataTypes.STRING,
  },
  call_recording_url: {
    type: DataTypes.TEXT,
  },
  talk_duration: {
    type: DataTypes.INTEGER,
  },
}, {
  tableName: 'ivr_calls',
  underscored: true, 
  timestamps: true,  
});

export default IvrCall;
