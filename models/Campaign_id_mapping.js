import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const Campaign = sequelize.define(
  'Campaign_id_mapping',
  {
    campign_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      set(value) {
        this.setDataValue('campign_id', value?.trim());
      },
    },

    campign_name: {
      type: DataTypes.STRING,
      allowNull: true,
      set(value) {
        this.setDataValue('campign_name', value?.trim() || null);
      },
    },

    state: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        this.setDataValue('state', value?.trim());
      },
    },

    stream: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        this.setDataValue('stream', value?.trim());
      },
    },
    degree: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        this.setDataValue('degree', value?.trim());
      },
    },
    mode: {
      type: DataTypes.ENUM('Online', 'regular','online','full-time'),
      allowNull: false,
      validate: {
        isIn: {
          args: [['Online', 'regular','online','full-time']],
          msg: 'Mode must be either online or regular',
        },
      },
    },
  },
  {
    tableName: 'campaign_id_mapping',
    timestamps: true, 
    underscored: true, 
  }
);

export default Campaign;
