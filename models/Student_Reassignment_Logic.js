import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js';

const StudentAssignmentLogic = sequelize.define('student_reassignment_logic', {
    assignment_logic: {
        type: DataTypes.JSON,
        allowNull: false,
    },
    created_by: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    student_created_from: {
        type: DataTypes.STRING, 
        allowNull: false,
    },
    student_created_to: {
        type: DataTypes.STRING, 
        allowNull: false,
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'active'
    },
    lastAssignedCounsellorIndex:{
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    activity_logs: {
        type: DataTypes.JSON,
        defaultValue: []
    }
}, {
    tableName: 'student_reassignment_logic',
    timestamps: true,
    underscored: true,
});

export default StudentAssignmentLogic;