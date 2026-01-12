import {LeadAssignmentLogs} from '../models/index.js';

export const createLeadLog = async ({ studentId, assignedCounsellorId, assignedBy = 'Rulset Based' }) => {
  try {
    // Basic validation
    console.log({ studentId, assignedCounsellorId, assignedBy  })
    if (!studentId || !assignedCounsellorId) {
      throw new Error('studentId and assignedCounsellorId are required.');
    }

    const newLeadLog = await LeadAssignmentLogs.create({
      student_id:studentId,
      assigned_counsellor_id:assignedCounsellorId,
      assigned_by:assignedBy,
      created_at:new Date()
    });
    // console.log('new Studeny',newLeadLog)
    return { success: true, data: newLeadLog };
  } catch (error) {
    console.error('Error creating lead log:', error);
    return { success: false, message: error.message };
  }
};
