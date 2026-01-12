import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 
const LastAssignRegular = sequelize.define('last_assign_regular', {
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
    tableName: 'last_assign_regular',
    timestamps: false,
    underscored: true,
});

export default LastAssignRegular;
