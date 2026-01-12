import { DataTypes } from "sequelize";
import sequelize from "../config/database-config.js";

const MetaEventLog = sequelize.define(
  "MetaEventLog",
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },

    email: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
   phone:{
    type: DataTypes.STRING(64),
      allowNull: false
   }
   ,
  source: {
  type: DataTypes.STRING(64),
  allowNull: false,
  defaultValue: "Facebook"
},

    event_name: {
      type: DataTypes.STRING(50),
      allowNull: false
    },

    event_id: {
      type: DataTypes.STRING(100),
      allowNull: false
    },

    fired: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  },
  {
    tableName: "meta_event_logs",
    timestamps: true,
    underscored: true,

    indexes: [
      {
        unique: true,
        fields: ["email","phone", "event_name"]
      },

      {
        fields: ["email"]
      },

      {
        fields: ["event_name"]
      }
    ]
  }
);

export default MetaEventLog;
