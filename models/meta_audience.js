import { DataTypes } from "sequelize";
import sequelize from "../config/database-config.js";

const MetaAudience = sequelize.define(
  "MetaAudience",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    group_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true
    },

    meta_audience_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },

    ad_account_id: {
      type: DataTypes.STRING(50),
      allowNull: false
    },

    audience_type: {
      type: DataTypes.ENUM("SYSTEM", "COLLEGE", "CAMPAIGN"),
      defaultValue: "SYSTEM"
    },

    status: {
      type: DataTypes.ENUM("ACTIVE", "DELETED"),
      defaultValue: "ACTIVE"
    },

    lead_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  },
  {
    tableName: "meta_audiences",
    underscored: true,
    timestamps: true
  }
);

export default MetaAudience;
