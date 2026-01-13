import { Student, StudentRemark, Counsellor, StudentLeadActivity, LeadAssignmentLogs, LastAssignRegular, LastassignOnline, StudentCollegeCred, UniversityCourse, CourseStatus, sequelize, Supervisor, AnalyserUser } from '../models/index.js';
import { processStudentLead, SocketEmitter } from "../helper/leadAssignmentService.js"
import { createRemark } from './remark.controller.js';
import { Op, QueryTypes } from 'sequelize';
import pMap from 'p-map';
import axios from 'axios';
import activityLogger from './supervisorController.js'
import MetaAdsLead from '../models/ads/meta.js'
import { helperForMeta } from './meta_remarketing/metaEvents.js'
// import e from 'express';
import { formatDate } from './studentcoursestatus.controller.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
const getNextAgentInRoundRobin = async (agents, lastAssignedId, LastAssignedModel) => {
  if (agents.length === 0) return null;

  let nextAgent;
  if (!lastAssignedId) {
    nextAgent = agents[0];
  } else {
    const lastIndex = agents.findIndex(agent => agent.counsellor_id === lastAssignedId.toString());
    const nextIndex = (lastIndex + 1) % agents.length;
    nextAgent = agents[nextIndex];
  }
  const existing = await LastAssignedModel.findOne();

  if (existing) {
    await existing.update({
      counsellor_id: nextAgent.counsellor_id,
      updated_at: new Date(),
    });
  } else {
    await LastAssignedModel.create({
      counsellor_id: nextAgent.counsellor_id,
      created_at: new Date(),
      updated_at: new Date(),
    });
  }

  return nextAgent;
};
export const createStudent = async (req, res) => {
  try {
    const leads = Array.isArray(req.body) ? req.body : [req.body];

    if (leads.length === 0) {
      return res.status(400).json({ message: 'No leads provided' });
    }
    const processedLeads = [];
    const errors = [];
    const autoSendingid = []
    for (const leadData of leads) {
      const result = await processStudentLead(leadData);
      if (result.success) {
        processedLeads.push(result);
        if (['Landing Page', 'IVR', 'Google_Lead_Form'].includes(leadData?.source) && result?.studentStatus == 'created') {
          autoSendingid.push(result?.student?.student_id)
        }
      } else {
        errors.push({
          leadData: {
            email: leadData.email,
            phone: leadData.phoneNumber || leadData.phone_number || leadData.mobile || '',
          },
          error: result.error,
        });
      }
    }

    res.status(201).json({
      message: 'Leads processed',
      leads: processedLeads,
      summary: {
        total: leads.length,
        success: processedLeads.length,
        failed: errors.length,
        successRate: `${((processedLeads.length / leads.length) * 100).toFixed(2)}%`,
      },
      errors,
    });
   
  } catch (err) {
    console.error('❌ createStudent error:', err);
    res.status(500).json({
      message: 'Internal server error',
      error: err.message
    });
  }
};

export const updateStudentStatus = async (req, res) => {
  try {
    const { studentId } = req.params;
    const counsellorId = req.user.id;
    const counsellorName = req.user.name;
    const counsellorRole = req.user.role;
    let counsellorPreferredMode = req.user.counsellorPreferredMode || req.user.preferredMode;
    const {
      leadStatus,
      leadSubStatus,
      callingStatus,
      subCallingStatus,
      remark,
      callbackDate,
      callbackTime,
      enrolledDocumentUrl,
      feesAmount
    } = req.body;
    const student = await Student.findOne({
      where: { student_id: studentId }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    let updateFields = {};

    if (counsellorRole === 'l2' || counsellorRole === 'to' || counsellorRole === "Supervisor") {
      updateFields = {
        remarks_count: (student.remarks_count || 0) + 1,
        is_connected_yet: student.is_connected_yet || callingStatus === "Connected",
        is_reactivity: false
      };

      if (
        leadStatus === "Pre Application" &&
        leadSubStatus === "Initial Counseling Completed" && counsellorRole === 'l2'
      ) {
        const assignedTeamOwner = await Counsellor.findOne({ where: { counsellor_id: counsellorId }, attributes: ['assigned_to'], raw: true });
        if (!student.assigned_team_owner_date && !student.assigned_team_owner_id) {
          updateFields.assigned_team_owner_date = new Date();
          updateFields.assigned_team_owner_id = assignedTeamOwner.assigned_to;
        }
      }

    } else if (counsellorRole === 'l3') {
      updateFields = {
        calling_status_l3: callingStatus,
        sub_calling_status_l3: subCallingStatus,
        remarks_l3: remark,
        next_call_date_l3: callbackDate,
        next_call_time_l3: callbackTime,
        last_call_date_l3: new Date(),
        total_remarks_l3: (student.total_remarks_l3 || 0) + 1,
        remarks_count: (student.remarks_count || 0) + 1,
        is_connected_yet_l3: student.is_connected_yet_l3 || callingStatus === "Connected",
        is_reactivity: false,
      };
    } else {
      return res.status(403).json({ message: 'Unauthorized role' });
    }
    if (counsellorPreferredMode == "Online" && (leadStatus == "Application" || leadStatus == "Admission")) {
      updateFields.online_ffh = 1
    }

    // Update student
    const updatedStudent = await Student.update(
      updateFields,
      {
        where: { student_id: studentId },
        returning: true
      }
    );


    const remarkData = {
      student_id: studentId,
      counsellor_id: (counsellorRole !== "Supervisor" ? counsellorId : null),
      supervisor_id: (counsellorRole === "Supervisor" ? counsellorId : null),
      lead_status: leadStatus,
      lead_sub_status: leadSubStatus,
      calling_status: callingStatus,
      feesAmount: feesAmount,
      sub_calling_status: subCallingStatus,
      remarks: remark,
      callback_date: callbackDate,
      callback_time: callbackTime,
    };

    const newRemark = await createRemark(remarkData);



    if ((leadStatus === "NotInterested" || leadStatus === "Not Interested") && leadSubStatus === "Only_Online course") {
      const studentDetails = await Student.findByPk(studentId)
      const studentleadActivityDetails = await StudentLeadActivity.findOne({
        where: { student_id: studentId }
      });
      const payload = {
        name: studentDetails.dataValues.student_name,
        email: studentDetails.dataValues.student_email,
        phoneNumber: studentDetails.dataValues.student_phone,
        source: studentDetails.dataValues.source,
        first_source_url: studentDetails.dataValues.first_source_url,
        utm_campaign: studentleadActivityDetails.dataValues.utm_campaign,
        utm_campaign_id: studentleadActivityDetails.dataValues.utm_campaign_id,
        student_comment: studentleadActivityDetails.dataValues.student_comment,
      }
      const response = await axios.post('http://localhost:3001/v1/student/create', payload)
    }
    if (leadStatus === "enrolled" && req.files && req.files.enrollmentDocument) {
      const file = req.files.enrollmentDocument;
      enrolledDocumentUrl = await uploadToCloudinary(file.data, file.name);
    }

    if (student.source == 'CP_Ref') {
      let a = await axios.put('https://referral-partner-test.degreefyd.com/api/prospect/update-status', {
        funnel_1: leadStatus, funnel_2: leadSubStatus, phone: student.student_phone, email: student.student_email, enrolledDocument: enrolledDocumentUrl
      });
    }

    const updatedstudents = updatedStudent[1][0]
    const updatedStudentData = {
      ...updatedstudents.get({ plain: true }),
      student_remarks: [newRemark],
    };


    res.status(200).json({
      success: true,
      message: 'Student updated and remark created successfully',
      student: updatedStudentData,
      remark: newRemark,
    });
    const student_source = student?.source?.toLowerCase()
    if (student_source === "facebook" || student_source === "FaceBook_University_Admit".toLocaleLowerCase()) {

      const normalizePhone = (phone) =>
        phone ? phone.replace(/\D/g, "").slice(-10) : null;

      console.log("student?.student_email", student?.student_email);

      let metaData = null;

      const conditions = [];

      const email = student?.student_email || null;
      const phone = normalizePhone(student?.student_phone);

      if (email) {
        conditions.push({ email });
      }

      if (phone) {
        conditions.push({ phone_number: phone });
      }

      if (conditions.length > 0) {
        metaData = await MetaAdsLead.findOne({
          where: {
            [Op.or]: conditions
          }
        });
      }

      if (!metaData) {
        metaData = {
          id: `internal_${student.student_id}`,
          email,
          phone_number: phone
        };
      }

      const response_data = await helperForMeta({
        data: metaData,
        lead_status: leadStatus,
        lead_sub_status: leadSubStatus,
        source: student_source
      });
      console.log(response_data)
    }

  } catch (error) {
    console.error('Error processing student update:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing student update',
      error: error.message
    });
  }
};
export const findByContact = async (req, res) => {
  try {
    const { student_email, student_phone } = req.body;

    if (!student_email && !student_phone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide either email or phone number'
      });
    }

    const whereCondition = {
      [Op.or]: []
    };

    if (student_email) {
      whereCondition[Op.or].push({ student_email: student_email });
    }

    if (student_phone) {
      whereCondition[Op.or].push({ student_phone: student_phone });
    }

    const students = await Student.findAll({
      where: whereCondition,
      attributes: { exclude: [] },
      raw: true
    });

    if (!students || students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No student found with the provided contact details'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Student(s) found successfully',
      count: students.length,
      students: students
    });

  } catch (error) {
    console.error('Error in findByContact:', error);

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};
export const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const counsellorId = req.user.id;
    const counsellorRole = req.user.role;

    let whereConditions = {};

    if (counsellorRole === 'l2') {
      whereConditions = {
        student_id: id,
        [Op.or]: [
          { assigned_counsellor_id: counsellorId },
          { assigned_counsellor_l3_id: counsellorId }
        ]
      };
    } else if (counsellorRole === 'Analyser') {
      const analyser = await AnalyserUser.findByPk(counsellorId);

      if (!analyser) {
        return res.status(403).json({
          message: "Analyser not found or inactive"
        });
      }

      const sourceConditions = [];

      if (analyser.sources && analyser.sources.length > 0) {
        analyser.sources.forEach(source => {
          sourceConditions.push({
            source: { [Op.iLike]: `%${source}%` }
          });
        });
      }

      if (sourceConditions.length === 0) {
        sourceConditions.push(
          { source: { [Op.iLike]: '%facebook%' } },
          { source: { [Op.iLike]: '%fb%' } }
        );
      }

      whereConditions = {
        student_id: id,
        [Op.or]: sourceConditions
      };
    } else {
      whereConditions = {
        student_id: id
      };
    }

    const includeRemarksCondition = {};
    if (counsellorRole === 'l2' || counsellorRole === 'to') {
      includeRemarksCondition.where = { isdisabled: false };
    }

    const student = await Student.findOne({
      where: whereConditions,
      include: [{
        model: StudentRemark,
        as: 'student_remarks',
        order: [['created_at', 'DESC']],
        required: false,
        ...includeRemarksCondition,
        include: [{
          model: Counsellor,
          as: 'counsellor',
          attributes: ['counsellor_name'],
          required: false,
        }, {
          model: Supervisor,
          as: 'supervisor',
          attributes: ['supervisor_name'],
          required: false,
        }]
      }, {
        model: StudentLeadActivity,
        as: 'lead_activities',
        order: [['created_at', 'DESC']],
        required: false
      }, {
        model: Counsellor,
        as: 'assignedCounsellor',
        attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
        required: false
      },
      {
        model: Counsellor,
        as: 'assignedCounsellorL3',
        attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
        required: false
      },
      {
        model: StudentCollegeCred,
        as: 'collegeCredentials',
        required: false,
        include: [
          {
            model: Counsellor,
            as: 'assignedCounsellor',
            attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
            required: false
          },
          {
            model: UniversityCourse,
            as: 'enrolledCourse',
            attributes: ['course_id', 'university_name', 'course_name'],
            required: false
          }
        ]
      }]
    });

    if (!student) {
      if (counsellorRole === 'Analyser') {
        const analyser = await AnalyserUser.findByPk(counsellorId);
        const allowedSources = analyser?.sources || ['facebook', 'fb'];

        return res.status(404).json({
          message: `Student not found or not accessible. Analyser can only access students from: ${allowedSources.join(', ')}`
        });
      }
      return res.status(404).json({ message: "Student not found" });
    }

    let studentData = student.toJSON ? student.toJSON() : student;

    if (counsellorRole.toLowerCase() === 'analyser') {
      if (studentData.student_name) {
        const name = studentData.student_name.trim();
        if (name.length > 1) {
          studentData.student_name = name.substring(0, 1) + '*'.repeat(name.length - 1);
        } else if (name.length === 1) {
          studentData.student_name = name + '*';
        } else {
          studentData.student_name = '***';
        }
      }

      if (studentData.student_phone) {
        const phone = studentData.student_phone.toString();
        if (phone.length > 4) {
          studentData.student_phone = phone.substring(0, 4) + 'XXXXXX';
        } else {
          studentData.student_phone = 'XXXXXX';
        }
      }

      if (studentData.parents_number) {
        const parentsPhone = studentData.parents_number.toString();
        if (parentsPhone.length > 4) {
          studentData.parents_number = parentsPhone.substring(0, 4) + 'XXXXXX';
        } else {
          studentData.parents_number = 'XXXXXX';
        }
      }

      if (studentData.whatsapp) {
        const whatsapp = studentData.whatsapp.toString();
        if (whatsapp.length > 4) {
          studentData.whatsapp = whatsapp.substring(0, 4) + 'XXXXXX';
        } else {
          studentData.whatsapp = 'XXXXXX';
        }
      }

      if (studentData.student_email) {
        const email = studentData.student_email;
        const atIndex = email.indexOf('@');
        if (atIndex > 0) {
          const username = email.substring(0, Math.min(atIndex, 3)) + '***';
          studentData.student_email = username + '@xxxxxx.com';
        } else {
          studentData.student_email = 'xxxxxx@xxxxxx.com';
        }
      }

      if (studentData.student_secondary_email) {
        const secEmail = studentData.student_secondary_email;
        const atIndex = secEmail.indexOf('@');
        if (atIndex > 0) {
          const username = secEmail.substring(0, Math.min(atIndex, 3)) + '***';
          studentData.student_secondary_email = username + '@xxxxxx.com';
        } else {
          studentData.student_secondary_email = 'xxxxxx@xxxxxx.com';
        }
      }

      if (studentData.lead_activities && studentData.lead_activities.length > 0) {
        studentData.lead_activities = studentData.lead_activities.map(activity => {
          if (activity.student_name) {
            const activityName = activity.student_name.trim();
            if (activityName.length > 1) {
              activity.student_name = activityName.substring(0, 1) + '*'.repeat(activityName.length - 1);
            } else if (activityName.length === 1) {
              activity.student_name = activityName + '*';
            } else {
              activity.student_name = '***';
            }
          }

          if (activity.student_phone) {
            const phone = activity.student_phone.toString();
            if (phone.length > 4) {
              activity.student_phone = phone.substring(0, 4) + 'XXXXXX';
            } else {
              activity.student_phone = 'XXXXXX';
            }
          }

          if (activity.parents_number) {
            const parentsPhone = activity.parents_number.toString();
            if (parentsPhone.length > 4) {
              activity.parents_number = parentsPhone.substring(0, 4) + 'XXXXXX';
            } else {
              activity.parents_number = 'XXXXXX';
            }
          }

          if (activity.whatsapp) {
            const whatsapp = activity.whatsapp.toString();
            if (whatsapp.length > 4) {
              activity.whatsapp = whatsapp.substring(0, 4) + 'XXXXXX';
            } else {
              activity.whatsapp = 'XXXXXX';
            }
          }

          if (activity.student_email) {
            const email = activity.student_email;
            const atIndex = email.indexOf('@');
            if (atIndex > 0) {
              const username = email.substring(0, Math.min(atIndex, 3)) + '***';
              activity.student_email = username + '@xxxxxx.com';
            } else {
              activity.student_email = 'xxxxxx@xxxxxx.com';
            }
          }

          return activity;
        });
      }

      studentData.data_masked = true;
      studentData.mask_note = 'Personal information is masked for analyser role';
      studentData.mask_details = {
        name: 'Shows first character followed by asterisks',
        phone: 'Shows first 4 digits followed by XXXXXX',
        email: 'Shows first 3 characters of username followed by ***@xxxxxx.com'
      };
    }

    return res.status(200).json(studentData);
  } catch (error) {
    console.error("Error fetching student:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const updateStudentDetails = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { payload } = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ message: "Invalid payload in request body" });
    }

    const formatArray = (value) => {
      if (value === null || value === undefined) return undefined;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string' && value.trim() === '') return undefined;
      return [value];
    };

    const updateData = {};

    if ('name' in payload) updateData.student_name = payload.name;
    if ('whatsapp' in payload) updateData.whatsapp = payload.whatsapp;
    if ('parents_number' in payload) updateData.parents_number = payload.parents_number;
    if ('student_secondary_email' in payload) updateData.student_secondary_email = payload.student_secondary_email;
    if ('student_current_city' in payload) updateData.student_current_city = payload.student_current_city;
    if ('student_current_state' in payload) updateData.student_current_state = payload.student_current_state;
    if ('preferredStream' in payload) updateData.preferred_stream = formatArray(payload.preferredStream);
    if ('preferredDegree' in payload) updateData.preferred_degree = formatArray(payload.preferredDegree);
    if ('preferredLevel' in payload) updateData.preferred_level = formatArray(payload.preferredLevel);
    if ('preferredSpecialization' in payload) updateData.preferred_specialization = formatArray(payload.preferredSpecialization);
    if ('mode' in payload) updateData.mode = payload.mode;
    if ('preferredState' in payload) updateData.preferred_state = formatArray(payload.preferredState);
    if ('preferredCity' in payload) updateData.preferred_city = formatArray(payload.preferredCity);
    if ('preferredBudget' in payload) updateData.preferred_budget = payload.preferredBudget;
    if ('student_age' in payload) updateData.student_age = payload.student_age;
    if ('highest_degree' in payload) updateData.highest_degree = payload.highest_degree;
    if ('completion_year' in payload) updateData.completion_year = payload.completion_year;
    if ('current_profession' in payload) updateData.current_profession = payload.current_profession;
    if ('current_role' in payload) updateData.current_role = payload.current_role;
    if ('work_experience' in payload) updateData.work_experience = payload.work_experience;
    if ('objective' in payload) updateData.objective = payload.objective;


    const studentExists = await Student.findOne({
      where: { student_id: studentId }
    });

    if (!studentExists) {
      return res.status(404).json({ message: "Student not found" });
    }

    if (Object.keys(updateData).length === 0) {
      console.log('✅ No fields to update - returning success');
      return res.status(200).json({
        message: "No changes to update",
        student: studentExists,
      });
    }

    const [affectedCount, updatedStudents] = await Student.update(
      updateData,
      {
        where: { student_id: studentId },
        returning: true
      }
    );


    return res.status(200).json({
      message: "Student details processed successfully",
      student: updatedStudents?.[0] || studentExists,
      fieldsUpdated: Object.keys(updateData).length,
    });

  } catch (error) {
    console.error("❌ ERROR updating student:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

export const bulkCreateLeads = async (req, res) => {
  try {
    const { data } = req.body;
    const supervisorId = req?.user?.id
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format. Expected array of lead objects.'
      });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const leadData = data[i];

      try {

        const requiredFields = ['name', 'email', 'phoneNumber', 'counsellorId'];
        const missingFields = requiredFields.filter(field => !leadData[field]);

        if (missingFields.length > 0) {
          errors.push({
            index: i + 1,
            data: leadData,
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
          continue;
        }

        const agent = await Counsellor.findOne({
          where: { counsellor_id: leadData.counsellorId }
        });

        if (!agent) {
          errors.push({
            index: i + 1,
            data: leadData,
            error: `Active agent with ID ${leadData.counsellorId} not found`
          });
          continue;
        }

        // Check for duplicate email or phone
        const existingStudent = await Student.findOne({
          where: {
            [Op.or]: {
              student_email: leadData.email,
              student_phone: leadData.phoneNumber
            }
          }
        });

        if (existingStudent) {
          errors.push({
            index: i + 1,
            data: leadData,
            error: 'Student with this email or phone number already exists'
          });
          continue;
        }

        const savedStudent = await Student.create({
          student_name: leadData.name,
          student_email: leadData.email,
          student_phone: leadData.phoneNumber,
          assigned_counsellor_id: agent.counsellorId,
        });
        try {
          const log = await LeadAssignmentLogs.create({
            assigned_counsellor_id: agent.counsellorId,
            student_id: savedStudent.student_id,
            assigned_by: supervisorId || '',
            reference_from: 'bulk students created by Supervisor' || null
          });
        } catch (err) {
          console.error('❌ Failed to create LeadAssignmentLog:', err);
        }

        results.push({
          index: i + 1,
          student_id: savedStudent.student_id,
          name: savedStudent.student_name,
          email: savedStudent.student_email,
          phoneNumber: savedStudent.phone_number,
          agent_id: leadData.assigned_counsellor_id,
          agent_name: '',
          data: leadData,
          status: 'created'
        });

      } catch (error) {
        console.error(`Error processing lead at index ${i + 1}:`, error);
        errors.push({
          index: i + 1,
          data: leadData,
          error: error.message
        });
      }
    }

    const response = {
      success: true,
      message: `Processed ${data.length} leads: ${results.length} created, ${errors.length} failed`,
      summary: {
        total_processed: data.length,
        successful_count: results.length,
        failed_count: errors.length,
        success_rate: ((results.length / data.length) * 100).toFixed(2) + '%'
      },
      results: {
        successful_leads: results,
        failed_leads: errors
      }
    };



    res.status(200).json(response);
    activityLogger(req, response)
  } catch (error) {
    console.error('Bulk create leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
    activityLogger(req, error)
  }
};

export const bulkReassignLeads = async (req, res) => {
  try {

    const supervisorId = req?.user?.id;
    const { data, level } = req.body.data;
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.log('Invalid data format:', data);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format. Expected array of reassignment objects.'
      });
    }

    let counsellorField = null;
    if (level?.toLowerCase() === 'l2') {
      counsellorField = 'assigned_counsellor_id';
    } else if (level?.toLowerCase() === 'l3') {
      counsellorField = 'assigned_counsellor_l3_id';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid level. Expected L2 or L3.'
      });
    }
    const toLowerCaseLevel = level?.toLowerCase();
    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const reassignmentData = data[i];

      try {
        // Check if student exists
        const student = await Student.findByPk(reassignmentData.studentId);
        if (!student) {
          errors.push({
            index: i + 1,
            data: reassignmentData,
            error: `Student with ID ${reassignmentData.studentId} not found`
          });
          continue;
        }

        // Check if new agent exists
        const newAgent = await Counsellor.findOne({
          where: { counsellor_id: reassignmentData.counsellorId, role: toLowerCaseLevel }
        });

        if (!newAgent) {
          errors.push({
            index: i + 1,
            data: reassignmentData,
            error: `Agent with ID ${reassignmentData.counsellorId} not found with that role ${level}`
          });
          continue;
        }

        // Get old agent for logs
        const oldAgentId = student[counsellorField];
        const oldAgent = oldAgentId
          ? await Counsellor.findOne({ where: { counsellor_id: oldAgentId } })
          : null;

        // Update student assignment (L2 or L3 depending on level)
        const [_, [updatedStudent]] = await Student.update(
          { [counsellorField]: newAgent.counsellor_id },
          {
            where: { student_id: reassignmentData.studentId },
            returning: true
          }
        );

        // Create log
        try {
          await LeadAssignmentLogs.create({
            assigned_counsellor_id: newAgent.counsellor_id,
            student_id: reassignmentData.studentId,
            assigned_by: supervisorId || '',
            reference_from: `bulk students re assignment by Supervisor (${level})`
          });
        } catch (err) {
          console.error('❌ Failed to create LeadAssignmentLog:', err);
        }

        results.push({
          index: i + 1,
          student_id: reassignmentData.studentId,
          old_agent: oldAgent ? oldAgent.counsellor_name : 'None',
          new_agent: newAgent.counsellor_name,
          data: reassignmentData,
          status: 'reassigned'
        });
      } catch (error) {
        errors.push({
          index: i + 1,
          data: reassignmentData,
          error: error.message
        });
      }
    }

    // Final response
    const responsePayload = {
      success: true,
      message: `Processed ${data.length} reassignments for ${level}`,
      results: {
        reassigned: results.length,
        errors: errors.length,
        successful_reassignments: results,
        failed_leads: errors
      }
    };

    res.status(200).json(responsePayload);
    await activityLogger(req, responsePayload);

  } catch (error) {
    console.error('Bulk reassign leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
    await activityLogger(req, error);
  }
};


export const addLeadDirect = async (req, res) => {
  try {
    const { name, email, phoneNumber, source, counselloridFe, referenceFrom } = req.body;

    if (!name || !email || !phoneNumber || !source) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, phone number, and source are required.'
      });
    }

    const validBasicSources = ['counsellor_ref', 'student_ref'];
    if (!validBasicSources.includes(source) && referenceFrom !== 'other') {
      return res.status(400).json({
        success: false,
        message: 'For non-standard sources, referenceFrom should be "other".'
      });
    }

    if (source === 'student_ref' && !referenceFrom) {
      return res.status(400).json({
        success: false,
        message: 'Student ID is required for student_ref source.'
      });
    }

    if (referenceFrom === 'other' && !source) {
      return res.status(400).json({
        success: false,
        message: 'Source selection is required for "other" reference type.'
      });
    }

    let counsellorId = req.user?.counsellorId || req.user?.supervisorId || req.user?.id || null;
    let counsellorName = req.user?.name || '';

    if (counselloridFe) {
      const counsellor = await Counsellor.findOne({ where: { counsellor_id: counselloridFe } });
      if (counsellor) {
        counsellorId = counsellor.counsellor_id;
        counsellorName = counsellor.counsellor_name;
      }
    }

    const existingLead = await Student.findOne({
      where: {
        [Op.or]: [
          { student_email: email },
          { student_phone: phoneNumber }
        ]
      }
    });

    if (existingLead) {
      return res.status(400).json({
        success: false,
        message: 'Lead already exists in the system.'
      });
    }

    let inheritedData = {};
    let referenceStudent = null;

    if (source === 'student_ref' && referenceFrom) {
      referenceStudent = await Student.findOne({
        where: { student_id: referenceFrom?.trim() ?? '' },
        include: {
          model: StudentLeadActivity,
          as: 'lead_activities',
          required: false,
          order: [['created_at', 'ASC']],
          limit: 1,
        }
      });

      if (!referenceStudent) {
        return res.status(400).json({
          success: false,
          message: 'Referenced student not found.'
        });
      }
      inheritedData = {
        first_source_url: referenceStudent.lead_activities.length > 0 ? referenceStudent?.lead_activities[0].source_url : '',
        utm_source: referenceStudent.lead_activities.length > 0 ? referenceStudent?.lead_activities[0].utm_source.utm_source : '',
        utm_medium: referenceStudent.lead_activities.length > 0 ? referenceStudent.lead_activities[0].utm_medium : '',
        utm_keyword: referenceStudent.lead_activities.length > 0 ? referenceStudent.lead_activities[0].utm_keyword : '',
        utm_campaign: referenceStudent.lead_activities.length > 0 ? referenceStudent.lead_activities[0].utm_campaign : '',
        utm_campaign_id: referenceStudent.lead_activities.length > 0 ? referenceStudent.lead_activities[0].utm_campaign_id : '',
        utm_adgroup_id: referenceStudent.lead_activities.length > 0 ? referenceStudent.lead_activities[0].utm_adgroup_id : '',
        utm_creative_id: referenceStudent.lead_activities.length > 0 ? referenceStudent.lead_activities[0].utm_creative_id : '',
        source_url: referenceStudent.lead_activities.length > 0 ? referenceStudent?.lead_activities[0].source_url : '',

      };
    }

    // Create lead
    const lead = await Student.create({
      student_name: name,
      student_email: email,
      student_phone: phoneNumber,
      assigned_counsellor_id: counsellorId,
      source,
    });


    await StudentLeadActivity.create({
      student_name: name,
      student_email: email,
      student_phone: phoneNumber,
      student_id: lead.student_id,
      assigned_counsellor_id: counsellorId,
      source,
      ...inheritedData
    });


    try {
      const log = await LeadAssignmentLogs.create({
        assigned_counsellor_id: counsellorId,
        student_id: lead.student_id,
        assigned_by: 'direct lead add',
        reference_from: referenceFrom || null
      });
    } catch (err) {
      console.error('❌ Failed to create LeadAssignmentLog:', err);
    }


    return res.status(201).json({
      success: true,
      message: 'Lead created successfully',
      data: {
        ...lead.toJSON(),
        referenceStudent: referenceStudent ? {
          student_id: referenceStudent.student_id,
          student_name: referenceStudent.student_name,
          student_email: referenceStudent.student_email
        } : null
      }
    });

  } catch (error) {
    console.error('Error adding lead:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Something went wrong while creating lead.'
    });
  }
};
// export const getAllLeadsofData = async (req, res) => {

//   try {
//     const limit = parseInt(req.query.limit) || 5000;
//     const offset = parseInt(req.query.offset) || 0;
//     const includeArray = [
//       {
//         model: Counsellor,
//         as: 'assignedCounsellor',
//         attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
//         required: false,
//       },
//       {
//         model: Counsellor,
//         as: 'assignedCounsellorL3',
//         attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
//         required: false,
//       },
//       {
//         model: StudentRemark,
//         as: 'student_remarks',
//         separate: true,
//         limit: 1,
//         order: [['created_at', 'DESC']],
//       },
//       {
//         model: StudentLeadActivity,
//         as: 'lead_activities',
//         attributes: [
//           'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
//           'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at', 'source', 'source_url'
//         ],
//         required: false,
//         separate: false,
//         limit: 1,
//         order: [['created_at', 'ASC']]
//       },
//       {
//         model: CourseStatus,
//         required: false,
//         separate: false,
//         order: [['created_at', 'ASC']]
//       },

//     ]; 

//     //  const leads = await  Student.findAll({
//     //         include:includeArray,
//     //         limit: limit,
//     //         offset: offset,
//     //         order: [['created_at','DESC']],
//     //         distinct: true,
//     //       })
//     const query = `
//     SELECT
//       s.student_id,
//       s.student_name,
//       s.student_email,
//       s.student_phone,
//       s.created_at,

//       jsonb_agg(DISTINCT jsonb_build_object(
//         'remark_id', r.remark_id,
//         'lead_status', r.lead_status,
//         'lead_sub_status', r.lead_sub_status,
//         'calling_status', r.calling_status,
//         'sub_calling_status', r.sub_calling_status,
//         'remarks', r.remarks,
//         'callback_date', r.callback_date,
//         'callback_time', r.callback_time,
//         'created_at', r.created_at
//       )) FILTER (WHERE r.remark_id IS NOT NULL) as remarks,
//       jsonb_agg(DISTINCT jsonb_build_object(
//         'utm_source', a.utm_source,
//         'utm_medium', a.utm_medium,
//         'source', a.source,
//         'source_url', a.source_url
//       )) FILTER (WHERE a.student_id IS NOT NULL) as lead_activities,
//       COUNT(*) OVER() as total_count
//     FROM students s
//     LEFT JOIN student_remarks r ON r.student_id = s.student_id

//     LEFT JOIN student_lead_activities a ON a.student_id = s.student_id

//     GROUP BY s.student_id
//     ORDER BY s.created_at DESC limit 10

//   `;
//      const [students] = await Promise.all([
//       sequelize.query(query, { type: QueryTypes.SELECT }),

//     ]);

//     const mappedLeads = await pMap(
//       students,
//       async (lead) => {
//         return {
//           _id: lead.student_id,
//           name: lead.student_name,
//           email: lead.student_email,
//           funnel_1: lead.student_remarks?.length>0?lead.student_remarks[0].lead_status : '' || '' ,
//           funnel_2: lead.student_remarks?.length>0?lead.student_remarks[0].lead_sub_status :''  || '',
//           mode: lead?.mode,
//           Callng_Status: lead.student_remarks?.length>0?lead.student_remarks[0].calling_status : '' || '',
//           Sub_Calling_Status: lead.student_remarks?.length>0?lead.student_remarks[0].sub_calling_status :'' || '',
//           remarks: lead.student_remarks?.length>0?lead.student_remarks[0].remarks :' ' || '',
//           preferred_stream: lead.preferred_stream,
//           preferred_state: lead.preferred_state,
//           utm_campaign: lead.lead_activities?.length>0?lead.lead_activities[0].utm_campaign : '' || '',
//           student_id: lead.student_id,
//           createdAt: lead.created_at,
//           agent_name: lead.assignedCounsellor?.counsellor_name,
//           assigned_l3_date: lead.assigned_l3_date,
//           last_call_date_l3: lead.last_call_date_l3,
//           next_call_date_l3: lead.next_call_date_l3,
//           Callng_Status_l3: lead.calling_status_l3,
//           Sub_Calling_Status_l3: lead.sub_calling_status_l3,
//           remarks_l3: lead.remarks_l3,
//           // collegeStatus,
//           source: lead.lead_activities?.length>0?lead.lead_activities[0].source : '' || lead.source,
//           agent_name_l3: lead.assignedCounsellorL3?.counsellor_name,
//           firstcallbackl2: lead.firstCallbackL2 || '',
//           firstcallbackl3: lead.firstCallbackL3 || '',
//           firstformfilleddate: lead?.first_form_filled_date || ' ',
//         };
//       },
//       { concurrency: 10 } 
//     );

//     res.status(200).json(leads[0]);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Internal Server Error' });
//   }
// };;



export const getAllLeadsofData = async (req, res) => {
  try {
    const limit = 10000;
    let offset = 0;
    let allStudents = [];

    const query = `
        SELECT
          s.student_id,
          s.student_name,
          s.student_email,
          s.student_phone,
          s.created_at,
          s.assigned_counsellor_id,
          s.assigned_counsellor_l3_id,
          s.remarks_l3
          jsonb_agg(DISTINCT jsonb_build_object(
            'remark_id', r.remark_id,
            'lead_status', r.lead_status,
            'lead_sub_status', r.lead_sub_status,
            'calling_status', r.calling_status,
            'sub_calling_status', r.sub_calling_status,
            'remarks', r.remarks,
            'callback_date', r.callback_date,
            'callback_time', r.callback_time,
            'created_at', r.created_at
          )) FILTER (WHERE r.remark_id IS NOT NULL) as remarks,
          jsonb_agg(DISTINCT jsonb_build_object(
            'utm_source', a.utm_source,
            'utm_medium', a.utm_medium,
            'source', a.source,
            'source_url', a.source_url
          )) FILTER (WHERE a.student_id IS NOT NULL) as lead_activities
        FROM students s
        LEFT JOIN student_remarks r ON r.student_id = s.student_id
        LEFT JOIN student_lead_activities a ON a.student_id = s.student_id
        GROUP BY s.student_id
        ORDER BY s.created_at DESC
       
      `;
    console.time('query time')
    const batch = await sequelize.query(query, { type: QueryTypes.SELECT });
    console.timeEnd('query time')

    const mappedBatch = await pMap(
      batch,
      async (lead) => ({
        _id: lead.student_id,
        name: lead.student_name,
        email: lead.student_email,
        funnel_1: lead.remarks?.length > 0 ? lead.remarks[0].lead_status : '',
        funnel_2: lead.remarks?.length > 0 ? lead.remarks[0].lead_sub_status : '',
        mode: lead?.mode,
        Callng_Status: lead.remarks?.length > 0 ? lead.remarks[0].calling_status : '',
        Sub_Calling_Status: lead.remarks?.length > 0 ? lead.remarks[0].sub_calling_status : '',
        remarks: lead.remarks?.length > 0 ? lead.remarks[0].remarks : '',
        preferred_stream: lead?.preferred_stream,
        preferred_state: lead?.preferred_state,
        utm_campaign: lead.lead_activities?.length > 0 ? lead.lead_activities[0].utm_campaign : '',
        student_id: lead.student_id,
        createdAt: lead.created_at,
        source: lead.lead_activities?.length > 0 ? lead.lead_activities[0].source : '',
      }),
      { concurrency: 10 }
    );

    allStudents.push(...mappedBatch);

    offset += limit;
    res.status(200).json(allStudents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};


export const getAllLeadsofDatatest = async (req, res) => {
  try {
    const limit = 10000;
    let offset = 0;
    let allStudents = [];
    const lRemarkSQL = `
      latest_remark AS (
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id, sr.remark_id, sr.lead_status, sr.lead_sub_status, sr.calling_status,
          sr.sub_calling_status, sr.remarks, sr.callback_date, sr.callback_time,
          sr.created_at as remark_created_at, sr.counsellor_id
        FROM student_remarks sr
        ORDER BY sr.student_id, sr.created_at DESC
      )
    `;
    const leadActivitySQL = `
      first_lead_activity AS (
        SELECT DISTINCT ON (la.student_id)
          la.student_id, la.utm_source, la.utm_medium, la.utm_campaign, la.utm_keyword,
          la.utm_campaign_id, la.utm_adgroup_id, la.utm_creative_id, la.source,
          la.source_url, la.created_at as activity_created_at
        FROM student_lead_activities la
      
        ORDER BY la.student_id, la.created_at ASC
      )`;
    const ctesSQL = [lRemarkSQL, leadActivitySQL].join(',\n');
    const mainQuery = `
      WITH
      ${ctesSQL}
      SELECT
        s.student_id,
        s.student_name,
        s.student_email,
        s.student_phone,
        s.total_remarks_l3,
        s.created_at,
        s.assigned_l3_date,
        s.last_call_date_l3,
        s.next_call_time_l3,
        s.is_reactivity,
        s.next_call_date_l3,
        s.first_callback_l3,
        s.remarks_count,
        s.calling_status_l3,
        s.sub_calling_status_l3,
        s.first_form_filled_date,
        s.mode,
        s.online_ffh,
        c1.counsellor_id as counsellor_id,
        c1.counsellor_name as counsellor_name,
      

        c2.counsellor_id as counsellor_l3_id,
        c2.counsellor_name as counsellor_l3_name,
       

        lr.remark_id,
        lr.lead_status,
        lr.lead_sub_status,
        lr.calling_status,
        lr.sub_calling_status,
        lr.remarks,
        lr.callback_date as latest_callback_date,
        lr.callback_time,
        lr.remark_created_at as latest_remark_date,

        fla.utm_source,
        fla.utm_medium,
        fla.utm_campaign,
        fla.utm_keyword,
        fla.utm_campaign_id,
        fla.utm_adgroup_id,
        fla.utm_creative_id,
        fla.source,
        fla.source_url,
        fla.activity_created_at

      FROM students s
      LEFT JOIN counsellors c1 ON s.assigned_counsellor_id = c1.counsellor_id
      LEFT JOIN counsellors c2 ON s.assigned_counsellor_l3_id = c2.counsellor_id
      LEFT JOIN latest_remark lr ON s.student_id = lr.student_id
      LEFT JOIN first_lead_activity fla ON s.student_id = fla.student_id
      
    `;
    console.time('query time')
    const batch = await sequelize.query(mainQuery, { type: QueryTypes.SELECT });
    console.timeEnd('query time')

    const mappedBatch = await pMap(
      batch,
      async (lead) => ({
        _id: lead.student_id || '',
        name: lead.student_name,
        email: lead.student_email,
        funnel_1: lead.lead_status || 'Fresh',
        funnel_2: lead.lead_sub_status || 'Untouched Lead',
        mode: lead?.mode,
        Callng_Status: lead.calling_status || '',
        Sub_Calling_Status: lead.sub_calling_status || '',
        remarks: lead.remarks || '',
        preferred_stream: lead?.preferred_stream || '',
        preferred_state: lead?.preferred_state || '',
        utm_campaign: lead.utm_campaign || '',
        student_id: lead.student_id,
        createdAt: formatDate(lead.created_at) || '',
        agent_name: lead.counsellor_name || '',
        assigned_l3_date: lead?.assigned_l3_date || '',
        last_call_date_l3: lead?.last_call_date_l3 || '',
        next_call_date_l3: lead?.next_call_time_l3 || '',
        Callng_Status_l3: lead?.calling_status_l3 || '',
        Sub_Calling_Status_l3: lead?.sub_calling_status_l3 || '',
        remarks_l3: lead?.remarks_l3 || '',
        source: lead.source || '',
        agent_name_l3: lead.counsellor_l3_name || '',
        firstcallbackl2: "",
        firstcallbackl3: lead?.first_callback_l3 || '',
        firstformfilleddate: lead?.first_form_filled_date || '',
        online_ffh: lead?.online_ffh || '',
      }),
      { concurrency: 10 }
    );

    allStudents.push(...mappedBatch);


    res.status(200).json(allStudents);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error });
  }
};
(async () => {
  const metaData = await MetaAdsLead.findOne({
    where: { email: 'singhlalmuni164@gmail.com' }
  });
  console.log(metaData)
  if (!metaData) {
    console.warn(
      `Meta lead not found for email: abigailcdesouza@gmail.com`
    );
    return;
  }

  const response_data = await helperForMeta({
    data: metaData,
    lead_status: "Pre Application",
    lead_sub_status: "Initial Counseling Completed"
  });
  console.log('responseData', response_data)

})



import ExcelJS from 'exceljs';

export const getniReports = async (req, res) => {
  try {
    const {
      fromDate = new Date().toISOString().split('T')[0],
      toDate = new Date().toISOString().split('T')[0],
      reportType = 'counsellor',
      isExport = false
    } = req.query;

    // Convert dates to start of day and end of day
    const startDate = new Date(`${fromDate}T00:00:00.000Z`);
    const endDate = new Date(`${toDate}T23:59:59.999Z`);

    // Validate date range
    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'fromDate cannot be after toDate'
      });
    }

    const reassignedLeadsQuery = `
      SELECT 
        student_id,
        assigned_counsellor_id,
        created_at,
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes') as ist_hour
      FROM lead_assignment_log
      WHERE reference_from = 'Online team lead reassignment'
        AND created_at BETWEEN $1 AND $2
      ORDER BY created_at ASC
    `;

    const reassignedLeads = await sequelize.query(reassignedLeadsQuery, {
      bind: [startDate, endDate],
      type: sequelize.QueryTypes.SELECT
    });

    if (reassignedLeads.length === 0) {
      if (isExport) {
        // For export, return empty Excel file
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('No Data');
        worksheet.addRow(['No reassigned leads found for the given date range']);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=ni-raw-data-${fromDate}-to-${toDate}.xlsx`);

        await workbook.xlsx.write(res);
        return res.end();
      }

      return res.status(200).json({
        success: true,
        message: 'No reassigned leads found for the given date range',
        data: [],
        summary: {
          from_date: fromDate,
          to_date: toDate,
          total_leads: 0,
          anytime_connected: 0,
          total_remarks: 0,
          icc_count: 0,
          form_count: 0,
          admission_count: 0,
          pre_ni_count: 0,
          connected_percentage: '0.0',
          remarks_percentage: '0.0',
          icc_percentage: '0.0',
          form_percentage: '0.0',
          admission_percentage: '0.0',
          pre_ni_percentage: '0.0'
        }
      });
    }

    const studentIds = reassignedLeads.map(lead => lead.student_id);

    const allRemarksQuery = `
      SELECT 
        student_id,
        lead_status,
        lead_sub_status,
        calling_status,
        isdisabled,
        created_at
      FROM student_remarks
      WHERE student_id = ANY($1::varchar[])
      ORDER BY student_id, created_at ASC
    `;

    const allRemarks = await sequelize.query(allRemarksQuery, {
      bind: [studentIds],
      type: sequelize.QueryTypes.SELECT
    });

    const studentRemarksMap = new Map();
    allRemarks.forEach(remark => {
      if (!studentRemarksMap.has(remark.student_id)) {
        studentRemarksMap.set(remark.student_id, []);
      }
      studentRemarksMap.get(remark.student_id).push(remark);
    });

    // Get counsellor information if needed
    let counsellorMap = new Map();
    if (reportType === 'counsellor' || isExport) {
      const counsellorIds = [...new Set(reassignedLeads.map(lead => lead.assigned_counsellor_id))];
      const counsellorQuery = `
        SELECT counsellor_id, counsellor_name 
        FROM counsellors 
        WHERE counsellor_id = ANY($1::varchar[])
      `;
      const counsellors = await sequelize.query(counsellorQuery, {
        bind: [counsellorIds],
        type: sequelize.QueryTypes.SELECT
      });
      counsellors.forEach(c => counsellorMap.set(c.counsellor_id, c.counsellor_name));
    }

    // Process student data for export
    const studentRawData = [];
    const studentStats = new Map();

    studentRemarksMap.forEach((remarks, studentId) => {
      const sortedRemarks = remarks.sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at)
      );

      let stats = {
        total_leads: 1,
        anytime_connected: false,
        total_remarks: sortedRemarks.length,
        has_icc: false,
        has_form: false,
        has_admission: false,
        has_pre_ni: false,
        remarks_sequence: []
      };

      // Find the first isdisabled=true remark
      const firstDisabledIndex = sortedRemarks.findIndex(r => r.isdisabled === true);

      if (firstDisabledIndex !== -1) {
        const remarksAfterDisabled = sortedRemarks.slice(firstDisabledIndex + 1);

        // Check for connected status in ANY remark (before or after isdisabled)
        stats.anytime_connected = sortedRemarks.some(r =>
          r.calling_status === 'Connected'
        );

        // Check for ICC (only in remarks AFTER isdisabled=true)
        stats.has_icc = remarksAfterDisabled.some(r =>
          r.lead_sub_status === 'Initial counselling completed'
        );

        // Check for FORM (only in remarks AFTER isdisabled=true)
        stats.has_form = remarksAfterDisabled.some(r =>
          ['Application', 'Admission', 'Enrolled'].includes(r.lead_status)
        );

        // Check for ADMISSION (only in remarks AFTER isdisabled=true)
        stats.has_admission = remarksAfterDisabled.some(r =>
          ['Admission', 'Enrolled'].includes(r.lead_status)
        );

        // Check for Pre-NI (only in remarks AFTER isdisabled=true)
        stats.has_pre_ni = remarksAfterDisabled.some(r =>
          r.lead_status === 'Not Interested'
        );

        // Store remark sequence for export
        stats.remarks_sequence = sortedRemarks.map(r => ({
          created_at: r.created_at,
          lead_status: r.lead_status,
          lead_sub_status: r.lead_sub_status,
          calling_status: r.calling_status,
          isdisabled: r.isdisabled
        }));
      } else {
        // If no isdisabled=true found
        stats.anytime_connected = sortedRemarks.some(r =>
          r.calling_status === 'Connected'
        );

        stats.remarks_sequence = sortedRemarks.map(r => ({
          created_at: r.created_at,
          lead_status: r.lead_status,
          lead_sub_status: r.lead_sub_status,
          calling_status: r.calling_status,
          isdisabled: r.isdisabled
        }));
      }

      studentStats.set(studentId, stats);

      // Prepare raw data for export
      const leadAssignment = reassignedLeads.find(l => l.student_id === studentId);
      if (leadAssignment) {
        studentRawData.push({
          student_id: studentId,
          assigned_counsellor_id: leadAssignment.assigned_counsellor_id,
          counsellor_name: counsellorMap.get(leadAssignment.assigned_counsellor_id) || leadAssignment.assigned_counsellor_id,
          assignment_time: leadAssignment.created_at,
          ist_hour: leadAssignment.ist_hour,
          anytime_connected: stats.anytime_connected,
          total_remarks: stats.total_remarks,
          has_icc: stats.has_icc,
          has_form: stats.has_form,
          has_admission: stats.has_admission,
          has_pre_ni: stats.has_pre_ni,
          remarks_sequence: stats.remarks_sequence
        });
      }
    });

    // Handle export request
    if (isExport) {
      const workbook = new ExcelJS.Workbook();

      // Main data sheet
      const mainSheet = workbook.addWorksheet('Student Raw Data');

      // Define headers
      mainSheet.columns = [
        { header: 'Student ID', key: 'student_id', width: 20 },
        { header: 'Counsellor ID', key: 'assigned_counsellor_id', width: 15 },
        { header: 'Counsellor Name', key: 'counsellor_name', width: 25 },
        { header: 'Assignment Time', key: 'assignment_time', width: 25 },
        { header: 'IST Hour', key: 'ist_hour', width: 10 },
        { header: 'Connected', key: 'anytime_connected', width: 12 },
        { header: 'Total Remarks', key: 'total_remarks', width: 15 },
        { header: 'ICC', key: 'has_icc', width: 8 },
        { header: 'Form Filled', key: 'has_form', width: 12 },
        { header: 'Admission', key: 'has_admission', width: 12 },
        { header: 'Pre NI', key: 'has_pre_ni', width: 10 },
        { header: 'Remarks Count', key: 'remarks_count', width: 15 }
      ];

      // Add data rows
      studentRawData.forEach(student => {
        mainSheet.addRow({
          student_id: student.student_id,
          assigned_counsellor_id: student.assigned_counsellor_id,
          counsellor_name: student.counsellor_name,
          assignment_time: student.assignment_time,
          ist_hour: student.ist_hour,
          anytime_connected: student.anytime_connected ? 'Yes' : 'No',
          total_remarks: student.total_remarks,
          has_icc: student.has_icc ? 'Yes' : 'No',
          has_form: student.has_form ? 'Yes' : 'No',
          has_admission: student.has_admission ? 'Yes' : 'No',
          has_pre_ni: student.has_pre_ni ? 'Yes' : 'No',
          remarks_count: student.remarks_sequence.length
        });
      });

      // Remarks details sheet
      if (studentRawData.some(s => s.remarks_sequence.length > 0)) {
        const remarksSheet = workbook.addWorksheet('Remarks Details');

        remarksSheet.columns = [
          { header: 'Student ID', key: 'student_id', width: 20 },
          { header: 'Remark Time', key: 'created_at', width: 25 },
          { header: 'Lead Status', key: 'lead_status', width: 20 },
          { header: 'Lead Sub Status', key: 'lead_sub_status', width: 25 },
          { header: 'Calling Status', key: 'calling_status', width: 15 },
          { header: 'Is Disabled', key: 'isdisabled', width: 12 }
        ];

        studentRawData.forEach(student => {
          student.remarks_sequence.forEach(remark => {
            remarksSheet.addRow({
              student_id: student.student_id,
              created_at: remark.created_at,
              lead_status: remark.lead_status || '',
              lead_sub_status: remark.lead_sub_status || '',
              calling_status: remark.calling_status || '',
              isdisabled: remark.isdisabled ? 'Yes' : 'No'
            });
          });
        });
      }

      // Summary sheet
      const totalLeads = reassignedLeads.length;
      const anytimeConnected = Array.from(studentStats.values()).filter(s => s.anytime_connected).length;
      const totalRemarks = Array.from(studentStats.values()).reduce((sum, s) => sum + s.total_remarks, 0);
      const iccCount = Array.from(studentStats.values()).filter(s => s.has_icc).length;
      const formCount = Array.from(studentStats.values()).filter(s => s.has_form).length;
      const admissionCount = Array.from(studentStats.values()).filter(s => s.has_admission).length;
      const preNiCount = Array.from(studentStats.values()).filter(s => s.has_pre_ni).length;

      const calculatePercentage = (count) => {
        return totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(1) : '0.0';
      };

      const avgRemarksPerLead = totalLeads > 0 ? (totalRemarks / totalLeads).toFixed(1) : '0.0';

      const summarySheet = workbook.addWorksheet('Summary');

      summarySheet.columns = [
        { header: 'Metric', key: 'metric', width: 25 },
        { header: 'Count', key: 'count', width: 15 },
        { header: 'Percentage', key: 'percentage', width: 15 }
      ];

      summarySheet.addRow({ metric: 'Total Leads', count: totalLeads, percentage: '100%' });
      summarySheet.addRow({ metric: 'Connected', count: anytimeConnected, percentage: `${calculatePercentage(anytimeConnected)}%` });
      summarySheet.addRow({ metric: 'Total Remarks', count: totalRemarks, percentage: '' });
      summarySheet.addRow({ metric: 'Avg Remarks per Lead', count: avgRemarksPerLead, percentage: '' });
      summarySheet.addRow({ metric: 'ICC Count', count: iccCount, percentage: `${calculatePercentage(iccCount)}%` });
      summarySheet.addRow({ metric: 'Form Filled', count: formCount, percentage: `${calculatePercentage(formCount)}%` });
      summarySheet.addRow({ metric: 'Admission', count: admissionCount, percentage: `${calculatePercentage(admissionCount)}%` });
      summarySheet.addRow({ metric: 'Pre NI', count: preNiCount, percentage: `${calculatePercentage(preNiCount)}%` });
      summarySheet.addRow({ metric: 'Date Range', count: `${fromDate} to ${toDate}`, percentage: '' });
      summarySheet.addRow({ metric: 'Report Type', count: reportType, percentage: '' });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=ni-raw-data-${fromDate}-to-${toDate}.xlsx`);

      // Write to response
      await workbook.xlsx.write(res);
      return res.end();
    }

    // Continue with regular JSON response for non-export requests
    const totalLeads = reassignedLeads.length;
    const anytimeConnected = Array.from(studentStats.values()).filter(s => s.anytime_connected).length;
    const totalRemarks = Array.from(studentStats.values()).reduce((sum, s) => sum + s.total_remarks, 0);
    const iccCount = Array.from(studentStats.values()).filter(s => s.has_icc).length;
    const formCount = Array.from(studentStats.values()).filter(s => s.has_form).length;
    const admissionCount = Array.from(studentStats.values()).filter(s => s.has_admission).length;
    const preNiCount = Array.from(studentStats.values()).filter(s => s.has_pre_ni).length;

    const calculatePercentage = (count) => {
      return totalLeads > 0 ? ((count / totalLeads) * 100).toFixed(1) : '0.0';
    };

    const avgRemarksPerLead = totalLeads > 0 ? (totalRemarks / totalLeads).toFixed(1) : '0.0';

    if (reportType === 'counsellor') {
      const counsellorData = new Map();

      reassignedLeads.forEach(lead => {
        const counsellorId = lead.assigned_counsellor_id;
        const studentId = lead.student_id;
        const stats = studentStats.get(studentId) || {
          total_leads: 1,
          anytime_connected: false,
          total_remarks: 0,
          has_icc: false,
          has_form: false,
          has_admission: false,
          has_pre_ni: false
        };

        if (!counsellorData.has(counsellorId)) {
          counsellorData.set(counsellorId, {
            counsellor_id: counsellorId,
            counsellor_name: counsellorMap.get(counsellorId) || counsellorId,
            total_leads: 0,
            anytime_connected: 0,
            total_remarks: 0,
            icc_count: 0,
            form_count: 0,
            admission_count: 0,
            pre_ni_count: 0,
            connected_percentage: '0.0',
            remarks_percentage: '0.0',
            icc_percentage: '0.0',
            form_percentage: '0.0',
            admission_percentage: '0.0',
            pre_ni_percentage: '0.0'
          });
        }

        const counsellor = counsellorData.get(counsellorId);
        counsellor.total_leads++;
        counsellor.anytime_connected += stats.anytime_connected ? 1 : 0;
        counsellor.total_remarks += stats.total_remarks;
        counsellor.icc_count += stats.has_icc ? 1 : 0;
        counsellor.form_count += stats.has_form ? 1 : 0;
        counsellor.admission_count += stats.has_admission ? 1 : 0;
        counsellor.pre_ni_count += stats.has_pre_ni ? 1 : 0;
      });

      counsellorData.forEach(counsellor => {
        if (counsellor.total_leads > 0) {
          counsellor.connected_percentage = ((counsellor.anytime_connected / counsellor.total_leads) * 100).toFixed(1);
          counsellor.remarks_percentage = ((counsellor.total_remarks / counsellor.total_leads)).toFixed(1);
          counsellor.icc_percentage = ((counsellor.icc_count / counsellor.total_leads) * 100).toFixed(1);
          counsellor.form_percentage = ((counsellor.form_count / counsellor.total_leads) * 100).toFixed(1);
          counsellor.admission_percentage = ((counsellor.admission_count / counsellor.total_leads) * 100).toFixed(1);
          counsellor.pre_ni_percentage = ((counsellor.pre_ni_count / counsellor.total_leads) * 100).toFixed(1);
        }
      });

      const counsellorWiseData = Array.from(counsellorData.values());

      return res.status(200).json({
        success: true,
        data: counsellorWiseData,
        summary: {
          from_date: fromDate,
          to_date: toDate,
          total_leads: totalLeads,
          anytime_connected: anytimeConnected,
          total_remarks: totalRemarks,
          icc_count: iccCount,
          form_count: formCount,
          admission_count: admissionCount,
          pre_ni_count: preNiCount,
          connected_percentage: calculatePercentage(anytimeConnected),
          remarks_percentage: avgRemarksPerLead,
          icc_percentage: calculatePercentage(iccCount),
          form_percentage: calculatePercentage(formCount),
          admission_percentage: calculatePercentage(admissionCount),
          pre_ni_percentage: calculatePercentage(preNiCount)
        }
      });

    } else if (reportType === 'timeslot') {
      const timeSlots = [
        { start: 9, end: 10, label: '9-10 AM' },
        { start: 10, end: 11, label: '10-11 AM' },
        { start: 11, end: 12, label: '11-12 AM' },
        { start: 12, end: 13, label: '12-1 PM' },
        { start: 13, end: 14, label: '1-2 PM' },
        { start: 14, end: 15, label: '2-3 PM' },
        { start: 15, end: 16, label: '3-4 PM' },
        { start: 16, end: 17, label: '4-5 PM' },
        { start: 17, end: 18, label: '5-6 PM' },
        { start: 18, end: 19, label: '6-7 PM' },
      ];

      const timeSlotData = new Map();

      timeSlots.forEach(slot => {
        timeSlotData.set(slot.label, {
          time_slot: slot.label,
          total_leads: 0,
          anytime_connected: 0,
          total_remarks: 0,
          icc_count: 0,
          form_count: 0,
          admission_count: 0,
          pre_ni_count: 0,
          connected_percentage: '0.0',
          remarks_percentage: '0.0',
          icc_percentage: '0.0',
          form_percentage: '0.0',
          admission_percentage: '0.0',
          pre_ni_percentage: '0.0'
        });
      });

      timeSlotData.set('Outside Hours', {
        time_slot: 'Outside Hours',
        total_leads: 0,
        anytime_connected: 0,
        total_remarks: 0,
        icc_count: 0,
        form_count: 0,
        admission_count: 0,
        pre_ni_count: 0,
        connected_percentage: '0.0',
        remarks_percentage: '0.0',
        icc_percentage: '0.0',
        form_percentage: '0.0',
        admission_percentage: '0.0',
        pre_ni_percentage: '0.0'
      });

      reassignedLeads.forEach(lead => {
        const istHour = Math.floor(lead.ist_hour) || 0;
        const studentId = lead.student_id;
        const stats = studentStats.get(studentId) || {
          total_leads: 1,
          anytime_connected: false,
          total_remarks: 0,
          has_icc: false,
          has_form: false,
          has_admission: false,
          has_pre_ni: false
        };

        let timeSlotLabel = 'Outside Hours';
        for (const slot of timeSlots) {
          if (istHour >= slot.start && istHour < slot.end) {
            timeSlotLabel = slot.label;
            break;
          }
        }

        const timeSlot = timeSlotData.get(timeSlotLabel);
        if (!timeSlot) return;

        timeSlot.total_leads++;
        timeSlot.anytime_connected += stats.anytime_connected ? 1 : 0;
        timeSlot.total_remarks += stats.total_remarks;
        timeSlot.icc_count += stats.has_icc ? 1 : 0;
        timeSlot.form_count += stats.has_form ? 1 : 0;
        timeSlot.admission_count += stats.has_admission ? 1 : 0;
        timeSlot.pre_ni_count += stats.has_pre_ni ? 1 : 0;
      });

      timeSlotData.forEach(slot => {
        if (slot.total_leads > 0) {
          slot.connected_percentage = ((slot.anytime_connected / slot.total_leads) * 100).toFixed(1);
          slot.remarks_percentage = ((slot.total_remarks / slot.total_leads)).toFixed(1);
          slot.icc_percentage = ((slot.icc_count / slot.total_leads) * 100).toFixed(1);
          slot.form_percentage = ((slot.form_count / slot.total_leads) * 100).toFixed(1);
          slot.admission_percentage = ((slot.admission_count / slot.total_leads) * 100).toFixed(1);
          slot.pre_ni_percentage = ((slot.pre_ni_count / slot.total_leads) * 100).toFixed(1);
        }
      });

      const timeSlotWiseData = Array.from(timeSlotData.values())
        .filter(slot => slot.total_leads > 0)
        .sort((a, b) => {
          if (a.time_slot === 'Outside Hours') return 1;
          if (b.time_slot === 'Outside Hours') return -1;
          return a.time_slot.localeCompare(b.time_slot);
        });

      return res.status(200).json({
        success: true,
        data: timeSlotWiseData,
        summary: {
          from_date: fromDate,
          to_date: toDate,
          total_leads: totalLeads,
          anytime_connected: anytimeConnected,
          total_remarks: totalRemarks,
          icc_count: iccCount,
          form_count: formCount,
          admission_count: admissionCount,
          pre_ni_count: preNiCount,
          connected_percentage: calculatePercentage(anytimeConnected),
          remarks_percentage: avgRemarksPerLead,
          icc_percentage: calculatePercentage(iccCount),
          form_percentage: calculatePercentage(formCount),
          admission_percentage: calculatePercentage(admissionCount),
          pre_ni_percentage: calculatePercentage(preNiCount)
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid report type'
      });
    }

  } catch (error) {
    console.error('Error in getniReports:', error);

    if (req.query.isExport) {
      // For export errors, try to send error in Excel format
      try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Error');
        worksheet.addRow(['Error occurred while generating report']);
        worksheet.addRow([error.message]);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=ni-error-report.xlsx`);

        await workbook.xlsx.write(res);
        return res.end();
      } catch (excelError) {
        res.status(500).send('Error generating report');
      }
    } else {
      res.status(500).json({
        success: false,
        message: 'Error fetching NI reports'
      });
    }
  }
};




export const studentWindowOpenByCounsellor = async (req, res) => {
  try {
    const { studentId } = req.query
    const userId = req?.user?.id

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" })
    }

    const student = await Student.findByPk(studentId)

    if (!student) {
      return res.status(404).json({ message: "Student not found" })
    }

    if (student.assigned_counsellor_id !== userId) {
      return res.status(403).json({ message: "No Access" })
    }

    await Student.update(
      { is_opened: true },
      { where: { student_id: studentId } }
    )

    return res.status(200).json({
      message: "Student window updated successfully"
    })

  } catch (error) {
    console.error(error)
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    })
  }
}



/* -------------------- HELPERS -------------------- */

const normalizeValue = (val) => {
  if (val === undefined || val === null || val === '' || val === 'NULL')
    return null;

  if (val === 'true') return true;
  if (val === 'false') return false;

  return val;
};

const normalizeNumber = (val, def = 0) => {
  if (val === undefined || val === null || val === '' || val === 'NULL')
    return def;
  return Number(val) || def;
};

const normalizeArray = (val) => {
  if (!val || val === 'NULL') return [];

  if (Array.isArray(val)) return val;

  if (val === '{}' || val === '[]') return [];

  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const normalizeDate = (val) => {
  if (!val || val === 'NULL') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/* -------------------- CONTROLLER -------------------- */

export const bulkCreateStudents = async (req, res) => {
  try {
    const students = req.body;

    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be a non-empty array'
      });
    }

    const payload = students.map((s) => ({
      /* 🔑 PRIMARY */
      student_id: s.student_id?.trim(),

      /* 👤 BASIC */
      student_name: normalizeValue(s.student_name),
      student_email: normalizeValue(s.student_email),
      student_phone: normalizeValue(s.student_phone),
      parents_number: normalizeValue(s.parents_number),
      whatsapp: normalizeValue(s.whatsapp),

      /* 👥 ASSIGNMENTS */
      assigned_counsellor_id: normalizeValue(s.assigned_counsellor_id),
      assigned_counsellor_l3_id: normalizeValue(s.assigned_counsellor_l3_id),
      assigned_team_owner_id: normalizeValue(s.assigned_team_owner_id),
      assigned_team_owner_date: normalizeDate(s.assigned_team_owner_date),
      reassigneddate: normalizeDate(s.reassigneddate),

      /* 🎓 EDUCATION */
      highest_degree: normalizeValue(s.highest_degree),
      completion_year: normalizeValue(s.completion_year),
      current_profession: normalizeValue(s.current_profession),
      current_role: normalizeValue(s.current_role),
      work_experience: normalizeValue(s.work_experience),
      objective: normalizeValue(s.objective),
      student_age: normalizeNumber(s.student_age),

      /* 🎯 PREFERENCES (ARRAYS) */
      preferred_stream: normalizeArray(s.preferred_stream),
      preferred_budget: normalizeValue(s.preferred_budget),
      preferred_degree: normalizeArray(s.preferred_degree),
      preferred_level: normalizeArray(s.preferred_level),
      preferred_specialization: normalizeArray(s.preferred_specialization),
      preferred_city: normalizeArray(s.preferred_city),
      preferred_state: normalizeArray(s.preferred_state),
      preferred_university: normalizeArray(s.preferred_university),

      /* 🌍 SOURCE */
      source: normalizeValue(s.source),
      first_source_url: normalizeValue(s.first_source_url),

      /* 📍 LOCATION */
      student_secondary_email: normalizeValue(s.student_secondary_email),
      student_current_city: normalizeValue(s.student_current_city),
      student_current_state: normalizeValue(s.student_current_state),

      /* 📞 STATUS */
      is_opened: normalizeValue(s.is_opened),
      is_connected_yet: normalizeValue(s.is_connected_yet),
      is_connected_yet_l3: normalizeValue(s.is_connected_yet_l3),
      is_reactivity: normalizeValue(s.is_reactivity),

      /* 📊 COUNTS */
      number_of_unread_messages: normalizeNumber(s.number_of_unread_messages),
      remarks_count: normalizeNumber(s.remarks_count),
      total_remarks_l3: normalizeNumber(s.total_remarks_l3),
      online_ffh: normalizeNumber(s.online_ffh),

      /* 📝 REMARKS */
      remarks_l3: normalizeValue(s.remarks_l3),

      /* 📅 CALL DATES */
      assigned_l3_date: normalizeDate(s.assigned_l3_date),
      next_call_date_l3: normalizeDate(s.next_call_date_l3),
      last_call_date_l3: normalizeDate(s.last_call_date_l3),
      first_callback_l2: normalizeDate(s.first_callback_l2),
      first_callback_l3: normalizeDate(s.first_callback_l3),
      first_form_filled_date: normalizeDate(s.first_form_filled_date),

      /* ⏰ TIME */
      next_call_time_l3: normalizeValue(s.next_call_time_l3),

      /* 🕒 SYSTEM */
      created_at: normalizeDate(s.created_at) || new Date(),
      updated_at: normalizeDate(s.updated_at) || new Date()
    }));

    const created = await Student.bulkCreate(payload, {
      ignoreDuplicates: true   // email / phone unique safe
    });

    return res.status(201).json({
      success: true,
      message: 'Bulk students created successfully',
      inserted: created.length
    });

  } catch (error) {
    console.error('❌ Bulk Create Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};


