import axios from 'axios';
import ReconAssignmentRule from '../models/LeadAssignmentRuleRecon.js';

const formatLeadValue = (field, value) => {
  if (!value) return null;

  switch (field) {
    case 'preferred_budget':
      if (typeof value === 'number') return value.toString();
      if (typeof value === 'string') {
        const numValue = value.replace(/[₹,]/g, '').trim();
        return isNaN(numValue) ? value : numValue;
      }
      return value.toString();

    case 'preferred_degree':
    case 'preferred_specialization':
      if (Array.isArray(value)) {
        return value.length > 0 ? value[0] : null;
      }
      return value;

    default:
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return value.toString();
      return value;
  }
};

const checkMatch = (field, value, ruleConditions) => {
  if (!value || !ruleConditions || ruleConditions.length === 0 || ruleConditions.includes('Any')) {
    return false;
  }

  const formattedValue = formatLeadValue(field, value);

  if (field === 'first_source_url') {
    return ruleConditions.some(cond =>
      formattedValue && cond && formattedValue.toLowerCase().includes(cond.toLowerCase())
    );
  }

  if (field === 'preferred_budget') {
    return ruleConditions.some(condition => {
      if (!condition || !formattedValue) return false;

      if (condition.includes('-')) {
        const [min, max] = condition.split('-').map(Number);
        const budgetValue = Number(formattedValue);
        return !isNaN(budgetValue) && budgetValue >= min && budgetValue <= max;
      }

      return condition === formattedValue;
    });
  }

  if (Array.isArray(ruleConditions)) {
    return ruleConditions.some(cond =>
      cond && formattedValue && cond.toString() === formattedValue.toString()
    );
  }

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

export async function autoSending(students_data = []) {
  try {
    console.log('autoSending called with data type:', typeof students_data);

    // Handle both single object and array inputs
    let studentsArray;
    if (Array.isArray(students_data)) {
      studentsArray = students_data;
      console.log(`Processing ${studentsArray.length} students as array`);
    } else if (students_data && typeof students_data === 'object') {
      // Check if it looks like a student object
      if (students_data.student_id || students_data.id || students_data.student_email || students_data.student_phone) {
        studentsArray = [students_data];
        console.log('Processing single student object');
      } else {
        console.log('Invalid student object structure:', students_data);
        studentsArray = [];
      }
    } else {
      console.log('Invalid students data type:', typeof students_data);
      studentsArray = [];
    }

    if (studentsArray.length === 0) {
      console.log('No valid students to process');
      return {
        success: false,
        message: 'No valid students data provided',
        stats: {
          totalStudents: 0,
          matchedStudents: 0,
          totalCollegesSent: 0,
          skippedStudents: 0
        }
      };
    }

    console.log(`Processing ${studentsArray.length} student(s)`);

    const rules = await ReconAssignmentRule.findAll({
      where: { is_active: true },
      order: [['priority', 'DESC']]
    });

    console.log(`Found ${rules.length} active rules`);

    let stats = {
      totalStudents: studentsArray.length,
      matchedStudents: 0,
      totalCollegesSent: 0,
      skippedStudents: 0
    };

    for (const studentData of studentsArray) {
      try {
        const studentId = studentData.student_id || studentData.id || 'Unknown';
        console.log(`Processing student: ${studentId}`);

        let matchedRule = null;

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

        let allMatchingRules = [];

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
            const value = studentData[field];

            // Check if field exists in student data
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
                ruleName: rule.custom_rule_name || `Rule ${rule.lead_assignment_rule_recon_id}`
              }
            });
          }
        }

        if (allMatchingRules.length === 0) {
          console.log(`No matching rules found for student ${studentId}, skipping...`);
          stats.skippedStudents++;
          continue;
        }

        stats.matchedStudents++;

        allMatchingRules.sort((a, b) => b.score - a.score);

        console.log(`Found ${allMatchingRules.length} matching rules for student ${studentId}`);
        console.log('Top rules:', allMatchingRules.slice(0, 3).map(r => ({
          rule: r.matchDetails.ruleName,
          score: r.score,
          matchedFields: r.matchDetails.matchedFields.map(f => f.field)
        })));

        matchedRule = allMatchingRules[0].rule;

        const assignedUniversities = matchedRule.assigned_university_names || [];

        if (assignedUniversities.length === 0) {
          console.log(`Rule "${matchedRule.custom_rule_name}" has no assigned universities, skipping student ${studentId}`);
          stats.skippedStudents++;
          continue;
        }

        console.log(`Rule "${matchedRule.custom_rule_name}" has ${assignedUniversities.length} assigned universities`);
        console.log('Universities:', assignedUniversities);

        await ReconAssignmentRule.update(
          {
            total_matched_leads: (matchedRule.total_matched_leads || 0) + 1,
            last_matched_at: new Date()
          },
          { where: { lead_assignment_rule_recon_id: matchedRule.lead_assignment_rule_recon_id } }
        );

        let sentColleges = 0;

        for (const college of assignedUniversities) {
          try {
            console.log(`Sending student ${studentId} to college: ${college}`);

            // Use route parameter method (as per your route definition)
            const encodedCollege = encodeURIComponent(college);
            const courseResponse = await axios.get(
              `http://localhost:3031/v1/universitycourse/getByCourseId/${encodedCollege}`
            );

            // if (!courseResponse.data || !courseResponse.data.response || !courseResponse.data.response.course_id) {
            //   console.error(`No course found for college: ${college}`);
            //   continue; // Skip this college
            // }
            console.log("harsh is testing", courseResponse, "harsh is testing")
            const courseId = courseResponse.data.response.course_id;
            console.log(`Found course ID ${courseId} for college ${college}`);

            // Update StudentCourseStatus
            const statusResponse = await axios.post(
              'http://localhost:3031/v1/StudentCourseStatus/update',
              {
                "courseId": courseId,
                "isShortlisted": true,
                "status": "Shortlisted",
                "studentId": studentId
              }
            );

            console.log('StudentCourseStatus update response:', statusResponse.data);

            // Log the sent status
            const logResponse = await axios.post(
              'http://localhost:3031/v1/StudentCourseStatusLogs/sentStatustoCollege',
              {
                collegeName: college,
                studentId: studentId,
                sendType: 'auto'
              }
            );

            console.log(`Successfully sent student ${studentId} to ${college}`);
            sentColleges++;

          } catch (apiError) {
            console.error(`Error sending to college ${college} for student ${studentId}:`, apiError.message);
            if (apiError.response) {
              console.error('API Response error:', {
                status: apiError.response.status,
                data: apiError.response.data
              });
            }
          }
        }

        stats.totalCollegesSent += sentColleges;

        console.log(`Sent student ${studentId} to ${sentColleges} out of ${assignedUniversities.length} colleges`);

        console.log({
          studentId,
          matchedRule: matchedRule.custom_rule_name,
          ruleScore: allMatchingRules[0].score,
          collegesAttempted: assignedUniversities.length,
          collegesSuccessful: sentColleges,
          collegesFailed: assignedUniversities.length - sentColleges,
          timestamp: new Date().toISOString()
        });

      } catch (studentError) {
        console.error(`Error processing student:`, studentData, 'Error:', studentError.message);
        stats.skippedStudents++;
        continue;
      }
    }

    console.log('Auto sending completed');
    console.log('Statistics:', stats);

    return {
      success: true,
      message: 'Auto sending completed',
      stats: stats
    };

  } catch (error) {
    console.error('Unexpected error in autoSending:', error.message);
    console.error('Error stack:', error.stack);
    return {
      success: false,
      message: error.message,
      error: error.stack,
      stats: {
        totalStudents: 0,
        matchedStudents: 0,
        totalCollegesSent: 0,
        skippedStudents: 0
      }
    };
  }
}

export async function processStudentWithRules(studentData) {
  // Pass the student data directly, autoSending will handle it
  const result = await autoSending(studentData);
  return result;
}

export async function findMatchingRuleForStudent(studentData) {
  try {
    const rules = await ReconAssignmentRule.findAll({
      where: { is_active: true },
      order: [['priority', 'DESC']]
    });

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

    let allMatchingRules = [];

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
        const value = studentData[field];

        // Check if field exists in student data
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
            ruleName: rule.custom_rule_name || `Rule ${rule.lead_assignment_rule_recon_id}`
          },
          universities: rule.assigned_university_names || []
        });
      }
    }

    allMatchingRules.sort((a, b) => b.score - a.score);

    return {
      success: allMatchingRules.length > 0,
      topRule: allMatchingRules[0] || null,
      allMatchingRules: allMatchingRules,
      totalMatches: allMatchingRules.length
    };

  } catch (error) {
    console.error('Error finding matching rule:', error);
    return {
      success: false,
      message: error.message
    };
  }
}