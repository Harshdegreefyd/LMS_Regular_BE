import { LeadAssignmentRuleL2, Counsellor, Student, StudentLeadActivity, StudentRemark } from "../models/index.js";
import { createLeadLog } from "../controllers/Lead_logs.controller.js";
import { DATE, Op } from 'sequelize';
import { saveMessageToChat } from '../controllers/watsaapChat.controller.js';
import axios from 'axios';
import { createLeadActivity } from '../controllers/leadactivity.controller.js';

export const assignLeadHelper = async (leadData) => {
  try {
    if (!leadData.name || !leadData.email || (!leadData.phoneNumber && !leadData.phone_number)) {
      throw new Error('Name, email, and phoneNumber are required fields');
    }

    const priorityFields = [
      'utmCampaign',
      'first_source_url',
      'source',
      'mode',
      'preferred_budget',
      'current_profession',
      'preferred_level',
      'preferred_degree',
      'preferred_specialization',
      'preferred_city',
      'preferred_state',
    ];

    const rules = await LeadAssignmentRuleL2.findAll({
      where: { is_active: true },
      order: [['priority', 'DESC']]
    });

    let allMatchingRules = [];
    let assignedCounsellor = null;
    let selectedRule = null;
    let bestMatchDetails = null;
    let assignmentType = '';
    let bestMatchScore = -1;

    // Helper function to normalize and format lead data values
    const formatLeadValue = (field, value) => {
      if (!value) return null;

      switch (field) {
        case 'preferred_budget':
          // Convert budget to string for comparison
          if (typeof value === 'number') return value.toString();
          if (typeof value === 'string') {
            // Remove currency symbols and commas
            const numValue = value.replace(/[₹,]/g, '').trim();
            return isNaN(numValue) ? value : numValue;
          }
          return value.toString();

        case 'preferred_degree':
        case 'preferred_specialization':
          // Handle array fields - take first value if array, otherwise use as is
          if (Array.isArray(value)) {
            return value.length > 0 ? value[0] : null;
          }
          return value;

        default:
          // For string fields
          if (typeof value === 'string') return value.trim();
          if (typeof value === 'number') return value.toString();
          return value;
      }
    };

    // Helper to check if a value matches rule conditions
    const checkMatch = (field, value, ruleConditions) => {
      if (!value || !ruleConditions || ruleConditions.length === 0 || ruleConditions.includes('Any')) {
        return false;
      }

      // Format the value for comparison
      const formattedValue = formatLeadValue(field, value);

      if (field === 'first_source_url') {
        return ruleConditions.some(cond =>
          formattedValue && cond && formattedValue.toLowerCase().includes(cond.toLowerCase())
        );
      }

      if (field === 'preferred_budget') {
        // For budget ranges, check if value falls within range
        return ruleConditions.some(condition => {
          if (!condition || !formattedValue) return false;

          // Handle budget range format like "50000-100000"
          if (condition.includes('-')) {
            const [min, max] = condition.split('-').map(Number);
            const budgetValue = Number(formattedValue);
            return !isNaN(budgetValue) && budgetValue >= min && budgetValue <= max;
          }

          // Handle exact match
          return condition === formattedValue;
        });
      }

      // For array fields in rule conditions
      if (Array.isArray(ruleConditions)) {
        return ruleConditions.some(cond =>
          cond && formattedValue && cond.toString() === formattedValue.toString()
        );
      }

      // Default string comparison
      return ruleConditions.includes(formattedValue);
    };

    const normalizeConditions = (conditions) => {
      if (!conditions) return {};

      return {
        ...conditions,
        first_source_url: conditions.first_source_url || conditions.firstSourceUrl || [],
        utmCampaign: conditions.utmCampaign || conditions.utm_campaign || [],
        preferred_city: conditions.preferred_city || conditions.prefCity || conditions.pref_city || [],
        preferred_state: conditions.preferred_state || conditions.prefState || conditions.pref_state || [],
        preferred_degree: conditions.preferred_degree || conditions.prefDegree || [],
        preferred_specialization: conditions.preferred_specialization || conditions.prefSpec || [],
        preferred_budget: conditions.preferred_budget || conditions.budget || [],
        current_profession: conditions.current_profession || conditions.profession || [],
        preferred_level: conditions.preferred_level || conditions.level || [],
        mode: conditions.mode || [],
        source: conditions.source || [],
      };
    };

    for (const rule of rules) {
      const conditions = normalizeConditions(rule?.conditions);

      let ruleMatchScore = 0;
      let matchedFields = [];
      let ruleMatches = true;
      let totalConditions = 0;
      let satisfiedConditions = 0;
      let highestPriorityMatch = -1;

      for (let i = 0; i < priorityFields.length; i++) {
        const field = priorityFields[i];
        const ruleConditions = conditions[field];
        const fieldPriority = priorityFields.length - i;

        // Skip if rule has no condition for this field
        if (!ruleConditions || ruleConditions.length === 0 || ruleConditions.includes('Any')) {
          continue;
        }

        totalConditions++;
        const value = leadData[field];

        // Check if field exists in lead data
        if (value === undefined || value === null || value === '') {
          ruleMatches = false;
          break;
        }

        const isMatch = checkMatch(field, value, ruleConditions);

        if (isMatch) {
          satisfiedConditions++;
          matchedFields.push({
            field,
            value: formatLeadValue(field, value),
            matchedConditions: ruleConditions,
            priority: fieldPriority
          });
          ruleMatchScore += fieldPriority;
          highestPriorityMatch = Math.max(highestPriorityMatch, fieldPriority);
        } else {
          ruleMatches = false;
          break;
        }
      }

      if (ruleMatches && satisfiedConditions === totalConditions) {
        const finalScore = (highestPriorityMatch * 1000) + ruleMatchScore + (rule.priority || 0);
        allMatchingRules.push({
          rule,
          score: finalScore,
          matchDetails: {
            matchedFields,
            highestPriorityMatch,
            totalMatchScore: ruleMatchScore,
            finalScore,
            rulePriority: rule.priority || 0,
            totalConditions,
            satisfiedConditions,
            ruleName: rule.rule_name || `Rule ${rule.lead_assignment_rule_l2_id}`
          }
        });
      }
    }

    // Sort rules by score (highest first)
    allMatchingRules.sort((a, b) => b.score - a.score);

    const findNextActiveCounsellor = async (rule) => {
      const ids = rule.assigned_counsellor_ids;
      if (!ids || ids.length === 0) return null;

      const activeCounsellors = await Counsellor.findAll({
        where: {
          counsellor_id: ids,
          status: 'active'
        }
      });

      if (activeCounsellors.length === 0) return null;

      let currentIndex = rule.round_robin_index || 0;
      if (currentIndex >= activeCounsellors.length) currentIndex = 0;

      const selected = activeCounsellors[currentIndex];

      // Update round robin index
      await LeadAssignmentRuleL2.update(
        {
          round_robin_index: (currentIndex + 1) % activeCounsellors.length
        },
        {
          where: { lead_assignment_rule_l2_id: rule.lead_assignment_rule_l2_id }
        }
      );

      return selected;
    };

    // Try to assign based on matching rules
    for (const matchingRule of allMatchingRules) {
      const counsellor = await findNextActiveCounsellor(matchingRule.rule);
      if (counsellor) {
        assignedCounsellor = counsellor;
        selectedRule = matchingRule.rule;
        bestMatchDetails = matchingRule.matchDetails;
        bestMatchScore = matchingRule.score;
        assignmentType = 'rule-based';
        console.log(`Assigned via rule: ${matchingRule.matchDetails.ruleName}, Score: ${matchingRule.score}`);
        break;
      }
    }

    // Fallback to default counsellor if no rule matches or no available counsellors
    if (!assignedCounsellor) {
      console.log('No matching rules or available counsellors, falling back to default');

      // First try CNS-DEFAULT01
      assignedCounsellor = await Counsellor.findOne({
        where: {
          counsellor_id: 'CNS-DEFAULT01',
          status: 'active'
        }
      });

      // If not found, try dummy email
      if (!assignedCounsellor) {
        assignedCounsellor = await Counsellor.findOne({
          where: {
            counsellor_email: 'dummydegreefyd@gmail.com',
            status: 'active'
          }
        });
      }

      // If still not found, create default counsellor
      if (!assignedCounsellor) {
        const [defaultCounsellor, created] = await Counsellor.findOrCreate({
          where: { counsellor_id: 'CNS-DEFAULT01' },
          defaults: {
            counsellor_name: 'DummyL2',
            counsellor_email: 'dummyl2@gmail.com',
            counsellor_password: 'defaultpassword123',
            role: 'l2',
            status: 'active',
            counsellor_preferred_mode: 'Regular'
          }
        });

        if (!created && defaultCounsellor.counsellor_name !== 'DummyL2') {
          await defaultCounsellor.update({
            counsellor_name: 'DummyL2',
            counsellor_preferred_mode: 'Regular'
          });
        }

        assignedCounsellor = defaultCounsellor;
      }

      assignmentType = 'default';
    }

    // Log assignment details for debugging
    console.log({
      assignmentType,
      counsellorId: assignedCounsellor.counsellor_id,
      ruleMatched: assignmentType === 'rule-based' ? bestMatchDetails.ruleName : 'None',
      matchScore: bestMatchScore,
      matchedFields: bestMatchDetails?.matchedFields?.map(f => f.field) || []
    });

    return {
      success: true,
      assignedCounsellor,
      assignmentType,
      selectedRule,
      matchDetails: bestMatchDetails,
      preferredMode: assignedCounsellor.counsellor_preferred_mode || 'Regular',
      allMatchingRules: allMatchingRules.map(m => ({
        ruleId: m.rule.lead_assignment_rule_l2_id,
        score: m.score,
        matchedFields: m.matchDetails.matchedFields?.map(f => f.field) || []
      }))
    };

  } catch (error) {
    console.error('Error in assignLeadHelper:', error);
    return {
      success: false,
      message: error.message,
      error: error.stack
    };
  }
};
export const ProceessLeads = async (leads) => {

}
export const processStudentLead = async (leadData) => {
  if (!leadData.email || (!leadData.phoneNumber && !leadData.phone_number && !leadData.mobile)) {
    return {
      success: false,
      error: 'Email and phone number are required'
    };
  }

  const extractQueryParams = (url) => {
    if (!url || typeof url !== 'string') return {};

    try {
      const queryString = url.split('?')[1];
      if (!queryString) return {};

      const params = {};
      const searchParams = new URLSearchParams(queryString);

      searchParams.forEach((value, key) => {
        params[key] = value;
      });

      return params;
    } catch (error) {
      console.error('Error extracting query params:', error);
      return {};
    }
  };

  const sourceUrl =
    leadData.firstSourceUrl ||
    leadData.FirstSourceUrl ||
    leadData.FIRSTSOURCEURL ||
    leadData.first_source_url ||
    leadData.First_Source_Url ||
    leadData.FIRST_SOURCE_URL ||
    leadData.sourceUrl ||
    leadData.SourceUrl ||
    leadData.SOURCEURL ||
    leadData.source_url ||
    leadData.landingPageUrl ||
    leadData.landing_page_url ||
    '';
  
  // console.log('Source URL:', sourceUrl);
  const queryParams = extractQueryParams(sourceUrl);
  // console.log('Extracted Query Params:', queryParams);
  let utmCampaign = leadData.utmCampaign || leadData.UtmCampaign || leadData.UTMCAMPAIGN ||
    leadData.utm_Campaign || leadData.utm_campaign || leadData.UTM_CAMPAIGN ||
    queryParams.utm_campaign || queryParams.utm_campaign_name || queryParams.campaign_name || queryParams.gad_campaign_name ||
    leadData.destinationNumber || leadData.DestinationNumber || leadData.DESTINATIONNUMBER || '';

  let utmCampaignId = leadData.utmCampaignId || leadData.utmCampaignID || leadData.utm_campaign_id ||
    queryParams.utm_campaign_id || queryParams.utm_campaignid || queryParams.campaign_id || queryParams.gad_campaignid || '';

  if (!utmCampaign && utmCampaignId) {
    utmCampaign = utmCampaignId;
  }

  const mappedLeadData = {
    name: leadData.name || leadData.Name || leadData.NAME || leadData?.full_name || leadData?.FULL_NAME || '',
    email: leadData.email || leadData.Email || leadData.EMAIL || '',
    phoneNumber: leadData.phoneNumber || leadData.PhoneNumber || leadData.PHONENUMBER ||
      leadData.phone_number || leadData.Phone_Number || leadData.PHONE_NUMBER ||
      leadData.mobile || leadData.Mobile || leadData.MOBILE || '',
    highest_degree: leadData.highest_degree || '',
    completion_year: leadData.completion_year || '',
    current_profession: leadData.current_profession || '',
    current_role: leadData.current_role || '',
    work_experience: leadData.work_experience || '',
    student_age: leadData.student_age || 0, 
    objective: leadData.objective || '',
    student_current_city: leadData.student_current_city || '',
    preferred_city: leadData.preferred_city || [],
    preferred_state: leadData.preferred_state || [],
    student_current_state: leadData.student_current_state || '',
    preferred_degree: leadData.preferred_degree || '',
    preferred_level: leadData.preferred_level || '',
    preferred_budget: leadData.preferred_budget || '',
    preferred_specialization: leadData.preferred_specialization || '',

    // Campaign fields with proper separation
    utmCampaign: utmCampaign,
    utmCampaignId: utmCampaignId,

    utmSource:
      leadData.utmSource || leadData.utm_source || leadData.UtmSource ||
      queryParams.utm_source || queryParams.source || '',

    utmMedium:
      leadData.utmMedium || leadData.utm_medium || leadData.UtmMedium ||
      queryParams.utm_medium || queryParams.medium || '',

    utmTerm:
      leadData.utmTerm || leadData.utm_term || leadData.UtmTerm ||
      queryParams.utm_term || queryParams.term || '',

    utmContent:
      leadData.utmContent || leadData.utm_content || leadData.UtmContent ||
      queryParams.utm_content || queryParams.content || '',

    utmKeyword:
      leadData.utmKeyword || leadData.utmkeyword || leadData.UtmKeyword ||
      queryParams.utm_keyword || queryParams.keyword || '',

    first_source_url: sourceUrl,

    source: leadData.source || leadData.Source || leadData.SOURCE || queryParams.source || '',

    level: leadData.level || leadData.Level || leadData.LEVEL ||
      leadData.preferredLevel || leadData.PreferredLevel || leadData.PREFERREDLEVEL ||
      leadData.preferred_level || leadData.PREFERRED_LEVEL || queryParams.level || '',

    stream: leadData.stream || leadData.Stream || leadData.STREAM ||
      leadData.preferredStream || leadData.PreferredStream || leadData.PREFERREDSTREAM ||
      leadData.preferred_stream || leadData.PREFERRED_STREAM ||
      leadData.specialization || leadData.Specialization || leadData.SPECIALIZATION || '',

    mode: leadData.mode || leadData.Mode || leadData.MODE || '',

    prefCity: leadData.city || leadData.City || leadData.CITY ||
      leadData.preferredCity || leadData.PreferredCity || leadData.PREFERREDCITY ||
      leadData.preferred_city || leadData.PREFERRED_CITY ||
      leadData.ipCity || leadData.IpCity || leadData.IPCITY ||
      leadData.ip_city || leadData.IP_CITY || '',

    prefState: leadData.state || leadData.State || leadData.STATE ||
      leadData.preferredState || leadData.PreferredState || leadData.PREFERREDSTATE ||
      leadData.preferred_state || leadData.PREFERRED_STATE ||
      leadData.currentState || leadData.CurrentState || leadData.CURRENTSTATE ||
      leadData.current_state || leadData.CURRENT_STATE || '',

    preferred_university: leadData.preferred_university,

    degree: leadData.preferredDegree || leadData.PreferredDegree || leadData.PREFERREDDEGREE ||
      leadData.preferred_degree || leadData.PREFERRED_DEGREE ||
      leadData.highestQualification || leadData.HighestQualification || leadData.HIGHESTQUALIFICATION ||
      leadData.highest_qualification || leadData.HIGHEST_QUALIFICATION ||
      leadData.degree || leadData.Degree || leadData.DEGREE || ''
  };
console.log(mappedLeadData)
  const assignmentResult = await assignLeadHelper(mappedLeadData);
  if (!assignmentResult.success) {
    return {
      success: false,
      error: assignmentResult.message
    };
  }

  const { assignedCounsellor } = assignmentResult;

  const existingStudent = await Student.findOne({
    where: {
      [Op.or]: [
        { student_email: leadData.email },
        { student_phone: leadData.phoneNumber || leadData.phone_number || leadData.mobile || '' }
      ]
    },
    include: [
      {
        model: StudentLeadActivity,
        as: "lead_activities",
        attributes: ['created_at'],
        order: [['created_at', 'DESC']],
        limit: 1
      }, {
        model: StudentRemark,
        as: "student_remarks",
        attributes: ['created_at'],
        order: [['created_at', 'DESC']],
        limit: 1
      }
    ]
  });

  let student;
  let studentStatus;
  if (existingStudent) {
    student = existingStudent;
    studentStatus = 'already_exists';

    if (existingStudent?.student_remarks.length === 0) {
      const [updated] = await Student.update(
        { is_reactivity: true },
        { where: { student_id: existingStudent.student_id }, returning: true }
      );
    } else if (
      existingStudent?.student_remarks.length > 0 &&
      existingStudent?.lead_activities.length > 0 &&
      new Date(existingStudent.student_remarks[0].created_at) <
      new Date(existingStudent.lead_activities[0].created_at)
    ) {
      const [updated] = await Student.update(
        { is_reactivity: true },
        { where: { student_id: existingStudent.student_id }, returning: true }
      );
    }
  } else {
    const toArray = (val) => {
      if (!val) return [];
      return Array.isArray(val) ? val : [val];
    };

    const newStudentData = {
      student_name: mappedLeadData.name,
      student_email: mappedLeadData.email,
      student_phone: mappedLeadData.phoneNumber,
      parents_number: leadData.parentsNumber || leadData.parentNumber || leadData.guardianPhone || '',
      whatsapp: leadData.whatsapp || leadData.whatsappNumber || leadData.studentWhatsapp || '',
      assigned_counsellor_id: assignedCounsellor?.counsellor_id || null,
      mode: mappedLeadData.mode || 'Regular',
      preferred_stream: toArray(mappedLeadData.stream),
      preferred_budget: String(mappedLeadData.preferred_budget || ''),
      preferred_degree: toArray(mappedLeadData.degree),
      preferred_level: toArray(mappedLeadData.level),
      preferred_specialization: toArray(mappedLeadData.preferred_specialization),
      preferred_city: toArray(mappedLeadData.prefCity),
      preferred_state: toArray(mappedLeadData.prefState),
      preferred_university: toArray(mappedLeadData.preferred_university),
      source: mappedLeadData.source,
      first_source_url: mappedLeadData.first_source_url,
      student_secondary_email: leadData.secondaryEmail || leadData.altEmail || leadData.backupEmail || '',
      student_current_city: mappedLeadData.student_current_city,
      student_current_state: mappedLeadData.student_current_state,
      current_profession: mappedLeadData.current_profession,
      current_role: mappedLeadData.current_role,
      work_experience: mappedLeadData.work_experience,
      student_age: Number(mappedLeadData.student_age || 0),
      objective: mappedLeadData.objective,
    };

    student = await Student.create(newStudentData);
    studentStatus = 'created';

    if (global.sendLeadNotification && assignedCounsellor.counsellor_id) {
      console.log("sending Notification");
      global.sendLeadNotification(assignedCounsellor.counsellor_id, student, studentStatus);
    }

    try {
      await Counsellor.increment(['current_lead_capacity', 'total_leads'], {
        where: { counsellor_id: assignedCounsellor.counsellor_id }
      });
    } catch (e) {
      console.log('counsellor_auto increment error ', e.message);
    }

    try {
      await createLeadLog({
        studentId: student.student_id,
        assignedCounsellorId: student.assigned_counsellor_id || assignedCounsellor.counsellor_id,
        assignedBy: 'Ruleset Based'
      });
    } catch (e) {
      console.log('error while creating the log', e.message);
    }
  }

  const leadActivityResult = await createLeadActivity(mappedLeadData, student.student_id);
  if (!leadActivityResult.success) {
    return {
      success: false,
      error: `Failed to create lead activity: ${leadActivityResult.error}`
    };
  }

  return {
    success: true,
    student,
    leadActivity: leadActivityResult.leadActivity,
    assignedCounsellor,
    studentStatus
  };
};
export const sendStartingFaceBookMessage = async (phonenumber) => {
  const newPayload = {
    user: process.env.SENDMSG_USER,
    pass: process.env.SENDMSG_PASS,
    whatsapptosend: [
      {
        from: process.env.SENDMSG_FROM,
        to: `91${phonenumber}`,
        templateid: process.env.SENDMSG_TEMPLATE_ID,
        smsgid: "Nuvora",
      }
    ]
  };

  const response = await axios.post(
    'https://media.sendmsg.in/mediasend',
    newPayload,
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const responseTemplate = await axios.post(
    'https://wsapi.sendmsg.in/WhatsappTemplates/gettemplateById',
    {
      username: process.env.SENDMSG_TEMPLATE_USERNAME,
      templateid: process.env.SENDMSG_TEMPLATE_ID
    },
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  const templateDataString = JSON.stringify(responseTemplate.data);

  await saveMessageToChat(
    process.env.SENDMSG_FROM,
    `91${phonenumber}`,
    templateDataString,
    'template'
  );
};
export async function SocketEmitter(student, assignedCounsellor) {
  try {
    if (global.io && global.connectedCounsellors) {

      const counsellorSocket = global.connectedCounsellors.get(assignedCounsellor.counsellor_id);
      if (counsellorSocket) {
        global.io.to(counsellorSocket.socketId).emit('student-assigned', {
          type: 'new_student_assigned',
          message: `New student "${student.student_name}" has been assigned to you!`,
          studentId: student.student_id,
          studentName: student.student_name,
          studentEmail: student.student_email,
          studentPhone: student.student_phone,
          timestamp: new Date().toISOString(),
          counsellorId: assignedCounsellor.counsellor_id,
          counsellorName: assignedCounsellor.name || assignedCounsellor.counsellor_name
        });
      }
    }
  } catch (wsErr) {
    console.error('WebSocket error:', wsErr.message);
  }

}