import sequelize from '../config/database-config.js';

import Counsellor from './Counsellor.js';
import Student from './Student.js';
import UniversityCourse from './UniversityCourse.js';
import StudentRemark from './StudentRemark.js';
import CourseStatusHistory from './CourseStatusJourney.js';
import StudentLeadActivity from './StudentLeadActivity.js';
import CourseStatus from './courseStatus.js';
import AnalyserUser from './Analyser.js';
import Supervisor from './Supervisor.js';
import LeadAssignmentRuleL2 from './lead_assignement_rule_l2.js';
import LeadAssignmentRuleL3 from './lead_assignment_l3_rule.js';
import FilterOptions from './filterOptions.js';
//whatsapp template
import Template from './Templets.js';
import Chat from './Chat.js';
import Message from './Messages.js';
import StudentCollegeApiSentStatus from './CollegeAPISentStatus.js'
import counsellorBreak from './break_model.js'
//students college creds
// import StudentCollegeCred from './student_creds.js';
import StudentCollegeSentStatus from './student_collge_status.js';
// lead logs 
import LeadAssignmentLogs from './lead_logs.js';
import LastassignOnline from './last_assign_online.js'
import LastAssignRegular from './last_assign_regular.js';

//whish list schema
import WhishList from './WhishList.js'

//student credentials 
import StudentCollegeCred from './StudentCreads.js'
import UniversitiesAPIHeaderValues from './university_header_values.js'
Student.belongsTo(Counsellor, { foreignKey: 'assigned_counsellor_id', as: 'assignedCounsellor' });
Student.belongsTo(Counsellor, { foreignKey: 'assigned_counsellor_l3_id', as: 'assignedCounsellorL3' });

// Student has many StudentRemarks
Student.hasMany(StudentRemark, {
  foreignKey: 'student_id',
  sourceKey: 'student_id',
  as: 'student_remarks',
  onDelete: 'CASCADE'
});
Student.hasMany(StudentRemark, { as: 'remark_count', foreignKey: 'student_id' });
Student.hasMany(StudentRemark, { as: 'latest_remark', foreignKey: 'student_id' });

// StudentRemark belongs to Student
StudentRemark.belongsTo(Student, {
  foreignKey: 'student_id',
  targetKey: 'student_id',
  as: 'student'
});

// StudentRemark belongs to Counsellor
StudentRemark.belongsTo(Counsellor, {
  foreignKey: 'counsellor_id',
  targetKey: 'counsellor_id',
  as: 'counsellor'
});
Student.hasMany(CourseStatusHistory, { foreignKey: 'student_id', onDelete: 'CASCADE' });
CourseStatusHistory.belongsTo(Student, { foreignKey: 'student_id' });
CourseStatusHistory.belongsTo(Counsellor, { foreignKey: 'counsellor_id' });
CourseStatusHistory.belongsTo(UniversityCourse, { foreignKey: 'course_id' });
StudentRemark.belongsTo(Supervisor, {
  foreignKey: 'supervisor_id',
  targetKey: 'supervisor_id',
  as: 'supervisor'
});
Counsellor.belongsTo(Counsellor, {
  as: 'supervisor',
  foreignKey: 'assigned_to',
});

Counsellor.hasMany(Counsellor, {
  as: 'subordinates',
  foreignKey: 'assigned_to',
});
Supervisor.hasMany(StudentRemark, {
  foreignKey: 'supervisor_id',
  sourceKey: 'supervisor_id',
  as: 'student_remarks'
});
Student.hasMany(StudentLeadActivity, { foreignKey: 'student_id', as: 'lead_activities', onDelete: 'CASCADE' });
StudentLeadActivity.belongsTo(Student, { foreignKey: 'student_id', },);

Student.hasMany(CourseStatus, { foreignKey: 'student_id', onDelete: 'CASCADE' });
CourseStatus.belongsTo(Student, { foreignKey: 'student_id' });
CourseStatus.belongsTo(UniversityCourse, { foreignKey: 'course_id', as: 'courses_details' });
UniversityCourse.hasMany(CourseStatus, { foreignKey: 'course_id', as: 'latest_course_statuses' });
CourseStatus.belongsTo(Counsellor, { foreignKey: 'created_by', as: 'createdByCounsellor' });

//WhatsappMessage
Chat.hasMany(Message, { foreignKey: 'chat_id', as: 'messages', onDelete: 'CASCADE' });
Message.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });


//student college creds
Student.hasMany(StudentCollegeCred, { foreignKey: 'student_id', as: 'Student_collegeCreds', onDelete: 'CASCADE' });
StudentCollegeCred.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });
Counsellor.hasMany(StudentCollegeCred, { foreignKey: 'counsellor_id', as: 'counsellorCreds' });
StudentCollegeCred.belongsTo(Counsellor, { foreignKey: 'counsellor_id', as: 'counsellor' });

//LeadAssignmentRuleL2
// LeadAssignmentRuleL2.belongsTo(Counsellor,{foreignKey:"assigned_counsellor_ids", as:"assigned_counsellors"})
// Counsellor.hasMany(LeadAssignmentRuleL2,{foreignKey:"counsellor_id",as:"l2_rules"})


// //associations for CourseStatusJourney
// Student.hasMany(CourseStatusJourney, { foreignKey: 'student_id' });
// CourseStatusJourney.belongsTo(UniversityCourse, { foreignKey: 'course_id' });
// CourseStatusJourney.belongsTo(Student, { foreignKey: 'student_id' });

//lead_logs

Student.hasMany(LeadAssignmentLogs, { foreignKey: 'student_id', onDelete: 'CASCADE' })
// Supervisor.hasMany(LeadAssignmentLogs,{foreignKey:'assigned_by',sourceKey:"supervisor_id"})
Counsellor.hasMany(LeadAssignmentLogs, { foreignKey: 'assigned_counsellor_id', sourceKey: "counsellor_id" })
//reverse relation 
LeadAssignmentLogs.belongsTo(Student, { foreignKey: 'student_id' });
// LeadAssignmentLogs.belongsTo(Supervisor, { foreignKey: 'assigned_by', targetKey: 'supervisor_id' });
LeadAssignmentLogs.belongsTo(Counsellor, { foreignKey: 'assigned_counsellor_id', targetKey: 'counsellor_id' });

//college sent status
Student.hasMany(StudentCollegeSentStatus, { foreignKey: 'student_id', as: 'collegeSentStatus', onDelete: 'CASCADE' });
StudentCollegeSentStatus.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });

//StudentCollegeApiSentStatus
Student.hasMany(StudentCollegeApiSentStatus, { foreignKey: 'student_id', as: 'collegeApiSentStatus', onDelete: 'CASCADE' });
StudentCollegeApiSentStatus.belongsTo(Student, { foreignKey: 'student_id', as: 'student' });


//student credentials
Student.hasMany(StudentCollegeCred, { foreignKey: 'student_id', as: 'collegeCredentials', onDelete: 'CASCADE' });
StudentCollegeCred.belongsTo(Student, { foreignKey: 'student_id', as: 'studentInfo' });
Counsellor.hasMany(StudentCollegeCred, { foreignKey: 'counsellor_id', as: 'counsellorCredentials' });
StudentCollegeCred.belongsTo(Counsellor, { foreignKey: 'counsellor_id', as: 'assignedCounsellor' });
UniversityCourse.hasMany(StudentCollegeCred, { foreignKey: 'course_id', as: 'courseCredentials' });
StudentCollegeCred.belongsTo(UniversityCourse, { foreignKey: 'course_id', as: 'enrolledCourse' });


//whish list asso
WhishList.belongsTo(Student, { foreignKey: 'student_id', as: 'Whishlisted_students' })
WhishList.belongsTo(Counsellor, { foreignKey: "counsellor_id", as: "whishlisted_Counsellors" })
Student.hasMany(WhishList, { foreignKey: "student_id", as: "whishlist_students", onDelete: 'CASCADE' })
Counsellor.hasMany(WhishList, { foreignKey: "counsellor_id", as: "whishlist_Counsellors" })

// UniversitiesAPIHeaderValues assioaction rules
UniversitiesAPIHeaderValues.belongsTo(UniversityCourse, { foreignKey: "course_id", as: 'courses' })
UniversityCourse.hasMany(UniversitiesAPIHeaderValues, { foreignKey: "course_id", as: 'university_api' })

// counsellor break with counsellors table relation
Counsellor.hasMany(counsellorBreak, { foreignKey: "counsellor_id", as: 'counsellor_breaks' })
counsellorBreak.belongsTo(Counsellor, { foreignKey: "counsellor_id", as: 'counsellor_details' })

import WebsiteChat from './WebsiteChat.js';
import WebsiteChatMessage from './WebsiteChatMessage.js';


WebsiteChat.hasMany(WebsiteChatMessage, { foreignKey: 'chat_id', as: 'messages', onDelete: 'CASCADE' });
WebsiteChatMessage.belongsTo(WebsiteChat, { foreignKey: 'chat_id', as: 'chat' });

WebsiteChat.belongsTo(Counsellor, { foreignKey: 'counsellor_id' });
Counsellor.hasMany(WebsiteChat, { foreignKey: 'counsellor_id' });

export {
  sequelize,
  Counsellor,
  Student,
  UniversityCourse,
  StudentRemark,
  CourseStatusHistory,
  StudentLeadActivity,
  CourseStatus,
  AnalyserUser,
  Supervisor,
  LeadAssignmentRuleL2,
  LeadAssignmentRuleL3,
  FilterOptions,
  Template,
  Chat,
  Message,
  LeadAssignmentLogs,
  // StudentCollegeCred,
  counsellorBreak,
  StudentCollegeSentStatus,
  StudentCollegeApiSentStatus,
  LastAssignRegular,
  LastassignOnline,
  StudentCollegeCred,
  WhishList, UniversitiesAPIHeaderValues,
  WebsiteChat,
  WebsiteChatMessage
};


