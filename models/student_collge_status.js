import { DataTypes } from 'sequelize';
import sequelize from '../config/database-config.js'; 

const StudentCollegeSentStatus = sequelize.define('Student_College_Sent_Status', {
    student_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING,
        allowNull: true
    },
    college_name: {
        type: DataTypes.STRING,
        allowNull: true
    }
}, {
    tableName: 'student_college_sent_status',
    timestamps: false,
    underscored: true
});


export default StudentCollegeSentStatus;