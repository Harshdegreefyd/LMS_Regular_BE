import { StudentLeadActivity } from '../models/index.js';
export const normalizeLeadAnswers = (input) => {
  if (!Array.isArray(input)) return [];

  if (
    input.length &&
    typeof input[0] === 'object' &&
    'question' in input[0] &&
    'answer' in input[0]
  ) {
    return input.filter(
      (i) => i.answer !== null && i.answer !== undefined && i.answer !== ''
    );
  }

  if (input.length && typeof input[0] === 'object') {
    const obj = input[0];

    return Object.entries(obj)
      .filter(([_, value]) => value !== null && value !== undefined && value !== '')
      .map(([question, answer]) => ({
        question,
        answer: Array.isArray(answer) ? answer.join(', ') : String(answer)
      }));
  }

  return [];
};


export const createLeadActivity = async (leadData, studentId) => {
  try {
    const sourceurl = leadData.first_source_url || 
                      leadData.sourceUrl ||
                      leadData.source_url ||
                      '';
    
    const source = leadData.source || '';

    const newLeadActivity = await StudentLeadActivity.create({
      student_id: studentId || '',
      
      student_name: leadData.name || '',
      student_email: leadData.email || '',
      student_phone: leadData.phoneNumber || leadData.mobile || '',
      parents_number: leadData.parentsNumber || leadData.parents_number || '',
      whatsapp: leadData.whatsapp || '',
      cta_name: leadData.ctaName || leadData.cta_name || '',
      form_name: leadData.formName || leadData.form_name || '',
      
      source: source,
      source_url: sourceurl,
      
      utm_source: leadData.utmSource || '',
      utm_medium: leadData.utmMedium || '',
      utm_keyword: leadData.utmKeyword || '',
      utm_campaign: leadData.utmCampaign || '',
      utm_campaign_id: leadData.utmCampaignId || '',
      utm_adgroup_id: leadData.utmAdgroupId || '',
      utm_creative_id: leadData.utmCreativeId || '',
      
      ip_city: leadData.ipCity || '',
      browser: leadData.browser || '',
      device: leadData.device || '',
      
      student_comment: normalizeLeadAnswers(
        leadData.studentComment ||
        leadData.student_comment ||
        leadData.answers ||
        []
      ),
      
      highest_qualification: leadData.highestQualification || '',
      working_professional: leadData.workingProfessional ?? false,
      student_status: 'new',
      
      destination_number: leadData.DestinationNumber || '',
      dial_whom_number: leadData.DialWhomNumber || '',
      call_duration: leadData.CallDuration || '',
      ivr_status: leadData.Status || leadData.ivr_status || '',
      start_time: leadData.StartTime || '',
      end_time: leadData.EndTime || '',
      call_sid: leadData.CallSid || '',
      call_recording_url: leadData.CallRecordingUrl || '',
      talk_duration: leadData.TalkDuration || '',
    });

    return { success: true, leadActivity: newLeadActivity };
  } catch (error) {
    console.error('Error creating lead activity:', error);
    return { success: false, error: error.message };
  }
};

export const getLeadActivitiesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const leadActivities = await StudentLeadActivity.findAll({
      where: { student_id: studentId },
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      leadActivities
    });
  } catch (error) {
    console.error('Error fetching lead activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching lead activities',
      error: error.message
    });
  }
};

export const updateLeadActivityStatus = async (req, res) => {
  try {
    const { leadActivityId } = req.params;
    const { status, studentComment } = req.body;

    const leadActivity = await StudentLeadActivity.findByPk(leadActivityId);

    if (!leadActivity) {
      return res.status(404).json({
        success: false,
        message: 'Lead activity not found'
      });
    }

    // Update the status
    leadActivity.student_status = status;

    // If there's a student comment, merge it with existing comments
    if (studentComment) {
      const existingComments = leadActivity.student_comment || {};
      leadActivity.student_comment = {
        ...existingComments,
        ...studentComment
      };
    }

    await leadActivity.save();

    res.status(200).json({
      success: true,
      leadActivity
    });
  } catch (error) {
    console.error('Error updating lead activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating lead activity',
      error: error.message
    });
  }
};

export const getActivityByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;

    const leadActivities = await StudentLeadActivity.findAll({
      where: { student_id: studentId },
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({
      success: true,
      data: leadActivities
    });
  } catch (error) {
    console.error('Error getting lead activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lead activity',
      error: error.message
    });
  }
};

// Additional helper functions for PostgreSQL with Sequelize

export const getAllLeadActivities = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) {
      whereClause.student_status = status;
    }

    const { count, rows } = await StudentLeadActivity.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        hasNextPage: offset + rows.length < count,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error getting all lead activities:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting all lead activities',
      error: error.message
    });
  }
};

export const getLeadActivityById = async (req, res) => {
  try {
    const { leadActivityId } = req.params;

    const leadActivity = await StudentLeadActivity.findByPk(leadActivityId, {
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['student_id', 'student_name', 'student_email', 'student_phone']
        }
      ]
    });

    if (!leadActivity) {
      return res.status(404).json({
        success: false,
        message: 'Lead activity not found'
      });
    }

    res.status(200).json({
      success: true,
      data: leadActivity
    });
  } catch (error) {
    console.error('Error getting lead activity by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lead activity',
      error: error.message
    });
  }
};

export const deleteLeadActivity = async (req, res) => {
  try {
    const { leadActivityId } = req.params;

    const deleted = await StudentLeadActivity.destroy({
      where: { id: leadActivityId }
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Lead activity not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lead activity deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting lead activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting lead activity',
      error: error.message
    });
  }
};

export const getLeadActivitiesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, studentId } = req.query;

    const whereClause = {};

    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    if (studentId) {
      whereClause.student_id = studentId;
    }

    const leadActivities = await StudentLeadActivity.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: leadActivities
    });
  } catch (error) {
    console.error('Error getting lead activities by date range:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting lead activities by date range',
      error: error.message
    });
  }
};