import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const StudentInfoCollection = sequelize.define('secondary_student_info', {
    student_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    student_info: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    timestamps: true,
    updatedAt: 'updated_at',
    createdAt: 'created_at'
});

export default StudentInfoCollection;
