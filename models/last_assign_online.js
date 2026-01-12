import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 
const LastAssignOnline = sequelize.define('last_assign_online', {
    counsellor_id: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
}, {
    tableName: 'last_assign_online',
    timestamps: false,
    underscored: true,
});

export default LastAssignOnline;
