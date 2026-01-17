
import { Op } from 'sequelize';
import { UniversityCourse, CourseStatus, UniversitiesAPIHeaderValues, sequelize, StudentCollegeApiSentStatus, Student, StudentLeadActivity, StudentRemark, Counsellor } from '../models/index.js';
import { format, parse } from 'date-fns';
import { pushLeadToAudience } from './meta_remarketing/metaAudienceService.js'
export const updateStudentCourseStatus = async (req, res) => {
  try {
    const {
      courseId,
      studentId,
      status,
      isShortlisted
    } = req.body;

    if (!courseId || !studentId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: courseId, studentId, and status are required'
      });
    }

    const userId = req.user?.counsellorId || req.user?.supervisorId || req.user?.id || 'auto';

    let existingStatus = await CourseStatus.findOne({
      where: {
        course_id: courseId,
        student_id: studentId
      }
    });

    if (existingStatus) {
      await existingStatus.update({
        latest_course_status: status,
        is_shortlisted: isShortlisted !== undefined
          ? isShortlisted
          : status === 'Shortlisted',
        updated_at: new Date()
      });

      return res.status(200).json({
        success: true,
        message: 'College status updated successfully',
        data: existingStatus,
        isNewEntry: false
      });
    }

    const newStudentCourseStatus = await CourseStatus.create({
      course_id: courseId,
      student_id: studentId,
      latest_course_status: status,
      is_shortlisted: isShortlisted !== undefined ? isShortlisted : true,
    });

    if (courseId && studentId) {
      try {
        const collegeName = await UniversityCourse.findOne({
          where: { course_id: courseId },
          attributes: [
            'university_name',
            'university_state',
            'university_city'
          ]
        });

        const student = await Student.findOne({
          where: { student_id: studentId },
          attributes: [
            'source',
            'student_name',
            'student_phone',
            'student_email'
          ]
        });

        if (collegeName && student) {
          await pushLeadToAudience({
            groupName: collegeName.university_name,
            lead: {
              source: student.source,
              student_name: student.student_name,
              student_phone: student.student_phone,
              student_email: student.student_email
            }
          });
        }
      } catch (audienceError) {
        console.error('Error pushing to audience:', audienceError.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'New college status created successfully',
      data: newStudentCourseStatus,
      isNewEntry: true
    });

  } catch (error) {
    console.error('Error updating college status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};
export const getLeadStatusApiReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    let whereClause = '';
    const replacements = {};

    if (from && to) {
      whereClause = 'WHERE sc.created_at BETWEEN :fromDate AND :toDate';
      replacements.fromDate = from;
      replacements.toDate = to + ' 23:59:59';
    } else if (from) {
      whereClause = 'WHERE sc.created_at >= :fromDate';
      replacements.fromDate = from;
    } else if (to) {
      whereClause = 'WHERE sc.created_at <= :toDate';
      replacements.toDate = to + ' 23:59:59';
    }

    // Debug: Check if student_id exists in latest_course_statuses
    const debugQuery4 = `
      SELECT 
        lcs.course_id,
        lcs.student_id,
        lcs.is_shortlisted,
        uc.university_name,
        st.assigned_counsellor_id,
        c.counsellor_name
      FROM latest_course_statuses lcs
      JOIN university_courses uc ON lcs.course_id = uc.course_id
      LEFT JOIN students st ON lcs.student_id = st.student_id
      LEFT JOIN counsellors c ON st.assigned_counsellor_id = c.counsellor_id
      WHERE lcs.is_shortlisted = true
      LIMIT 10
    `;

    const debugResults4 = await sequelize.query(debugQuery4, {
      type: sequelize.QueryTypes.SELECT
    });

    console.log('=== DEBUG 4: Shortlisted courses with student_id ===');
    console.log(debugResults4);

    // Main query with supervisor name
    const query = `
      SELECT
        c.counsellor_name AS counsellor,
        COALESCE(sup.counsellor_name, 'No Supervisor') AS supervisor,  -- Get supervisor name
        sc.college_name,
        COUNT(CASE WHEN LOWER(sc.api_sent_status) = 'do not proceed' THEN 1 END) AS "Do Not Proceed",
        COUNT(CASE WHEN LOWER(sc.api_sent_status) = 'failed due to technical issues' THEN 1 END) AS "Technical Fail",
        COUNT(CASE WHEN LOWER(sc.api_sent_status) = 'proceed' THEN 1 END) AS "Proceed"
        -- Removed Shortlisted Count as requested
      FROM student_college_api_sent_status sc
      JOIN students s ON sc.student_id = s.student_id
      JOIN counsellors c ON c.counsellor_id = s.assigned_counsellor_id
      LEFT JOIN counsellors sup ON sup.counsellor_id = c.assigned_to  -- Join to get supervisor name
      ${whereClause}
      GROUP BY c.counsellor_name, sc.college_name, c.counsellor_id, sup.counsellor_name
      ORDER BY c.counsellor_name, sc.college_name;
    `;

    console.log('=== FINAL QUERY ===');
    console.log('Query:', query);
    console.log('Replacements:', replacements);

    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    console.log('=== FINAL RESULTS ===');
    console.log('Total records:', results.length);

    // Show records where college_name matches universities with shortlisted courses
    const collegesWithShortlists = ['Amity University Online', 'Shoolini University online', 'Mangalayatan University online', 'Lovely Professional University Online', 'GLA University Online'];
    const filteredResults = results.filter(r => collegesWithShortlists.includes(r.college_name));
    console.log('Filtered results (colleges with shortlisted courses):', filteredResults);

    res.status(200).json({
      success: true,
      data: results,
      filters: { from, to },
      totalRecords: results.length,
      debug: {
        shortlistedCoursesWithStudents: debugResults4
      }
    });
  } catch (error) {
    console.error('Error in getLeadStatusApiReport:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
export const getCollegeStatus = async (req, res) => {
  try {
    const { courseId, studentId } = req.params;
    const userId = req.user?.counsellorId || req.user?.supervisorId;
    const role = req.user?.role;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Base query
    const whereClause = {
      course_id: courseId,
      student_id: studentId
    };


    if (role !== 'Supervisor') {
      whereClause.created_by = null;
    }

    const latestStatus = await CourseStatus.findOne({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    if (!latestStatus) {
      return res.status(200).json({
        success: true,
        data: {
          courseId,
          studentId,
          status: 'Fresh',
          isShortlisted: false
        }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        courseId: latestStatus.course_id,
        studentId: latestStatus.student_id,
        status: latestStatus.latest_course_status,
        isShortlisted: latestStatus.is_shortlisted,
        createdAt: latestStatus.created_at,
        updatedAt: latestStatus.updated_at
      }
    });
  } catch (error) {
    console.error('Error fetching college status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getShortlistedColleges = async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user?.counsellorId || req.user?.supervisorId || req.user?.id || null;
    const role = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const whereClause = {
      student_id: studentId,
      is_shortlisted: true
    };

    if (role !== 'Supervisor') {
      whereClause.created_by = null;
    }

    const shortlistedStatuses = await CourseStatus.findAll({
      where: whereClause,
      include: [
        {
          model: UniversityCourse,
          required: true,
          as: 'courses_details',
          include: [
            {
              model: UniversitiesAPIHeaderValues,
              required: false,
              as: 'university_api',
              attributes: ['id'],
              limit: 1,
              on: {

                col1: sequelize.where(
                  sequelize.col('courses_details.university_name'),
                  '=',
                  sequelize.col('courses_details->university_api.university_name')
                )
              }
            },
            {
              model: UniversitiesAPIHeaderValues,
              required: false,
              as: 'university_api',
              attributes: ['id'],
              limit: 1,
              on: {

                col1: sequelize.where(
                  sequelize.col('courses_details.university_name'),
                  '=',
                  sequelize.col('courses_details->university_api.university_name')
                )
              }
            }
          ]
        }
      ],
    });
    const sendStatus = await StudentCollegeApiSentStatus.findAll({
      where: { student_id: studentId },
      attributes: ['api_sent_status', 'college_name']
    });

    if (!shortlistedStatuses.length) {
      return res.status(200).json({
        success: true,
        message: 'No shortlisted colleges found',
        data: []
      });
    }

    const statusMap = {};
    sendStatus.forEach(item => {
      const { college_name, api_sent_status } = item.toJSON();
      statusMap[college_name?.toLowerCase()?.trim()] = api_sent_status;
    });

    const updatedArray = shortlistedStatuses.map(status => {
      const plain = status.toJSON();
      const course = plain.courses_details || {};
      const api = course.university_api || null;

      const universityName = course.university_name?.toLowerCase()?.trim();
      const matchedApiStatus = universityName ? statusMap[universityName] : undefined;

      return {
        ...plain,
        ...course,
        university_api: api,
        has_api_data: !!api,
        college_api_sent_status: matchedApiStatus || null
      };
    });
    return res.status(200).json({
      success: true,
      message: 'Shortlisted colleges fetched successfully',
      data: updatedArray
    });


  } catch (error) {
    console.error('Error fetching shortlisted colleges:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Additional helper function to get all course statuses for a student
export const getAllCourseStatusesForStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user?.counsellorId || req.user?.supervisorId;
    const role = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const whereClause = {
      student_id: studentId
    };

    if (role !== 'Supervisor') {
      whereClause.created_by = userId;
    }

    const courseStatuses = await CourseStatus.findAll({
      where: whereClause,
      include: [{
        model: UniversityCourse,
        as: 'course',
        required: false
      }],
      order: [['updated_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      message: 'Course statuses retrieved successfully',
      data: courseStatuses
    });

  } catch (error) {
    console.error('Error fetching course statuses:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const bulkUpdateCourseStatuses = async (req, res) => {
  try {
    const { updates } = req.body;
    const userId = req.user?.counsellorId || req.user?.supervisorId || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updates array is required and cannot be empty'
      });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { courseId, studentId, status, isShortlisted } = update;

        if (!courseId || !studentId || !status) {
          errors.push({
            update,
            error: 'Missing required fields'
          });
          continue;
        }

        const [courseStatus, created] = await CourseStatus.upsert({
          course_id: courseId,
          student_id: studentId,
          latest_course_status: status,
          is_shortlisted: isShortlisted !== undefined ? isShortlisted : status === 'Shortlisted',
          created_by: userId,
          updated_at: new Date()
        }, {
          returning: true
        });

        results.push({
          courseStatus,
          isNew: created
        });

      } catch (error) {
        errors.push({
          update,
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Processed ${updates.length} updates`,
      data: {
        successful: results,
        failed: errors,
        totalProcessed: updates.length,
        successCount: results.length,
        errorCount: errors.length
      }
    });

  } catch (error) {
    console.error('Error in bulk update:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};



import { QueryTypes } from "sequelize";
import { configDotenv } from 'dotenv';
import Analyser from '../models/Analyser.js';
export const formatDate = (d) => {
  if (!d) return '';
  try {
    return format(new Date(d), 'dd-MMM-yyyy HH:mm:ss');
  } catch {
    return d.toString();
  }
};

export const downloadRecordsForView = async (req, res) => {
  try {
    // Convert date to IST start of day
    const getIstFormatTime = (date) => {
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(date.getTime() + istOffset);
      istDate.setUTCHours(0, 0, 0, 0);
      return new Date(istDate.getTime() - istOffset);
    };

    let fromDate, toDate;

    if (req.query.from && req.query.to) {
      fromDate = getIstFormatTime(new Date(req.query.from + 'T00:00:00.000Z'));
      toDate = new Date(req.query.to + 'T23:59:59.999Z');
    } else {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      fromDate = yesterday;
      toDate = now;
    }



    const result = await sequelize.query(
      `
      SELECT DISTINCT ON (s.student_id)
        lcs.latest_course_status,
        lcs.created_at,
        s.student_id,
        s.student_name,
        s.source,
        ac.counsellor_name AS l2_name,
        acl3.counsellor_name AS l3_name,
        la.utm_campaign,
        la.source AS lead_source,
        la.source_url,
        uc.course_id,
        uc.course_name,
        uc.university_name
      FROM latest_course_statuses lcs
      JOIN students s
        ON s.student_id = lcs.student_id
      LEFT JOIN counsellors ac
        ON ac.counsellor_id = s.assigned_counsellor_id
      LEFT JOIN counsellors acl3
        ON acl3.counsellor_id = s.assigned_counsellor_l3_id
      LEFT JOIN LATERAL (
        SELECT la1.*
        FROM student_lead_activities la1
        WHERE la1.student_id = s.student_id
          AND la1.utm_campaign <> ''
        ORDER BY la1.created_at DESC
        LIMIT 1
      ) la ON TRUE
      LEFT JOIN university_courses uc
        ON uc.course_id = lcs.course_id
      WHERE lcs.latest_course_status = 'Shortlisted'
        AND lcs.created_at BETWEEN :fromDate AND :toDate
      ORDER BY s.student_id, lcs.created_at DESC;
      `,
      {
        replacements: { fromDate, toDate },
        type: QueryTypes.SELECT,
      }
    );

    const filteredFormatted = result.map((course) => ({
      _id: course.course_id,
      courseName: course.course_name || '',
      universityName: course.university_name || '',
      studentId: course.student_id,
      utm_campaign: course.utm_campaign || '',
      source: course.source || course.lead_source || '',
      currentL2: course.l2_name || '',
      currentL3: course.l3_name || '',
      status: course.latest_course_status || '',
      createdAt: formatDate(course.created_at),
    }));

    res.json({
      success: true,
      totalRecords: filteredFormatted.length,
      data: filteredFormatted,
    });
  } catch (e) {
    console.log('Error:', e.message);
    res.status(500).send({ error: 'Internal Server Error' });
  }
};



export const getThreeRecordsOfFormFilled = async (req, res) => {
  try {
    const {
      type,
      source,
      utm_campaign,
      created_at_start,
      created_at_end,
      counsellor_id,
      counsellor_status,
      sortBy,
      sortOrder
    } = req.query;

    const userRole = req.user?.role;
    const userId = req.user?.id;
    const isAnalyser = userRole === 'Analyser';

    let analyserFilters = {};
    if (isAnalyser && userId) {
      try {
        const analyser = await Analyser.findByPk(userId, {
          attributes: ['sources', 'campaigns', 'student_creation_date', 'source_urls']
        });

        if (analyser) {
          analyserFilters = {
            sources: analyser.sources || [],
            campaigns: analyser.campaigns || [],
            student_creation_date: analyser.student_creation_date || '',
            source_urls: analyser.source_urls || []
          };
        }
      } catch (error) {
        console.error('Error fetching analyser data:', error);
      }
    }

    const utm_array = utm_campaign && utm_campaign.split(',');
    const counsellor_array = counsellor_id && counsellor_id.split(',');
    const source_array = source && source.split(',');

    if (!['agent', 'source', 'campaign', 'created_at', 'source_url'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use agent, source, campaign, created_at, or source_url' });
    }

    const dateRangeSQL = (col, start, end) => {
      if (start && end) {
        const startUTC = new Date(`${start}T00:00:00+05:30`).toISOString();
        const endDate = new Date(`${end}T23:59:59+05:30`);
        const endUTC = endDate.toISOString();
        return `${col} >= '${startUTC}' AND ${col} <= '${endUTC}'`;
      }
      if (start) {
        const startUTC = new Date(`${start}T00:00:00+05:30`).toISOString();
        return `${col} >= '${startUTC}'`;
      }
      if (end) {
        const endDate = new Date(`${end}T23:59:59+05:30`);
        const endUTC = endDate.toISOString();
        return `${col} <= '${endUTC}'`;
      }
      return '';
    };

    const applyAnalyserDateFilter = () => {
      if (!isAnalyser || !analyserFilters.student_creation_date) return '';

      const now = new Date();
      const todayIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      const todayISTDate = todayIST.toISOString().split('T')[0];

      const istDateToUTCStart = (istDateString) => {
        const [year, month, day] = istDateString.split('-');
        return `${year}-${month}-${day} 18:30:00+00`;
      };

      const istDateToUTCEnd = (istDateString) => {
        const [year, month, day] = istDateString.split('-');
        const date = new Date(Date.UTC(year, month - 1, parseInt(day) + 1));
        const nextDay = date.toISOString().split('T')[0];
        return `${nextDay} 18:30:00+00`;
      };

      switch (analyserFilters.student_creation_date) {
        case 'today': {
          const startUTC = istDateToUTCStart(todayISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'yesterday': {
          const yesterday = new Date(todayIST);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayISTDate = yesterday.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(yesterdayISTDate);
          const endUTC = istDateToUTCEnd(yesterdayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'last_7_days': {
          const sevenDaysAgo = new Date(todayIST);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenDaysAgoISTDate = sevenDaysAgo.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(sevenDaysAgoISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'last_30_days': {
          const thirtyDaysAgo = new Date(todayIST);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const thirtyDaysAgoISTDate = thirtyDaysAgo.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(thirtyDaysAgoISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'this_month': {
          const firstDayOfMonth = new Date(todayIST.getFullYear(), todayIST.getMonth(), 1);
          const firstDayISTDate = firstDayOfMonth.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(firstDayISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'last_month': {
          const firstDayOfLastMonth = new Date(todayIST.getFullYear(), todayIST.getMonth() - 1, 1);
          const lastDayOfLastMonth = new Date(todayIST.getFullYear(), todayIST.getMonth(), 0);
          const firstDayISTDate = firstDayOfLastMonth.toISOString().split('T')[0];
          const lastDayISTDate = lastDayOfLastMonth.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(firstDayISTDate);
          const endUTC = istDateToUTCEnd(lastDayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        default:
          return '';
      }
    };

    let whereConds = [];
    let studentWhereConds = [];
    let analyserCTEConditions = '';

    if (isAnalyser) {
      if (analyserFilters.sources && analyserFilters.sources.length > 0) {
        const sourceCondition = `s.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
        whereConds.push(sourceCondition);
        studentWhereConds.push(sourceCondition);
        analyserCTEConditions = `INNER JOIN students s_fb ON sla.student_id = s_fb.student_id AND (s_fb.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}'))`;
      }

      if (analyserFilters.campaigns && analyserFilters.campaigns.length > 0) {
        whereConds.push(`first_la.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}')`);
        analyserCTEConditions += analyserCTEConditions ?
          ` AND (first_la.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR first_la.utm_campaign IS NULL)` :
          `INNER JOIN students s_fb ON sla.student_id = s_fb.student_id AND (first_la.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR first_la.utm_campaign IS NULL)`;
      }

      if (analyserFilters.source_urls && analyserFilters.source_urls.length > 0) {
        const sourceUrlCondition = `(s.first_source_url IN ('${analyserFilters.source_urls.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR s.first_source_url IS NULL)`;
        whereConds.push(sourceUrlCondition);
        studentWhereConds.push(sourceUrlCondition);
      }

      const analyserDateFilter = applyAnalyserDateFilter();
      if (analyserDateFilter) {
        whereConds.push(analyserDateFilter);
        studentWhereConds.push(analyserDateFilter);
      }
    } else if (source) {
      const sourceCondition = `s.source IN ('${source_array.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
      whereConds.push(sourceCondition);
      studentWhereConds.push(sourceCondition);
    }

    if ((created_at_start || created_at_end) && !(isAnalyser && analyserFilters.student_creation_date)) {
      const dateCondition = dateRangeSQL("s.created_at", created_at_start, created_at_end);
      whereConds.push(dateCondition);
      studentWhereConds.push(dateCondition);
    }

    const wrapArrayForSQL = (arr) => `('${arr.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;

    if (utm_campaign && !(isAnalyser && analyserFilters.campaigns && analyserFilters.campaigns.length > 0)) {
      whereConds.push(`first_la.utm_campaign IN ${wrapArrayForSQL(utm_array)}`);
    }

    if (counsellor_id) {
      whereConds.push(`(c.counsellor_id IN ${wrapArrayForSQL(counsellor_array)} OR s.assigned_counsellor_id IN ${wrapArrayForSQL(counsellor_array)})`);
    }

    const whereSQL = whereConds.length ? `WHERE ${whereConds.join(' AND ')}` : '';

    let groupByField;
    let groupByClause;
    let supervisorSelect;
    let counsellorJoin = '';
    let counsellorStatusCondition = '';

    if (type === 'agent') {
      groupByField = `
  CASE 
    WHEN assigned_counsellor.counsellor_name IS NOT NULL AND assigned_counsellor.counsellor_name != '' 
      THEN assigned_counsellor.counsellor_name
    WHEN c.counsellor_name IS NOT NULL AND c.counsellor_name != '' 
      THEN c.counsellor_name
    ELSE 'Unassigned'
  END
`;

      supervisorSelect = `
  MAX(
    CASE 
      WHEN assigned_counsellor.assigned_to IS NOT NULL AND assigned_counsellor.assigned_to != '' 
        THEN (SELECT counsellor_name FROM counsellors WHERE counsellor_id = assigned_counsellor.assigned_to)
      WHEN c.assigned_to IS NOT NULL AND c.assigned_to != '' 
        THEN (SELECT counsellor_name FROM counsellors WHERE counsellor_id = c.assigned_to)
      ELSE 'No Supervisor'
    END
  ) AS supervisor_name
`;

      groupByClause = `
  COALESCE(assigned_counsellor.counsellor_id, c.counsellor_id),
  ${groupByField}
`;

      counsellorJoin = `
        LEFT JOIN counsellors assigned_counsellor ON s.assigned_counsellor_id = assigned_counsellor.counsellor_id
      `;

      if (counsellor_status) {
        counsellorStatusCondition = `AND (assigned_counsellor.status = '${counsellor_status}' OR c.status = '${counsellor_status}')`;
      }
    } else if (type === 'source') {
      groupByField = `COALESCE(NULLIF(s.source, ''), 'NA')`;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    } else if (type === 'campaign') {
      groupByField = `COALESCE(NULLIF(first_la.utm_campaign, ''), 'NA')`;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    } else if (type === 'created_at') {
      groupByField = `DATE(s.created_at AT TIME ZONE 'Asia/Kolkata')`;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    } else if (type === 'source_url') {
      groupByField = `
        CASE 
          WHEN s.first_source_url IS NULL OR TRIM(s.first_source_url) = '' THEN 'NA'
          ELSE TRIM(SPLIT_PART(s.first_source_url, '?', 1))
        END
      `;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    }

    const buildCTECondition = (tableAlias) => {
      if (!isAnalyser || !analyserFilters.sources || analyserFilters.sources.length === 0) {
        return '';
      }
      return `INNER JOIN students s_fb ON ${tableAlias}.student_id = s_fb.student_id AND s_fb.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
    };

    // NEW CTEs: Check for ANY admission/formfilled in history (not just latest)
    const firstAdmissionCTE = `
      SELECT DISTINCT
        student_id
      FROM student_remarks
      WHERE lead_status IN ('Admission', 'Enrolled')
    `;

    const firstFormfilledCTE = `
      SELECT DISTINCT
        student_id
      FROM student_remarks
      WHERE lead_status IN ('Application', 'Admission', 'Enrolled')
    `;

    const firstEnrolledCTE = `
      SELECT DISTINCT
        student_id
      FROM student_remarks
      WHERE lead_status = 'Enrolled'
    `;

    const firstNotInterestedCTE = `
      SELECT DISTINCT
        student_id
      FROM student_remarks
      WHERE lead_status = 'NotInterested'
    `;

    const firstPreApplicationCTE = `
      SELECT DISTINCT
        student_id
      FROM student_remarks
      WHERE lead_status = 'Pre Application'
    `;

    const firstLaCTE = `
      SELECT DISTINCT ON (sla.student_id)
        sla.student_id,
        sla.utm_campaign,
        sla.created_at
      FROM student_lead_activities sla
      ${buildCTECondition('sla')}
      ${analyserFilters.campaigns && analyserFilters.campaigns.length > 0 ?
        `WHERE (sla.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR sla.utm_campaign IS NULL)` : ''}
      ORDER BY sla.student_id, sla.created_at ASC, sla.id ASC
    `;

    const lastRemarkCTE = `
      SELECT DISTINCT ON (sr.student_id) 
        sr.student_id,
        sr.counsellor_id,
        sr.lead_status,
        sr.remark_id
      FROM student_remarks sr
      ${buildCTECondition('sr')}
      ORDER BY sr.student_id, sr.created_at DESC, sr.remark_id DESC
    `;

    const connectedRemarksCountCTE = `
      SELECT 
        sr.student_id,
        COUNT(*) as connected_remarks_count
      FROM student_remarks sr
      ${buildCTECondition('sr')}
      WHERE LOWER(TRIM(sr.calling_status)) = 'connected'
      GROUP BY sr.student_id
    `;

    const studentRemarkCountCTE = `
      SELECT 
        sr.student_id,
        COUNT(*) as total_remarks_count
      FROM student_remarks sr
      ${buildCTECondition('sr')}
      GROUP BY sr.student_id
    `;

    const preNICTE = `
      WITH eligible_students AS (
        SELECT student_id
        FROM student_remarks sr
        WHERE NOT EXISTS (
          SELECT 1 
          FROM student_remarks ex 
          WHERE ex.student_id = sr.student_id
            AND (
              ex.lead_sub_status = 'Initial Counseling Completed'
              OR ex.lead_status IN ('Application', 'Admission')
            )
        )
        GROUP BY student_id
        HAVING (
          (COUNT(*) = 1 AND BOOL_AND(lead_status = 'NotInterested'))
          OR
          (
            COUNT(*) > 1
            AND MAX(created_at) FILTER (
              WHERE lead_status = 'NotInterested'
            ) = MAX(created_at)
            AND NOT BOOL_OR(
              lead_status IN ('Admission', 'Application')
              OR lead_sub_status = 'Initial Counseling Completed'
            )
          )
          OR
          (COUNT(*) > 1 AND BOOL_AND(lead_status = 'NotInterested'))
        )
      )
      SELECT student_id FROM eligible_students
    `;

    let sortColumn;
    if (sortBy) {
      const sortMap = {
        'admission': 'admission_count',
        'formfilled': 'formFilled',
        'leads': 'lead_count',
        'connected': 'connectedAnytime',
        'icc': 'icc',
        'active': 'active_cases',
        'name': 'group_by',
        'supervisor': 'supervisor_name',
        'preni': 'pre_ni_count',
        'prenipercent': 'pre_ni_percent'
      };

      sortColumn = sortMap[sortBy.toLowerCase()] || 'admission_count';
    } else {
      if (type === 'created_at') {
        sortColumn = 'group_by';
      } else if (type === 'agent' && sortBy === 'supervisor') {
        sortColumn = 'supervisor_name';
      } else {
        sortColumn = 'group_by';
      }
    }

    const defaultSortOrder = (type === 'created_at') ? 'DESC' : 'ASC';
    const finalSortOrder = sortOrder || defaultSortOrder;

    let mainQuery = `
      WITH first_la AS (${firstLaCTE}),
           last_remark AS (${lastRemarkCTE}),
           connected_remarks_count AS (${connectedRemarksCountCTE}),
           student_remark_count AS (${studentRemarkCountCTE}),
           pre_ni_students AS (${preNICTE}),
           -- NEW CTEs for ANY status in history
           first_admission_students AS (${firstAdmissionCTE}),
           first_formfilled_students AS (${firstFormfilledCTE}),
           first_enrolled_students AS (${firstEnrolledCTE}),
           first_not_interested_students AS (${firstNotInterestedCTE}),
           first_pre_application_students AS (${firstPreApplicationCTE})
           
      SELECT
        ${groupByField} AS group_by,
        ${supervisorSelect},
        
        COUNT(DISTINCT s.student_id) AS lead_count,
        
        COUNT(DISTINCT CASE 
          WHEN src.total_remarks_count IS NULL OR src.total_remarks_count = 0
          THEN s.student_id 
        END) AS freshCount,

        COUNT(DISTINCT CASE 
          WHEN pns.student_id IS NOT NULL
          THEN s.student_id 
        END) AS pre_ni_count,

        COUNT(DISTINCT CASE 
          WHEN fps.student_id IS NOT NULL
          THEN s.student_id 
        END) AS pre_application_count,

        COUNT(DISTINCT CASE 
          WHEN (src.total_remarks_count IS NULL OR src.total_remarks_count = 0) 
             OR fps.student_id IS NOT NULL
          THEN s.student_id 
        END) AS active_cases,

        COUNT(DISTINCT CASE 
          WHEN src.total_remarks_count > 0
          THEN s.student_id 
        END) AS attempted,

        -- COUNT formfilled if student EVER had Application/Admission/Enrolled status
        COUNT(DISTINCT CASE 
          WHEN ffs.student_id IS NOT NULL
          THEN s.student_id 
        END) AS formFilled,

        -- COUNT admission if student EVER had Admission/Enrolled status
        COUNT(DISTINCT CASE 
          WHEN fas.student_id IS NOT NULL
          THEN s.student_id 
        END) AS admission_count,

        -- COUNT enrolled if student EVER had Enrolled status
        COUNT(DISTINCT CASE 
          WHEN fes.student_id IS NOT NULL
          THEN s.student_id 
        END) AS enrolled,

        -- COUNT NotInterested if student EVER had NotInterested status
        COUNT(DISTINCT CASE 
          WHEN fnis.student_id IS NOT NULL
          THEN s.student_id 
        END) AS ni,

        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM student_remarks sr2
          ${buildCTECondition('sr2')}
          WHERE sr2.student_id = s.student_id 
          AND LOWER(TRIM(sr2.calling_status)) = 'connected'
        ) THEN s.student_id END) as connectedAnytime,

        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM student_remarks sr2
          ${buildCTECondition('sr2')}
          WHERE sr2.student_id = s.student_id 
          AND sr2.lead_sub_status = 'Initial Counseling Completed'
        ) THEN s.student_id END) as icc,

        COUNT(DISTINCT CASE 
          WHEN (src.total_remarks_count IS NULL OR src.total_remarks_count = 0)
             OR (fps.student_id IS NOT NULL AND (crc.connected_remarks_count IS NULL OR crc.connected_remarks_count < 4))
          THEN s.student_id 
        END) AS under_3_remarks,

        COUNT(DISTINCT CASE 
          WHEN fps.student_id IS NOT NULL
            AND crc.connected_remarks_count BETWEEN 4 AND 7
          THEN s.student_id 
        END) AS remarks_4_7,

        COUNT(DISTINCT CASE 
          WHEN fps.student_id IS NOT NULL
            AND crc.connected_remarks_count BETWEEN 8 AND 10
          THEN s.student_id 
        END) AS remarks_8_10,

        COUNT(DISTINCT CASE 
          WHEN fps.student_id IS NOT NULL
            AND crc.connected_remarks_count > 10
          THEN s.student_id 
        END) AS remarks_gt_10

      FROM students s
      LEFT JOIN last_remark lr ON s.student_id = lr.student_id
      LEFT JOIN first_la ON s.student_id = first_la.student_id
      LEFT JOIN connected_remarks_count crc ON s.student_id = crc.student_id
      LEFT JOIN student_remark_count src ON s.student_id = src.student_id
      LEFT JOIN pre_ni_students pns ON s.student_id = pns.student_id
      -- Join with the new CTEs for ANY status in history
      LEFT JOIN first_admission_students fas ON s.student_id = fas.student_id
      LEFT JOIN first_formfilled_students ffs ON s.student_id = ffs.student_id
      LEFT JOIN first_enrolled_students fes ON s.student_id = fes.student_id
      LEFT JOIN first_not_interested_students fnis ON s.student_id = fnis.student_id
      LEFT JOIN first_pre_application_students fps ON s.student_id = fps.student_id
      LEFT JOIN counsellors c ON lr.counsellor_id = c.counsellor_id
      ${counsellorJoin}
    `;

    if (whereSQL || counsellorStatusCondition) {
      mainQuery += ' WHERE ';
      if (whereSQL) {
        mainQuery += whereSQL.substring(6);
      }
      if (counsellorStatusCondition) {
        if (whereSQL) mainQuery += ' AND ';
        mainQuery += counsellorStatusCondition.substring(4);
      }
    }

    mainQuery += `
      GROUP BY ${groupByClause}
      ORDER BY ${sortColumn} ${finalSortOrder}
    `;

    const groupedRows = await sequelize.query(mainQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    if (type === 'agent') {
      let allCounsellorsQuery = `
        SELECT 
          counsellor_id,
          counsellor_name,
          status,
          assigned_to,
          (SELECT counsellor_name FROM counsellors c2 WHERE c2.counsellor_id = c1.assigned_to) as supervisor_name
        FROM counsellors c1
        WHERE 1=1
      `;

      if (counsellor_status) {
        allCounsellorsQuery += ` AND status = '${counsellor_status}'`;
      }

      allCounsellorsQuery += ` ORDER BY counsellor_name`;

      const allCounsellors = await sequelize.query(allCounsellorsQuery, {
        type: sequelize.QueryTypes.SELECT,
      });

      const existingResultsMap = {};
      groupedRows.forEach(row => {
        if (row.group_by && row.group_by !== 'Unassigned') {
          existingResultsMap[row.group_by] = row;
        }
      });

      const existingByCounsellorId = {};
      groupedRows.forEach(row => {
        if (row.counsellor_id) {
          existingByCounsellorId[row.counsellor_id] = row;
        }
      });

      const mergedRows = allCounsellors.map(counsellor => {
        const counsellorName = counsellor.counsellor_name;
        const existingRow = existingResultsMap[counsellorName] || existingByCounsellorId[counsellor.counsellor_id];

        if (existingRow) {
          return {
            ...existingRow,
            counsellor_id: counsellor.counsellor_id,
            counsellor_status: counsellor.status,
            supervisor_name: counsellor.supervisor_name || existingRow.supervisor_name || 'No Supervisor'
          };
        } else {
          return {
            group_by: counsellorName,
            supervisor_name: counsellor.supervisor_name || 'No Supervisor',
            counsellor_id: counsellor.counsellor_id,
            counsellor_status: counsellor.status,
            lead_count: 0,
            freshCount: 0,
            pre_ni_count: 0,
            pre_application_count: 0,
            active_cases: 0,
            attempted: 0,
            formFilled: 0,
            admission_count: 0,
            enrolled: 0,
            ni: 0,
            connectedAnytime: 0,
            icc: 0,
            under_3_remarks: 0,
            remarks_4_7: 0,
            remarks_8_10: 0,
            remarks_gt_10: 0
          };
        }
      });

      const unassignedRow = groupedRows.find(row => row.group_by === 'Unassigned');
      if (unassignedRow) {
        if (!counsellor_status || (counsellor_status === 'active' && unassignedRow)) {
          mergedRows.push({
            ...unassignedRow,
            counsellor_status: 'unassigned'
          });
        }
      }

      groupedRows.length = 0;
      groupedRows.push(...mergedRows);
    }

    const getValue = (row, prop) => {
      const lowerProp = prop.toLowerCase();
      for (const key in row) {
        if (key.toLowerCase() === lowerProp) {
          return Number(row[key]) || 0;
        }
      }
      return 0;
    };

    const formatRow = (row) => {
      const lead_count = getValue(row, 'lead_count');
      const ni = getValue(row, 'ni');
      const enrolled = getValue(row, 'enrolled');
      const admission_count = getValue(row, 'admission_count');
      const pre_ni_count = getValue(row, 'pre_ni_count');

      const freshCount = getValue(row, 'freshCount');
      const pre_application_count = getValue(row, 'pre_application_count');
      const active_cases = getValue(row, 'active_cases');
      const formFilled = getValue(row, 'formFilled');
      const connectedAnytime = getValue(row, 'connectedAnytime');
      const icc = getValue(row, 'icc');
      const attempted = getValue(row, 'attempted');

      const under_3_remarks = getValue(row, 'under_3_remarks');
      const remarks_4_7 = getValue(row, 'remarks_4_7');
      const remarks_8_10 = getValue(row, 'remarks_8_10');
      const remarks_gt_10 = getValue(row, 'remarks_gt_10');

      return {
        group_by: row.group_by,
        supervisor_name: row.supervisor_name || 'No Supervisor',
        counsellor_status: row.counsellor_status || 'active',
        lead_count,
        total_leads: lead_count,
        freshCount,
        preNI: pre_ni_count,
        preNIPercent: lead_count > 0 ? Number(((pre_ni_count / lead_count) * 100).toFixed(1)) : 0,
        attempted,
        formFilled,
        formfilled: formFilled,
        admission: admission_count,
        connectedAnytime,
        icc,
        connectedAnytimePercent: lead_count > 0 ? Number(((connectedAnytime / lead_count) * 100).toFixed(1)) : 0,
        iccPercent: lead_count > 0 ? Number(((icc / lead_count) * 100).toFixed(1)) : 0,
        leadToForm: attempted > 0 ? Number(((formFilled / attempted) * 100).toFixed(1)) : 0,
        formToAdmission: formFilled > 0 ? Number(((admission_count / formFilled) * 100).toFixed(1)) : 0,
        leadToAdmission: attempted > 0 ? Number(((admission_count / attempted) * 100).toFixed(1)) : 0,
        active_cases: active_cases,
        ni,
        enrolled,
        application: formFilled,
        under_3_remarks,
        remarks_4_7,
        remarks_8_10,
        remarks_gt_10
      };
    };

    const calculateOverall = (rawRows) => {
      const overall = {
        group_by: 'Total',
        supervisor_name: 'All Supervisors',
        counsellor_status: 'all',
        lead_count: 0,
        freshCount: 0,
        pre_ni_count: 0,
        pre_application_count: 0,
        attempted: 0,
        formFilled: 0,
        admission_count: 0,
        enrolled: 0,
        ni: 0,
        connectedAnytime: 0,
        icc: 0,
        active_cases: 0,
        under_3_remarks: 0,
        remarks_4_7: 0,
        remarks_8_10: 0,
        remarks_gt_10: 0
      };

      rawRows.forEach(row => {
        overall.lead_count += getValue(row, 'lead_count');
        overall.freshCount += getValue(row, 'freshCount');
        overall.pre_ni_count += getValue(row, 'pre_ni_count');
        overall.pre_application_count += getValue(row, 'pre_application_count');
        overall.attempted += getValue(row, 'attempted');
        overall.formFilled += getValue(row, 'formFilled');
        overall.admission_count += getValue(row, 'admission_count');
        overall.enrolled += getValue(row, 'enrolled');
        overall.ni += getValue(row, 'ni');
        overall.connectedAnytime += getValue(row, 'connectedAnytime');
        overall.icc += getValue(row, 'icc');
        overall.active_cases += getValue(row, 'active_cases');
        overall.under_3_remarks += getValue(row, 'under_3_remarks');
        overall.remarks_4_7 += getValue(row, 'remarks_4_7');
        overall.remarks_8_10 += getValue(row, 'remarks_8_10');
        overall.remarks_gt_10 += getValue(row, 'remarks_gt_10');
      });

      return overall;
    };

    const grouped = groupedRows.map(formatRow);
    const overallRaw = calculateOverall(groupedRows);
    const overall = formatRow(overallRaw);

    let groupedBySupervisor = null;
    if (type === 'agent') {
      const supervisorGroups = {};

      grouped.forEach(row => {
        const supervisorName = row.supervisor_name || 'No Supervisor';

        if (!supervisorGroups[supervisorName]) {
          supervisorGroups[supervisorName] = {
            supervisorName,
            counsellor_status: row.counsellor_status || 'active',
            lead_count: 0,
            freshCount: 0,
            preNI: 0,
            attempted: 0,
            formFilled: 0,
            admission_count: 0,
            connectedAnytime: 0,
            icc: 0,
            active_cases: 0,
            counsellors: []
          };
        }

        supervisorGroups[supervisorName].counsellors.push(row);
        supervisorGroups[supervisorName].lead_count += row.lead_count;
        supervisorGroups[supervisorName].freshCount += row.freshCount;
        supervisorGroups[supervisorName].preNI += row.preNI || 0;
        supervisorGroups[supervisorName].attempted += row.attempted;
        supervisorGroups[supervisorName].formFilled += row.formFilled;
        supervisorGroups[supervisorName].admission_count += row.admission_count;
        supervisorGroups[supervisorName].connectedAnytime += row.connectedAnytime;
        supervisorGroups[supervisorName].icc += row.icc;
        supervisorGroups[supervisorName].active_cases += row.active_cases;
      });

      Object.values(supervisorGroups).forEach(supervisorGroup => {
        const lead_count = supervisorGroup.lead_count;
        supervisorGroup.connectedAnytimePercent = lead_count > 0 ? Number(((supervisorGroup.connectedAnytime / lead_count) * 100).toFixed(1)) : 0;
        supervisorGroup.iccPercent = lead_count > 0 ? Number(((supervisorGroup.icc / lead_count) * 100).toFixed(1)) : 0;
        supervisorGroup.preNIPercent = lead_count > 0 ? Number(((supervisorGroup.preNI / lead_count) * 100).toFixed(1)) : 0;
        supervisorGroup.leadToForm = supervisorGroup.attempted > 0 ? Number(((supervisorGroup.formFilled / supervisorGroup.attempted) * 100).toFixed(1)) : 0;
        supervisorGroup.formToAdmission = supervisorGroup.formFilled > 0 ? Number(((supervisorGroup.admission_count / supervisorGroup.formFilled) * 100).toFixed(1)) : 0;
      });

      groupedBySupervisor = Object.values(supervisorGroups).map(group => ({
        ...group,
        counsellors: group.counsellors.sort((a, b) => {
          if (a.group_by === 'Unassigned') return 1;
          if (b.group_by === 'Unassigned') return -1;
          return a.group_by.localeCompare(b.group_by);
        })
      })).sort((a, b) => {
        if (a.supervisorName === 'No Supervisor') return 1;
        if (b.supervisorName === 'No Supervisor') return -1;
        return a.supervisorName.localeCompare(b.supervisorName);
      });
    }

    const response = {
      success: true,
      data: [...grouped, overall],
      groupedBySupervisor,
      totalRecords: grouped.length,
      sortBy: sortBy || (type === 'created_at' ? 'date' : 'name'),
      sortOrder: finalSortOrder,
    };

    if (counsellor_status) {
      response.counsellor_status_filter = counsellor_status;
    }

    if (isAnalyser) {
      response.analyser_filters_applied = analyserFilters;

      const filterDescriptions = [];
      if (analyserFilters.sources && analyserFilters.sources.length > 0) {
        filterDescriptions.push(`Sources: ${analyserFilters.sources.join(', ')}`);
      }
      if (analyserFilters.campaigns && analyserFilters.campaigns.length > 0) {
        filterDescriptions.push(`Campaigns: ${analyserFilters.campaigns.join(', ')}`);
      }
      if (analyserFilters.source_urls && analyserFilters.source_urls.length > 0) {
        filterDescriptions.push(`Source URLs: ${analyserFilters.source_urls.join(', ')}`);
      }
      if (analyserFilters.student_creation_date) {
        filterDescriptions.push(`Date Filter: ${analyserFilters.student_creation_date.replace(/_/g, ' ')}`);
      }

      response.note = `Analyser filters applied: ${filterDescriptions.join(' | ')}`;

      if (source || utm_campaign || created_at_start || created_at_end) {
        response.user_filters_note = 'User-provided filters were overridden by analyser-specific filters';
      }
    }

    if (type === 'agent') {
      response.note = response.note ? response.note + ' | ' : '';
      response.note += 'Includes all counsellors (including those with zero leads)';

      if (counsellor_status) {
        response.note += ` | Filtered by status: ${counsellor_status}`;
      }
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error in getThreeRecordsOfFormFilled:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};

export const getNotInterestedAfterCounselingReport = async (req, res) => {
  try {
    const { created_at_start, created_at_end } = req.query;
    const userRole = req.user?.role;
    const isAnalyser = userRole === 'Analyser';

    // Helper for date range SQL conditions
    const buildDateRangeSQL = (column, start, end) => {
      const conditions = [];

      if (start) {
        const startUTC = new Date(`${start}T00:00:00+05:30`).toISOString();
        conditions.push(`${column} >= '${startUTC}'`);
      }

      if (end) {
        const endDate = new Date(`${end}T23:59:59+05:30`);
        const endUTC = endDate.toISOString();
        conditions.push(`${column} <= '${endUTC}'`);
      }

      return conditions.length > 0 ? conditions.join(' AND ') : '';
    };

    // Build WHERE conditions array
    const buildWhereConditions = () => {
      const conditions = [];

      // Force Facebook source filter for analysers
      if (isAnalyser) {
        conditions.push(`s.source = 'FaceBook'`);
      }

      // Add date range condition if specified
      const dateCondition = buildDateRangeSQL("s.created_at", created_at_start, created_at_end);
      if (dateCondition) {
        conditions.push(dateCondition);
      }

      return conditions;
    };

    const whereConditions = buildWhereConditions();
    const whereSQL = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Main query to get NotInterested counts with the 3 conditions
    const buildMainQuery = () => {
      return `
        -- First, identify students meeting ANY of the 3 conditions
        WITH eligible_students AS (
          SELECT student_id
          FROM student_remarks sr
          WHERE NOT EXISTS (
            -- Exclude students who ever had ICC/Application/Admission
            SELECT 1 
            FROM student_remarks ex 
            WHERE ex.student_id = sr.student_id
              AND (
                ex.lead_sub_status = 'Initial Counseling Completed'
                OR ex.lead_status IN ('Application', 'Admission')
              )
          )
          GROUP BY student_id
          HAVING (
            -- Condition A: Only 1 remark and it's NotInterested
            (COUNT(*) = 1 AND BOOL_AND(lead_status = 'NotInterested'))
            OR
            -- Condition B: Multiple remarks, latest is NI, no ICC/App/Adm in earlier
            (
              COUNT(*) > 1
              AND MAX(created_at) FILTER (
                WHERE lead_status = 'NotInterested'
              ) = MAX(created_at)
              AND NOT BOOL_OR(
                lead_status IN ('Admission', 'Application')
                OR lead_sub_status = 'Initial Counseling Completed'
              )
            )
            OR
            -- Condition C: All remarks are NotInterested
            (COUNT(*) > 1 AND BOOL_AND(lead_status = 'NotInterested'))
          )
        ),
        
        -- Get the latest remark for each eligible student
        latest_remarks AS (
          SELECT DISTINCT ON (sr.student_id)
            sr.student_id,
            sr.counsellor_id,
            sr.lead_status,
            sr.lead_sub_status,
            sr.created_at as latest_ni_date
          FROM student_remarks sr
          INNER JOIN eligible_students es ON sr.student_id = es.student_id
          WHERE sr.lead_status = 'NotInterested'
          ORDER BY sr.student_id, sr.created_at DESC
        ),
        
        -- Get student info with counsellor assignment
        student_info AS (
          SELECT 
            s.student_id,
            -- Get counsellor (priority: assigned > last remark)
            COALESCE(
              assigned_counsellor.counsellor_name,
              c.counsellor_name,
              'Unassigned'
            ) as final_counsellor_name,
            COALESCE(
              assigned_counsellor.assigned_to,
              c.assigned_to
            ) as supervisor_id,
            s.created_at as student_created_at
          FROM students s
          INNER JOIN latest_remarks lr ON s.student_id = lr.student_id
          LEFT JOIN counsellors c ON lr.counsellor_id = c.counsellor_id
          LEFT JOIN counsellors assigned_counsellor ON s.assigned_counsellor_id = assigned_counsellor.counsellor_id
          ${whereSQL}
        )
        
        -- FINAL QUERY: Count per counsellor
        SELECT 
          si.final_counsellor_name as counsellor_name,
          COALESCE(
            (SELECT counsellor_name FROM counsellors WHERE counsellor_id = si.supervisor_id),
            'No Supervisor'
          ) as supervisor_name,
          COUNT(DISTINCT si.student_id) as ni_count
        FROM student_info si
        GROUP BY si.final_counsellor_name, si.supervisor_id
        ORDER BY ni_count DESC, counsellor_name
      `;
    };

    // Query to get all counsellors (CORRECTED - removed WHERE c.is_active = true)
    const getAllCounsellorsQuery = () => {
      return `
        SELECT 
          c.counsellor_id,
          c.counsellor_name,
          c.assigned_to,
          sup.counsellor_name as supervisor_name
        FROM counsellors c
        LEFT JOIN counsellors sup ON c.assigned_to = sup.counsellor_id
        ORDER BY c.counsellor_name
      `;
    };

    console.log('NI Report Query:', buildMainQuery());

    // Execute queries in parallel for better performance
    const [counsellorRows, allCounsellors] = await Promise.all([
      sequelize.query(buildMainQuery(), { type: sequelize.QueryTypes.SELECT }),
      sequelize.query(getAllCounsellorsQuery(), { type: sequelize.QueryTypes.SELECT })
    ]);

    // Process results
    const processResults = () => {
      // Create map of existing NI counts
      const niCountMap = {};
      counsellorRows.forEach(row => {
        if (row.counsellor_name && row.counsellor_name !== 'Unassigned') {
          niCountMap[row.counsellor_name] = {
            ni_count: Number(row.ni_count) || 0,
            supervisor_name: row.supervisor_name || 'No Supervisor'
          };
        }
      });

      // Build result rows with all counsellors
      const resultRows = allCounsellors.map(counsellor => ({
        counsellor_name: counsellor.counsellor_name,
        supervisor_name: counsellor.supervisor_name || 'No Supervisor',
        ni_count: niCountMap[counsellor.counsellor_name]?.ni_count || 0
      }));

      // Add "Unassigned" if exists
      const unassignedRow = counsellorRows.find(row => row.counsellor_name === 'Unassigned');
      if (unassignedRow) {
        resultRows.push({
          counsellor_name: 'Unassigned',
          supervisor_name: unassignedRow.supervisor_name || 'No Supervisor',
          ni_count: Number(unassignedRow.ni_count) || 0
        });
      }

      return resultRows;
    };

    const resultRows = processResults();

    // Group by supervisor
    const groupBySupervisor = (rows) => {
      const grouped = {};

      rows.forEach(row => {
        const supervisorName = row.supervisor_name || 'No Supervisor';

        if (!grouped[supervisorName]) {
          grouped[supervisorName] = {
            supervisorName,
            total_ni: 0,
            counsellors: []
          };
        }

        grouped[supervisorName].counsellors.push(row);
        grouped[supervisorName].total_ni += row.ni_count || 0;
      });

      // Convert to array and sort
      return Object.values(grouped).sort((a, b) => {
        // Put 'No Supervisor' at the bottom
        if (a.supervisorName === 'No Supervisor') return 1;
        if (b.supervisorName === 'No Supervisor') return -1;
        return b.total_ni - a.total_ni;
      });
    };

    // Calculate totals
    const calculateTotals = (rows) => ({
      totalRecords: rows.length,
      total_ni_count: rows.reduce((sum, row) => sum + (row.ni_count || 0), 0)
    });

    // Sort results
    const sortResults = (rows) => {
      return rows.sort((a, b) => {
        // Put 'Unassigned' at the end
        if (a.counsellor_name === 'Unassigned') return 1;
        if (b.counsellor_name === 'Unassigned') return -1;
        return (b.ni_count || 0) - (a.ni_count || 0);
      });
    };

    const sortedRows = sortResults(resultRows);
    const supervisorArray = groupBySupervisor(sortedRows);
    const totals = calculateTotals(sortedRows);

    // Build response
    const buildResponse = () => {
      const response = {
        success: true,
        data: sortedRows,
        groupedBySupervisor: supervisorArray,
        totalRecords: totals.totalRecords,
        total_ni_count: totals.total_ni_count,
        filters_applied: {
          date_range: created_at_start || created_at_end
            ? `${created_at_start || 'Start'} to ${created_at_end || 'End'}`
            : 'All dates',
          source_filter: isAnalyser ? 'Facebook only' : 'All sources',
          criteria: 'Students meeting any of 3 conditions: A) Single NI remark, B) Multiple remarks with latest NI and no ICC/App/Adm, C) All remarks are NI'
        }
      };

      if (isAnalyser) {
        response.note = 'Data includes only Facebook leads';
      }

      return response;
    };

    res.status(200).json(buildResponse());

  } catch (error) {
    console.error('Error in getNotInterestedAfterCounselingReport:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
export const getThreeRecordsOfFormFilledDownload = async (req, res) => {
  try {
    const {
      type,
      source,
      utm_campaign,
      created_at_start,
      created_at_end,
      counsellor_id,
      sortBy,
      sortOrder,
      showDetailedColumns
    } = req.query;

    const userRole = req.user?.role;
    const userId = req.user?.id;
    const isAnalyser = userRole === 'Analyser';

    console.log('DOWNLOAD - req.user:', req.user);
    console.log('DOWNLOAD - req.user?.role:', req.user?.role);

    // Fetch analyser-specific filters if user is analyser
    let analyserFilters = {};
    if (isAnalyser && userId) {
      try {
        const analyser = await Analyser.findByPk(userId, {
          attributes: ['sources', 'campaigns', 'student_creation_date', 'source_urls']
        });

        if (analyser) {
          analyserFilters = {
            sources: analyser.sources || [],
            campaigns: analyser.campaigns || [],
            student_creation_date: analyser.student_creation_date || '',
            source_urls: analyser.source_urls || []
          };
          console.log('DOWNLOAD - Analyser filters:', analyserFilters);
        }
      } catch (error) {
        console.error('DOWNLOAD - Error fetching analyser data:', error);
      }
    }

    const utm_array = utm_campaign && utm_campaign.split(',');
    const counsellor_array = counsellor_id && counsellor_id.split(',');
    const source_array = source && source.split(',');

    if (!['agent', 'source', 'campaign', 'created_at', 'source_url'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type. Use agent, source, campaign, created_at, or source_url' });
    }

    // Helper for date range SQL conditions
    const dateRangeSQL = (col, start, end) => {
      if (start && end) {
        const startUTC = new Date(`${start}T00:00:00+05:30`).toISOString();
        const endDate = new Date(`${end}T23:59:59+05:30`);
        const endUTC = endDate.toISOString();
        return `${col} >= '${startUTC}' AND ${col} <= '${endUTC}'`;
      }
      if (start) {
        const startUTC = new Date(`${start}T00:00:00+05:30`).toISOString();
        return `${col} >= '${startUTC}'`;
      }
      if (end) {
        const endDate = new Date(`${end}T23:59:59+05:30`);
        const endUTC = endDate.toISOString();
        return `${col} <= '${endUTC}'`;
      }
      return '';
    };

    // FIXED: Function to apply analyser date filter with correct IST to UTC conversion
    const applyAnalyserDateFilter = () => {
      if (!isAnalyser || !analyserFilters.student_creation_date) return '';

      const now = new Date();
      const todayIST = new Date(now.getTime() + (5.5 * 60 * 60 * 1000)); // Convert to IST
      const todayISTDate = todayIST.toISOString().split('T')[0]; // Get IST date in YYYY-MM-DD

      // Helper to convert IST date to UTC start timestamp
      const istDateToUTCStart = (istDateString) => {
        const [year, month, day] = istDateString.split('-');
        return `${year}-${month}-${day} 18:30:00+00`;
      };

      // Helper to convert IST date to UTC end timestamp
      const istDateToUTCEnd = (istDateString) => {
        const [year, month, day] = istDateString.split('-');
        const date = new Date(Date.UTC(year, month - 1, parseInt(day) + 1));
        const nextDay = date.toISOString().split('T')[0];
        return `${nextDay} 18:30:00+00`;
      };

      switch (analyserFilters.student_creation_date) {
        case 'today': {
          const startUTC = istDateToUTCStart(todayISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'yesterday': {
          const yesterday = new Date(todayIST);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayISTDate = yesterday.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(yesterdayISTDate);
          const endUTC = istDateToUTCEnd(yesterdayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'last_7_days': {
          const sevenDaysAgo = new Date(todayIST);
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const sevenDaysAgoISTDate = sevenDaysAgo.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(sevenDaysAgoISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'last_30_days': {
          const thirtyDaysAgo = new Date(todayIST);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const thirtyDaysAgoISTDate = thirtyDaysAgo.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(thirtyDaysAgoISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'this_month': {
          const firstDayOfMonth = new Date(todayIST.getFullYear(), todayIST.getMonth(), 1);
          const firstDayISTDate = firstDayOfMonth.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(firstDayISTDate);
          const endUTC = istDateToUTCEnd(todayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        case 'last_month': {
          const firstDayOfLastMonth = new Date(todayIST.getFullYear(), todayIST.getMonth() - 1, 1);
          const lastDayOfLastMonth = new Date(todayIST.getFullYear(), todayIST.getMonth(), 0);
          const firstDayISTDate = firstDayOfLastMonth.toISOString().split('T')[0];
          const lastDayISTDate = lastDayOfLastMonth.toISOString().split('T')[0];
          const startUTC = istDateToUTCStart(firstDayISTDate);
          const endUTC = istDateToUTCEnd(lastDayISTDate);
          return `s.created_at >= '${startUTC}' AND s.created_at < '${endUTC}'`;
        }
        default:
          return '';
      }
    };

    let whereConds = [];
    let studentWhereConds = [];
    let analyserCTEConditions = '';

    // Apply analyser filters if analyser role
    if (isAnalyser) {
      // Apply source filters from analyser
      if (analyserFilters.sources && analyserFilters.sources.length > 0) {
        const sourceCondition = `s.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
        whereConds.push(sourceCondition);
        studentWhereConds.push(sourceCondition);
        analyserCTEConditions = `INNER JOIN students s_fb ON sla.student_id = s_fb.student_id AND (s_fb.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}'))`;
      }

      // Apply campaign filters from analyser
      if (analyserFilters.campaigns && analyserFilters.campaigns.length > 0) {
        whereConds.push(`first_la.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}')`);
        analyserCTEConditions += analyserCTEConditions ?
          ` AND (first_la.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR first_la.utm_campaign IS NULL)` :
          `INNER JOIN students s_fb ON sla.student_id = s_fb.student_id AND (first_la.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR first_la.utm_campaign IS NULL)`;
      }

      // Apply source_url filters from analyser
      if (analyserFilters.source_urls && analyserFilters.source_urls.length > 0) {
        const sourceUrlCondition = `(s.first_source_url IN ('${analyserFilters.source_urls.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR s.first_source_url IS NULL)`;
        whereConds.push(sourceUrlCondition);
        studentWhereConds.push(sourceUrlCondition);
      }

      // Apply date filter from analyser
      const analyserDateFilter = applyAnalyserDateFilter();
      if (analyserDateFilter) {
        whereConds.push(analyserDateFilter);
        studentWhereConds.push(analyserDateFilter);
      }
    } else if (source) {
      // Normal user source filter
      const sourceCondition = `s.source IN ('${source_array.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
      whereConds.push(sourceCondition);
      studentWhereConds.push(sourceCondition);
    }

    // Apply regular date filters (will be overridden by analyser date filter if both exist)
    if ((created_at_start || created_at_end) && !(isAnalyser && analyserFilters.student_creation_date)) {
      const dateCondition = dateRangeSQL("s.created_at", created_at_start, created_at_end);
      whereConds.push(dateCondition);
      studentWhereConds.push(dateCondition);
    }

    const wrapArrayForSQL = (arr) => `('${arr.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;

    // Apply utm_campaign filter (if not already applied by analyser)
    if (utm_campaign && !(isAnalyser && analyserFilters.campaigns && analyserFilters.campaigns.length > 0)) {
      whereConds.push(`first_la.utm_campaign IN ${wrapArrayForSQL(utm_array)}`);
    }

    if (counsellor_id) {
      whereConds.push(`(c.counsellor_id IN ${wrapArrayForSQL(counsellor_array)} OR s.assigned_counsellor_id IN ${wrapArrayForSQL(counsellor_array)})`);
    }

    const whereSQL = whereConds.length ? `WHERE ${whereConds.join(' AND ')}` : '';

    let groupByField;
    let groupByClause;
    let supervisorSelect;
    let counsellorJoin = '';

    if (type === 'agent') {
      groupByField = `
  CASE 
    WHEN assigned_counsellor.counsellor_name IS NOT NULL AND assigned_counsellor.counsellor_name != '' 
      THEN assigned_counsellor.counsellor_name
    WHEN c.counsellor_name IS NOT NULL AND c.counsellor_name != '' 
      THEN c.counsellor_name
    ELSE 'Unassigned'
  END
`;

      supervisorSelect = `
  MAX(
    CASE 
      WHEN assigned_counsellor.assigned_to IS NOT NULL AND assigned_counsellor.assigned_to != '' 
        THEN (SELECT counsellor_name FROM counsellors WHERE counsellor_id = assigned_counsellor.assigned_to)
      WHEN c.assigned_to IS NOT NULL AND c.assigned_to != '' 
        THEN (SELECT counsellor_name FROM counsellors WHERE counsellor_id = c.assigned_to)
      ELSE 'No Supervisor'
    END
  ) AS supervisor_name
`;

      groupByClause = `
  COALESCE(assigned_counsellor.counsellor_id, c.counsellor_id),
  ${groupByField}
`;

      counsellorJoin = `
        LEFT JOIN counsellors assigned_counsellor ON s.assigned_counsellor_id = assigned_counsellor.counsellor_id
      `;
    } else if (type === 'source') {
      groupByField = `COALESCE(NULLIF(s.source, ''), 'NA')`;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    } else if (type === 'campaign') {
      groupByField = `COALESCE(NULLIF(first_la.utm_campaign, ''), 'NA')`;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    } else if (type === 'created_at') {
      // FIXED: Use DATE(created_at AT TIME ZONE 'Asia/Kolkata') for correct IST grouping
      groupByField = `DATE(s.created_at AT TIME ZONE 'Asia/Kolkata')`;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    } else if (type === 'source_url') {
      // Group by base URL (before query parameters)
      groupByField = `
        CASE 
          WHEN s.first_source_url IS NULL OR TRIM(s.first_source_url) = '' THEN 'NA'
          ELSE TRIM(SPLIT_PART(s.first_source_url, '?', 1))
        END
      `;
      supervisorSelect = `'NA' AS supervisor_name`;
      groupByClause = `${groupByField}`;
    }

    // Build CTE conditions based on analyser filters
    const buildCTECondition = (tableAlias) => {
      if (!isAnalyser || !analyserFilters.sources || analyserFilters.sources.length === 0) {
        return '';
      }
      return `INNER JOIN students s_fb ON ${tableAlias}.student_id = s_fb.student_id AND s_fb.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
    };

    const firstLaCTE = `
      SELECT DISTINCT ON (sla.student_id)
        sla.student_id,
        sla.utm_campaign,
        sla.created_at
      FROM student_lead_activities sla
      ${buildCTECondition('sla')}
      ${analyserFilters.campaigns && analyserFilters.campaigns.length > 0 ?
        `WHERE (sla.utm_campaign IN ('${analyserFilters.campaigns.map(v => v.trim().replace(/'/g, "''")).join("','")}') OR sla.utm_campaign IS NULL)` : ''}
      ORDER BY sla.student_id, sla.created_at ASC, sla.id ASC
    `;

    const lastRemarkCTE = `
      SELECT DISTINCT ON (sr.student_id) 
        sr.student_id,
        sr.counsellor_id,
        sr.lead_status,
        sr.remark_id
      FROM student_remarks sr
      ${buildCTECondition('sr')}
      ORDER BY sr.student_id, sr.created_at DESC, sr.remark_id DESC
    `;

    const connectedRemarksCountCTE = `
      SELECT 
        sr.student_id,
        COUNT(*) as connected_remarks_count
      FROM student_remarks sr
      ${buildCTECondition('sr')}
      WHERE LOWER(TRIM(sr.calling_status)) = 'connected'
      GROUP BY sr.student_id
    `;

    const studentRemarkCountCTE = `
      SELECT 
        sr.student_id,
        COUNT(*) as total_remarks_count
      FROM student_remarks sr
      ${buildCTECondition('sr')}
      GROUP BY sr.student_id
    `;

    // NEW CTE for PreNI calculation (Not Interested after counseling)
    const preNICTE = `
      WITH eligible_students AS (
        SELECT student_id
        FROM student_remarks sr
        WHERE NOT EXISTS (
          -- Exclude students who ever had ICC/Application/Admission
          SELECT 1 
          FROM student_remarks ex 
          WHERE ex.student_id = sr.student_id
            AND (
              ex.lead_sub_status = 'Initial Counseling Completed'
              OR ex.lead_status IN ('Application', 'Admission')
            )
        )
        GROUP BY student_id
        HAVING (
          -- Condition A: Only 1 remark and it's NotInterested
          (COUNT(*) = 1 AND BOOL_AND(lead_status = 'NotInterested'))
          OR
          -- Condition B: Multiple remarks, latest is NI, no ICC/App/Adm in earlier
          (
            COUNT(*) > 1
            AND MAX(created_at) FILTER (
              WHERE lead_status = 'NotInterested'
            ) = MAX(created_at)
            AND NOT BOOL_OR(
              lead_status IN ('Admission', 'Application')
              OR lead_sub_status = 'Initial Counseling Completed'
            )
          )
          OR
          -- Condition C: All remarks are NotInterested
          (COUNT(*) > 1 AND BOOL_AND(lead_status = 'NotInterested'))
        )
      )
      SELECT student_id FROM eligible_students
    `;

    let sortColumn;
    if (sortBy) {
      const sortMap = {
        'admission': 'admission_count',
        'formfilled': 'formFilled',
        'leads': 'lead_count',
        'connected': 'connectedAnytime',
        'icc': 'icc',
        'active': 'active_cases',
        'name': 'group_by',
        'supervisor': 'supervisor_name',
        'preni': 'pre_ni_count',
        'prenipercent': 'pre_ni_percent'
      };

      sortColumn = sortMap[sortBy.toLowerCase()] || 'admission_count';
    } else {
      if (type === 'created_at') {
        sortColumn = 'group_by';
      } else if (type === 'agent' && sortBy === 'supervisor') {
        sortColumn = 'supervisor_name';
      } else {
        sortColumn = 'group_by';
      }
    }

    const defaultSortOrder = (type === 'created_at') ? 'DESC' : 'ASC';
    const finalSortOrder = sortOrder || defaultSortOrder;

    // MAIN QUERY - UPDATED WITH PreNI
    const mainQuery = `
      WITH first_la AS (${firstLaCTE}),
           last_remark AS (${lastRemarkCTE}),
           connected_remarks_count AS (${connectedRemarksCountCTE}),
           student_remark_count AS (${studentRemarkCountCTE}),
           pre_ni_students AS (${preNICTE})
           
      SELECT
        ${groupByField} AS group_by,
        ${supervisorSelect},
        
        COUNT(DISTINCT s.student_id) AS lead_count,
        
        COUNT(DISTINCT CASE 
          WHEN src.total_remarks_count IS NULL OR src.total_remarks_count = 0
          THEN s.student_id 
        END) AS freshCount,

        -- NEW: Pre NI COUNT (Not Interested after counseling)
        COUNT(DISTINCT CASE 
          WHEN pns.student_id IS NOT NULL
          THEN s.student_id 
        END) AS pre_ni_count,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'Pre Application'
          THEN s.student_id 
        END) AS pre_application_count,

        COUNT(DISTINCT CASE 
          WHEN (src.total_remarks_count IS NULL OR src.total_remarks_count = 0) 
             OR lr.lead_status = 'Pre Application'
          THEN s.student_id 
        END) AS active_cases,

        COUNT(DISTINCT CASE 
          WHEN src.total_remarks_count > 0
          THEN s.student_id 
        END) AS attempted,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status IN ('Application', 'Admission')
          THEN s.student_id 
        END) AS formFilled,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'Admission'
          THEN s.student_id 
        END) AS admission_count,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'Enrolled'
          THEN s.student_id 
        END) AS enrolled,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'NotInterested'
          THEN s.student_id 
        END) AS ni,

        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM student_remarks sr2
          ${buildCTECondition('sr2')}
          WHERE sr2.student_id = s.student_id 
          AND LOWER(TRIM(sr2.calling_status)) = 'connected'
        ) THEN s.student_id END) as connectedAnytime,

        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM student_remarks sr2
          ${buildCTECondition('sr2')}
          WHERE sr2.student_id = s.student_id 
          AND sr2.lead_sub_status = 'Initial Counseling Completed'
        ) THEN s.student_id END) as icc,

        COUNT(DISTINCT CASE 
          WHEN (src.total_remarks_count IS NULL OR src.total_remarks_count = 0)
             OR (lr.lead_status = 'Pre Application' AND (crc.connected_remarks_count IS NULL OR crc.connected_remarks_count < 4))
          THEN s.student_id 
        END) AS under_3_remarks,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'Pre Application'
            AND crc.connected_remarks_count BETWEEN 4 AND 7
          THEN s.student_id 
        END) AS remarks_4_7,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'Pre Application'
            AND crc.connected_remarks_count BETWEEN 8 AND 10
          THEN s.student_id 
        END) AS remarks_8_10,

        COUNT(DISTINCT CASE 
          WHEN lr.lead_status = 'Pre Application'
            AND crc.connected_remarks_count > 10
          THEN s.student_id 
        END) AS remarks_gt_10

      FROM students s
      LEFT JOIN last_remark lr ON s.student_id = lr.student_id
      LEFT JOIN first_la ON s.student_id = first_la.student_id
      LEFT JOIN connected_remarks_count crc ON s.student_id = crc.student_id
      LEFT JOIN student_remark_count src ON s.student_id = src.student_id
      LEFT JOIN pre_ni_students pns ON s.student_id = pns.student_id
      LEFT JOIN counsellors c ON lr.counsellor_id = c.counsellor_id
      ${counsellorJoin}
      ${whereSQL}
      GROUP BY ${groupByClause}
      ORDER BY ${sortColumn} ${finalSortOrder}
    `;

    console.log('Executing DOWNLOAD query:', mainQuery);

    const groupedRows = await sequelize.query(mainQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    // If type is 'agent', get ALL counsellors from database and merge with results
    if (type === 'agent') {
      // Get all counsellors from database
      const allCounsellorsQuery = `
        SELECT 
          counsellor_id,
          counsellor_name,
          assigned_to,
          (SELECT counsellor_name FROM counsellors c2 WHERE c2.counsellor_id = c1.assigned_to) as supervisor_name
        FROM counsellors c1
        ORDER BY counsellor_name
      `;

      const allCounsellors = await sequelize.query(allCounsellorsQuery, {
        type: sequelize.QueryTypes.SELECT,
      });

      // Create a map of existing counsellor results (by counsellor_name)
      const existingResultsMap = {};
      groupedRows.forEach(row => {
        if (row.group_by && row.group_by !== 'Unassigned') {
          existingResultsMap[row.group_by] = row;
        }
      });

      // Prepare a map of existing results by counsellor_id for supervisor matching
      const existingByCounsellorId = {};
      groupedRows.forEach(row => {
        // Try to find counsellor_id from the row (if available)
        if (row.counsellor_id) {
          existingByCounsellorId[row.counsellor_id] = row;
        }
      });

      // Merge all counsellors with existing results
      const mergedRows = allCounsellors.map(counsellor => {
        const counsellorName = counsellor.counsellor_name;
        const existingRow = existingResultsMap[counsellorName] || existingByCounsellorId[counsellor.counsellor_id];

        if (existingRow) {
          return {
            ...existingRow,
            counsellor_id: counsellor.counsellor_id,
            supervisor_name: counsellor.supervisor_name || existingRow.supervisor_name || 'No Supervisor'
          };
        } else {
          // Create zero-result entry for counsellor
          return {
            group_by: counsellorName,
            supervisor_name: counsellor.supervisor_name || 'No Supervisor',
            counsellor_id: counsellor.counsellor_id,
            lead_count: 0,
            freshCount: 0,
            pre_ni_count: 0,
            pre_application_count: 0,
            active_cases: 0,
            attempted: 0,
            formFilled: 0,
            admission_count: 0,
            enrolled: 0,
            ni: 0,
            connectedAnytime: 0,
            icc: 0,
            under_3_remarks: 0,
            remarks_4_7: 0,
            remarks_8_10: 0,
            remarks_gt_10: 0
          };
        }
      });

      // Add 'Unassigned' entry if it exists in original results
      const unassignedRow = groupedRows.find(row => row.group_by === 'Unassigned');
      if (unassignedRow) {
        mergedRows.push(unassignedRow);
      }

      // Replace groupedRows with mergedRows
      groupedRows.length = 0;
      groupedRows.push(...mergedRows);
    }

    // Build conditions for unassigned students query
    const buildUnassignedCTECondition = (tableAlias) => {
      if (!isAnalyser || !analyserFilters.sources || analyserFilters.sources.length === 0) {
        return '';
      }
      return `INNER JOIN students s_fb ON ${tableAlias}.student_id = s_fb.student_id AND s_fb.source IN ('${analyserFilters.sources.map(v => v.trim().replace(/'/g, "''")).join("','")}')`;
    };

    const unassignedStudentsQuery = `
      WITH student_remark_count AS (
        SELECT 
          sr.student_id,
          COUNT(*) as total_remarks_count
        FROM student_remarks sr
        ${buildUnassignedCTECondition('sr')}
        GROUP BY sr.student_id
      )
      SELECT 
        s.student_id,
        s.created_at,
        s.source,
        s.first_source_url,
        s.assigned_counsellor_id,
        c.counsellor_name as remark_counsellor,
        assigned_counsellor.counsellor_name as assigned_counsellor_name
      FROM students s
      LEFT JOIN student_remark_count src ON s.student_id = src.student_id
      LEFT JOIN student_remarks sr ON s.student_id = sr.student_id
      LEFT JOIN counsellors c ON sr.counsellor_id = c.counsellor_id
      LEFT JOIN counsellors assigned_counsellor ON s.assigned_counsellor_id = assigned_counsellor.counsellor_id
      WHERE (src.total_remarks_count IS NULL OR src.total_remarks_count = 0)
        AND (s.assigned_counsellor_id IS NULL OR s.assigned_counsellor_id = '')
        AND (c.counsellor_id IS NULL)
        ${studentWhereConds.length > 0 ? 'AND ' + studentWhereConds.join(' AND ') : ''}
      ORDER BY s.created_at DESC
    `;

    const unassignedStudents = await sequelize.query(unassignedStudentsQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    if (unassignedStudents.length > 0) {
      console.log(`📊 Truly Unassigned Students: ${unassignedStudents.length} students with NO counsellor in ANY field`);
      console.log('Unassigned Student IDs:');
      unassignedStudents.forEach((student, index) => {
        console.log(`${index + 1}. ${student.student_id} - Created: ${student.created_at} - Source: ${student.source} - Source URL: ${student.first_source_url || 'N/A'}`);
      });
    } else {
      console.log('📊 No truly unassigned students found');
    }

    const getValue = (row, prop) => {
      const lowerProp = prop.toLowerCase();
      for (const key in row) {
        if (key.toLowerCase() === lowerProp) {
          return Number(row[key]) || 0;
        }
      }
      return 0;
    };

    const formatRow = (row) => {
      const lead_count = getValue(row, 'lead_count');
      const ni = getValue(row, 'ni');
      const enrolled = getValue(row, 'enrolled');
      const admission_count = getValue(row, 'admission_count');
      const pre_ni_count = getValue(row, 'pre_ni_count');

      const freshCount = getValue(row, 'freshCount');
      const pre_application_count = getValue(row, 'pre_application_count');
      const active_cases = getValue(row, 'active_cases');
      const formFilled = getValue(row, 'formFilled');
      const connectedAnytime = getValue(row, 'connectedAnytime');
      const icc = getValue(row, 'icc');
      const attempted = getValue(row, 'attempted');

      const under_3_remarks = getValue(row, 'under_3_remarks');
      const remarks_4_7 = getValue(row, 'remarks_4_7');
      const remarks_8_10 = getValue(row, 'remarks_8_10');
      const remarks_gt_10 = getValue(row, 'remarks_gt_10');
      if (showDetailedColumns == "false") {
        return {
          group_by: row.group_by,
          supervisor_name: row.supervisor_name || 'No Supervisor',
          Leads: lead_count,
          connectedAnytime,
          icc,
          formfilled: formFilled,
          admission: admission_count,
          preNI: pre_ni_count,
          connectedAnytimePercent: lead_count > 0 ? Number(((connectedAnytime / lead_count) * 100).toFixed(1)) + "%" : 0,
          iccPercent: lead_count > 0 ? Number(((icc / lead_count) * 100).toFixed(1)) + "%" : 0,
          leadToForm: attempted > 0 ? Number(((formFilled / attempted) * 100).toFixed(1)) + "%" : 0,
          formToAdmission: formFilled > 0 ? Number(((admission_count / formFilled) * 100).toFixed(1)) + "%" : 0,
          leadToAdmission: attempted > 0 ? Number(((admission_count / attempted) * 100).toFixed(1)) + "%" : 0,
          preNIPercent: lead_count > 0 ? Number(((pre_ni_count / lead_count) * 100).toFixed(1)) + "%" : 0,

        };
      } else {
        return {
          group_by: row.group_by,
          supervisor_name: row.supervisor_name || 'No Supervisor',
          Leads: lead_count,
          active_cases: active_cases,
          ni,
          under_3_remarks,
          remarks_4_7,
          remarks_8_10,
          remarks_gt_10,
          application: formFilled,
          enrolled,
          preNI: pre_ni_count,
          preNIPercent: lead_count > 0 ? Number(((pre_ni_count / lead_count) * 100).toFixed(1)) + "%" : 0,

        }
      }
    };

    const calculateOverall = (rawRows) => {
      const overall = {
        group_by: 'Total',
        supervisor_name: 'All Supervisors',
        lead_count: 0,
        freshCount: 0,
        pre_ni_count: 0,
        pre_application_count: 0,
        attempted: 0,
        formFilled: 0,
        admission_count: 0,
        enrolled: 0,
        ni: 0,
        connectedAnytime: 0,
        icc: 0,
        active_cases: 0,
        under_3_remarks: 0,
        remarks_4_7: 0,
        remarks_8_10: 0,
        remarks_gt_10: 0
      };

      rawRows.forEach(row => {
        overall.lead_count += getValue(row, 'lead_count');
        overall.freshCount += getValue(row, 'freshCount');
        overall.pre_ni_count += getValue(row, 'pre_ni_count');
        overall.pre_application_count += getValue(row, 'pre_application_count');
        overall.attempted += getValue(row, 'attempted');
        overall.formFilled += getValue(row, 'formFilled');
        overall.admission_count += getValue(row, 'admission_count');
        overall.enrolled += getValue(row, 'enrolled');
        overall.ni += getValue(row, 'ni');
        overall.connectedAnytime += getValue(row, 'connectedAnytime');
        overall.icc += getValue(row, 'icc');
        overall.active_cases += getValue(row, 'active_cases');
        overall.under_3_remarks += getValue(row, 'under_3_remarks');
        overall.remarks_4_7 += getValue(row, 'remarks_4_7');
        overall.remarks_8_10 += getValue(row, 'remarks_8_10');
        overall.remarks_gt_10 += getValue(row, 'remarks_gt_10');
      });

      return overall;
    };

    const grouped = groupedRows.map(formatRow);
    const overallRaw = calculateOverall(groupedRows);
    const overall = formatRow(overallRaw);

    let groupedBySupervisor = null;
    if (type === 'agent') {
      const supervisorGroups = {};

      grouped.forEach(row => {
        const supervisorName = row.supervisor_name || 'No Supervisor';

        if (!supervisorGroups[supervisorName]) {
          supervisorGroups[supervisorName] = {
            supervisorName,
            lead_count: 0,
            freshCount: 0,
            preNI: 0,
            attempted: 0,
            formFilled: 0,
            admission_count: 0,
            connectedAnytime: 0,
            icc: 0,
            active_cases: 0,
            counsellors: []
          };
        }

        supervisorGroups[supervisorName].counsellors.push(row);
        supervisorGroups[supervisorName].lead_count += row.lead_count;
        supervisorGroups[supervisorName].freshCount += row.freshCount;
        supervisorGroups[supervisorName].preNI += row.preNI || 0;
        supervisorGroups[supervisorName].attempted += row.attempted;
        supervisorGroups[supervisorName].formFilled += row.formFilled;
        supervisorGroups[supervisorName].admission_count += row.admission_count;
        supervisorGroups[supervisorName].connectedAnytime += row.connectedAnytime;
        supervisorGroups[supervisorName].icc += row.icc;
        supervisorGroups[supervisorName].active_cases += row.active_cases;
      });

      // Calculate percentages for supervisor groups
      Object.values(supervisorGroups).forEach(supervisorGroup => {
        const lead_count = supervisorGroup.lead_count;
        supervisorGroup.connectedAnytimePercent = lead_count > 0 ? Number(((supervisorGroup.connectedAnytime / lead_count) * 100).toFixed(1)) : 0;
        supervisorGroup.iccPercent = lead_count > 0 ? Number(((supervisorGroup.icc / lead_count) * 100).toFixed(1)) : 0;
        supervisorGroup.preNIPercent = lead_count > 0 ? Number(((supervisorGroup.preNI / lead_count) * 100).toFixed(1)) : 0;
        supervisorGroup.leadToForm = supervisorGroup.attempted > 0 ? Number(((supervisorGroup.formFilled / supervisorGroup.attempted) * 100).toFixed(1)) : 0;
        supervisorGroup.formToAdmission = supervisorGroup.formFilled > 0 ? Number(((supervisorGroup.admission_count / supervisorGroup.formFilled) * 100).toFixed(1)) : 0;
      });

      // Convert to array
      groupedBySupervisor = Object.values(supervisorGroups).map(group => ({
        ...group,
        counsellors: group.counsellors.sort((a, b) => {
          if (a.group_by === 'Unassigned') return 1;
          if (b.group_by === 'Unassigned') return -1;
          return a.group_by.localeCompare(b.group_by);
        })
      })).sort((a, b) => {
        if (a.supervisorName === 'No Supervisor') return 1;
        if (b.supervisorName === 'No Supervisor') return -1;
        return a.supervisorName.localeCompare(b.supervisorName);
      });
    }

    const response = {
      success: true,
      data: [...grouped, overall],
      groupedBySupervisor,
      totalRecords: grouped.length,
      sortBy: sortBy || (type === 'created_at' ? 'date' : 'name'),
      sortOrder: finalSortOrder,
    };

    // Add analyser filter info to response
    if (isAnalyser) {
      response.analyser_filters_applied = analyserFilters;

      // Build a readable filter description
      const filterDescriptions = [];
      if (analyserFilters.sources && analyserFilters.sources.length > 0) {
        filterDescriptions.push(`Sources: ${analyserFilters.sources.join(', ')}`);
      }
      if (analyserFilters.campaigns && analyserFilters.campaigns.length > 0) {
        filterDescriptions.push(`Campaigns: ${analyserFilters.campaigns.join(', ')}`);
      }
      if (analyserFilters.source_urls && analyserFilters.source_urls.length > 0) {
        filterDescriptions.push(`Source URLs: ${analyserFilters.source_urls.join(', ')}`);
      }
      if (analyserFilters.student_creation_date) {
        filterDescriptions.push(`Date Filter: ${analyserFilters.student_creation_date.replace(/_/g, ' ')}`);
      }

      response.note = `Analyser filters applied: ${filterDescriptions.join(' | ')}`;

      if (source || utm_campaign || created_at_start || created_at_end) {
        response.user_filters_note = 'User-provided filters were overridden by analyser-specific filters';
      }
    }

    if (type === 'agent') {
      response.note = response.note ? response.note + ' | ' : '';
      response.note += 'Includes all counsellors (including those with zero leads)';
    }

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in getThreeRecordsOfFormFilledDownload:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};










export const downloadRecordsForAnalysis = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let fromDate, toDate;
    console.log(req.query)
    if (!req.query.from && !req.query.to) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      fromDate = yesterday;
      toDate = new Date(today);
      toDate.setHours(23, 59, 59, 999);
    } else {
      fromDate = req.query.from
        ? new Date(req.query.from + 'T00:00:00.000Z')
        : new Date('2000-01-01');
      toDate = req.query.to
        ? new Date(req.query.to + 'T23:59:59.999Z')
        : new Date();
    }

    const showL2 = req.query.roleL2 === 'true';
    const showL3 = req.query.roleL3 === 'true';

    if (showL2 && showL3) {
      return res.status(400).json({
        success: false,
        message: 'Only one role filter allowed at a time: either roleL2=true or roleL3=true, not both.'
      });
    }
    const result = await sequelize.query(
      `
      SELECT DISTINCT ON (s.student_id)
        lcs.latest_course_status AS status,
        lcs.created_at,
        s.student_id,
        s.student_name,
        s.source,
        ac.counsellor_name AS currentL2,
        acl3.counsellor_name AS currentL3,
        la.utm_campaign,
        la.source AS lead_source,
        la.source_url,
        uc.course_id,
        uc.course_name AS courseName,
        uc.university_name AS universityName
      FROM latest_course_statuses lcs
      JOIN students s
        ON s.student_id = lcs.student_id
      LEFT JOIN counsellors ac
        ON ac.counsellor_id = s.assigned_counsellor_id
      LEFT JOIN counsellors acl3
        ON acl3.counsellor_id = s.assigned_counsellor_l3_id
      LEFT JOIN LATERAL (
        SELECT la1.*
        FROM student_lead_activities la1
        WHERE la1.student_id = s.student_id
          AND la1.utm_campaign <> ''
        ORDER BY la1.created_at DESC
        LIMIT 1
      ) la ON TRUE
      LEFT JOIN university_courses uc
        ON uc.course_id = lcs.course_id
      WHERE lcs.created_at BETWEEN :fromDate AND :toDate
      ORDER BY s.student_id, lcs.created_at DESC;
      `,
      {
        replacements: { fromDate, toDate },
        type: QueryTypes.SELECT,
      }
    );
    const filteredFormatted = result.map(item => ({
      studentId: item.student_id,
      courseName: item.coursename || '',
      universityName: item.universityname || '',
      currentL2: item?.currentl2 || '',
      currentL3: item?.currentl3 || '',
      status: item.status || '',
      createdAt: formatDate(item.created_at),
    }))
      .filter(entry =>
        entry.currentL3 &&
        entry.currentL3.trim() !== '' &&
        entry.status &&
        entry.status.trim().toLowerCase() !== 'shortlisted'
      );

    return res.json({
      success: true,
      totalRecords: filteredFormatted.length,
      data: filteredFormatted,
    });
  } catch (err) {
    console.error('❌ Error in downloadRecordsForAnalysis:', err);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message,
    });
  }
};
export const getRecordsForAnalysis = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const fromDate = req.query.from ? new Date(req.query.from + 'T00:00:00.000Z') : new Date('2000-01-01');
    const toDate = req.query.to ? new Date(req.query.to + 'T23:59:59.999Z') : new Date();

    const showL2 = req.query.roleL2 === 'true';
    const showL3 = req.query.roleL3 === 'true';

    if (showL2 && showL3) {
      return res.status(400).json({
        success: false,
        message: 'Only one role filter allowed at a time: either roleL2=true or roleL3=true, not both.'
      });
    }

    yesterday.setDate(yesterday.getDate() - 1);

    const formatDate = (date) => {
      const d = new Date(date);
      const pad = (n) => n.toString().padStart(2, "0");
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const result = await sequelize.query(
      `
      SELECT DISTINCT ON (s.student_id)
        lcs.latest_course_status,
        lcs.created_at,
        s.student_id,
        s.student_name,
        s.source,
        ac.counsellor_name AS l2_name,
        acl3.counsellor_name AS l3_name,
        la.utm_campaign,
        la.source AS lead_source,
        la.source_url,
        uc.course_id,
        uc.course_name,
        uc.university_name
      FROM latest_course_statuses lcs
      JOIN students s
        ON s.student_id = lcs.student_id
      LEFT JOIN counsellors ac
        ON ac.counsellor_id = s.assigned_counsellor_id
      LEFT JOIN counsellors acl3
        ON acl3.counsellor_id = s.assigned_counsellor_l3_id
      LEFT JOIN LATERAL (
        SELECT la1.*
        FROM student_lead_activities la1
        WHERE la1.student_id = s.student_id
          AND la1.utm_campaign <> ''
        ORDER BY la1.created_at DESC
        LIMIT 1
      ) la ON TRUE
      LEFT JOIN university_courses uc
        ON uc.course_id = lcs.course_id
      WHERE lcs.created_at > : yesterday
      ORDER BY s.student_id, lcs.created_at DESC;
      `,
      {
        replacements: { yesterday },
        type: QueryTypes.SELECT,
      }
    );
    const allFormatted = statuses.map(item => {

      return {
        _id: item._id,
        courseName: course.courseName || '',
        universityName: course.universityName || '',
        studentId: item.studentId,
        currentL2: student.counsellorName || '',
        currentL3: student.counsellorNameL3 || '',
        status: item.status || '',
        createdAt: item.createdAt,
        updatedByCounsellor: item.updatedAt,
      };
    });

    // Filter valid records
    const filteredFormatted = allFormatted.filter(entry =>
      entry.currentL3?.trim() !== '' &&
      entry.status?.trim().toLowerCase() !== 'shortlisted'
    );

    const paginated = filteredFormatted.slice(skip, skip + limit);

    const statusMap = new Map();
    const l2Map = new Map();
    const l3Map = new Map();

    for (const item of filteredFormatted) {
      const status = item.status;
      if (!showL2 && !showL3 && status) {
        statusMap.set(status, (statusMap.get(status) || 0) + 1);
      }

      const l2 = item.currentL2?.trim();
      if (showL2 && l2) {
        l2Map.set(l2, (l2Map.get(l2) || 0) + 1);
      }

      const l3 = item.currentL3?.trim();
      if (showL3 && l3) {
        l3Map.set(l3, (l3Map.get(l3) || 0) + 1);
      }
    }

    const totalStatus = [...statusMap.values()].reduce((a, b) => a + b, 0);
    const statsWithPercent = [...statusMap.entries()].map(([status, count]) => ({
      status,
      count,
      percentage: ((count / totalStatus) * 100).toFixed(2) + '%',
    }));

    const totalL2 = [...l2Map.values()].reduce((a, b) => a + b, 0);
    const l2Stats = [...l2Map.entries()].map(([counsellor, count]) => ({
      counsellor,
      count,
      percentage: ((count / totalL2) * 100).toFixed(2) + '%',
    }));

    const totalL3 = [...l3Map.values()].reduce((a, b) => a + b, 0);
    const l3Stats = [...l3Map.entries()].map(([counsellor, count]) => ({
      counsellor,
      count,
      percentage: ((count / totalL3) * 100).toFixed(2) + '%',
    }));

    return res.json({
      success: true,
      ...(statusMap.size > 0 && { stats: statsWithPercent }),
      counsellorStats: {
        ...(showL2 && { l2: l2Stats }),
        ...(showL3 && { l3: l3Stats }),
      },
      totalRecords: filteredFormatted.length,
      totalPages: Math.ceil(filteredFormatted.length / limit),
      page,
      data: paginated,
    });

  } catch (err) {
    console.error('❌ Error in getRecordsForAnalysis:', err);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message,
    });
  }
};


export const getRecordsForAnalysishelper = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let fromDate, toDate;

    if (!req.query.from && !req.query.to) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      fromDate = yesterday;
      toDate = new Date(today);
      toDate.setHours(23, 59, 59, 999);
    } else {
      fromDate = req.query.from
        ? new Date(req.query.from + 'T00:00:00.000Z')
        : new Date('2000-01-01');
      toDate = req.query.to
        ? new Date(req.query.to + 'T23:59:59.999Z')
        : new Date();
    }

    const showL2 = req.query.roleL2 === 'true';
    const showL3 = req.query.roleL3 === 'true';

    if (showL2 && showL3) {
      return res.status(400).json({
        success: false,
        message:
          'Only one role filter allowed at a time: either roleL2=true or roleL3=true, not both.',
      });
    }

    const result = await sequelize.query(
      `
      SELECT *
      FROM (
        SELECT DISTINCT ON (s.student_id)
          lcs.latest_course_status AS status,
          lcs.created_at,
          s.student_id,
          s.student_name,
          s.source,
          ac.counsellor_name AS currentL2,
          acl3.counsellor_name AS currentL3,
          la.utm_campaign,
          la.source AS lead_source,
          la.source_url,
          uc.course_id,
          uc.course_name AS courseName,
          uc.university_name AS universityName
        FROM latest_course_statuses lcs
        JOIN students s
          ON s.student_id = lcs.student_id
        LEFT JOIN counsellors ac
          ON ac.counsellor_id = s.assigned_counsellor_id
        LEFT JOIN counsellors acl3
          ON acl3.counsellor_id = s.assigned_counsellor_l3_id
        LEFT JOIN LATERAL (
          SELECT la1.*
          FROM student_lead_activities la1
          WHERE la1.student_id = s.student_id
            AND la1.utm_campaign <> ''
          ORDER BY la1.created_at DESC
          LIMIT 1
        ) la ON TRUE
        LEFT JOIN university_courses uc
          ON uc.course_id = lcs.course_id
        WHERE lcs.created_at BETWEEN :fromDate AND :toDate
        ORDER BY s.student_id, lcs.created_at DESC
      ) sub
      ORDER BY sub.created_at DESC
      `,
      {
        replacements: { fromDate, toDate },
        type: QueryTypes.SELECT,
      }
    );

    const allFormatted = result.map((item) => ({
      studentId: item.student_id,
      courseName: item.coursename || '',
      universityName: item.universityname || '',
      currentL2: item?.currentl2 || '',
      currentL3: item?.currentl3 || '',
      status: item.status || '',
      createdAt: item.created_at,
    }));

    // Filter valid records
    const filteredFormatted = allFormatted.filter(
      (entry) =>
        entry.currentL3?.trim() !== '' &&
        entry.status?.trim().toLowerCase() !== 'shortlisted'
    );

    // Pagination
    const paginated = filteredFormatted.slice(skip, skip + limit);

    // Stats
    const statusMap = new Map();
    const l2Map = new Map();
    const l3Map = new Map();

    for (const item of filteredFormatted) {
      const status = item.status;
      if (!showL2 && !showL3 && status) {
        statusMap.set(status, (statusMap.get(status) || 0) + 1);
      }

      const l2 = item.currentL2?.trim();
      if (showL2 && l2) {
        l2Map.set(l2, (l2Map.get(l2) || 0) + 1);
      }

      const l3 = item.currentL3?.trim();
      if (showL3 && l3) {
        l3Map.set(l3, (l3Map.get(l3) || 0) + 1);
      }
    }

    const totalStatus = [...statusMap.values()].reduce((a, b) => a + b, 0);
    const statsWithPercent = [...statusMap.entries()].map(
      ([status, count]) => ({
        status,
        count,
        percentage: ((count / totalStatus) * 100).toFixed(2) + '%',
      })
    );

    const totalL2 = [...l2Map.values()].reduce((a, b) => a + b, 0);
    const l2Stats = [...l2Map.entries()].map(([counsellor, count]) => ({
      counsellor,
      count,
      percentage: ((count / totalL2) * 100).toFixed(2) + '%',
    }));

    const totalL3 = [...l3Map.values()].reduce((a, b) => a + b, 0);
    const l3Stats = [...l3Map.entries()].map(([counsellor, count]) => ({
      counsellor,
      count,
      percentage: ((count / totalL3) * 100).toFixed(2) + '%',
    }));

    return res.json({
      success: true,
      ...(statusMap.size > 0 && { stats: statsWithPercent }),
      counsellorStats: {
        ...(showL2 && { l2: l2Stats }),
        ...(showL3 && { l3: l3Stats }),
      },
      totalRecords: filteredFormatted.length,
      totalPages: Math.ceil(filteredFormatted.length / limit),
      page,
      data: paginated,
    });
  } catch (err) {
    console.error('❌ Error in getRecordsForAnalysis:', err);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message,
    });
  }
};




export const getTrackReport = async (req, res) => {
  try {
    // Extract query params with defaults to today
    const startDate = req.query.start_date || new Date().toISOString().substring(0, 10);
    const endDate = req.query.end_date || startDate;

    const query = `
      WITH 
      date_params AS (
        SELECT 
          ('${startDate}')::date AS start_date,
          ('${endDate}')::date AS end_date
      ),
      first_icc AS (
        SELECT 
          r.student_id,
          MIN(r.created_at) AS first_created_at
        FROM student_remarks r
        WHERE LOWER(r.lead_sub_status) = LOWER('Initial Counseling Completed')
        GROUP BY r.student_id
      ),
      first_counselling AS (
        SELECT 
          fi.student_id,
          fi.first_created_at
        FROM first_icc fi, date_params d
        WHERE (fi.first_created_at AT TIME ZONE 'Asia/Kolkata')
              BETWEEN (d.start_date)::timestamp
                  AND (d.end_date + INTERVAL '1 day')
      ),
      connected_calls AS (
        SELECT 
          student_id,
          COUNT(*) as connected_count
        FROM student_remarks 
        WHERE LOWER(calling_status) = LOWER('connected')
          AND (created_at AT TIME ZONE 'Asia/Kolkata')
              BETWEEN (('${startDate}')::date)::timestamp
                  AND (('${endDate}')::date + INTERVAL '1 day')
        GROUP BY student_id
      ),
      daily_connected_calls AS (
        SELECT 
          CASE 
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) < 11 THEN 'Till 11 AM'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 11 THEN '11:00 - 12:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 12 THEN '12:00 - 13:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 13 THEN '13:00 - 14:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 14 THEN '14:00 - 15:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 15 THEN '15:00 - 16:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 16 THEN '16:00 - 17:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 17 THEN '17:00 - 18:00'
            WHEN EXTRACT(HOUR FROM (sr.created_at AT TIME ZONE 'Asia/Kolkata')) = 18 THEN '18:00 - 19:00'
            ELSE 'After 7 PM'
          END AS time_frame,
          COUNT(*) AS connected_calls
        FROM student_remarks sr, date_params d
        WHERE LOWER(sr.calling_status) = LOWER('connected')
          AND (sr.created_at AT TIME ZONE 'Asia/Kolkata')
              BETWEEN (d.start_date)::timestamp
                  AND (d.end_date + INTERVAL '1 day')
        GROUP BY 1
      ),
      lead_data AS (
        SELECT     
          CASE 
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) < 11 THEN 'Till 11 AM'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 11 THEN '11:00 - 12:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 12 THEN '12:00 - 13:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 13 THEN '13:00 - 14:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 14 THEN '14:00 - 15:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 15 THEN '15:00 - 16:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 16 THEN '16:00 - 17:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 17 THEN '17:00 - 18:00'
            WHEN EXTRACT(HOUR FROM (s.created_at AT TIME ZONE 'Asia/Kolkata')) = 18 THEN '18:00 - 19:00'
            ELSE 'After 7 PM'
          END AS time_frame,
          COUNT(*) AS new_leads
        FROM students s, date_params d 
        WHERE (s.created_at AT TIME ZONE 'Asia/Kolkata')
            BETWEEN (d.start_date)::timestamp
                AND (d.end_date + INTERVAL '1 day')
        GROUP BY 1
      ),
      counselling_data AS (
        SELECT 
          CASE 
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) < 11 THEN 'Till 11 AM'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 11 THEN '11:00 - 12:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 12 THEN '12:00 - 13:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 13 THEN '13:00 - 14:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 14 THEN '14:00 - 15:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 15 THEN '15:00 - 16:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 16 THEN '16:00 - 17:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 17 THEN '17:00 - 18:00'
            WHEN EXTRACT(HOUR FROM (fc.first_created_at AT TIME ZONE 'Asia/Kolkata')) = 18 THEN '18:00 - 19:00'
            ELSE 'After 7 PM'
          END AS time_frame,
          COUNT(fc.student_id) AS new_counselling
        FROM first_counselling fc
        GROUP BY 1
      )
      SELECT 
        COALESCE(l.time_frame, c.time_frame, dcc.time_frame) AS "time_interval",
        COALESCE(l.new_leads, 0) AS "new_leads",
        COALESCE(c.new_counselling, 0) AS "new_counselling",
        COALESCE(dcc.connected_calls, 0) AS "connected_calls"
      FROM lead_data l 
      FULL OUTER JOIN counselling_data c 
        ON l.time_frame = c.time_frame
      FULL OUTER JOIN daily_connected_calls dcc 
        ON COALESCE(l.time_frame, c.time_frame) = dcc.time_frame
      ORDER BY  
        CASE 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = 'Till 11 AM' THEN 1 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '11:00 - 12:00' THEN 2 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '12:00 - 13:00' THEN 3 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '13:00 - 14:00' THEN 4 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '14:00 - 15:00' THEN 5 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '15:00 - 16:00' THEN 6  
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '16:00 - 17:00' THEN 7 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '17:00 - 18:00' THEN 8 
          WHEN COALESCE(l.time_frame, c.time_frame, dcc.time_frame) = '18:00 - 19:00' THEN 9
          ELSE 10
        END
    `;

    // Execute main query
    const rows = await sequelize.query(query, { type: sequelize.QueryTypes.SELECT });

    // ========== OVERALL TOTALS (All Time) ==========
    const totalLeadsResult = await sequelize.query(
      `SELECT COUNT(*) as count FROM students`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const totalCounselResult = await sequelize.query(
      `SELECT COUNT(DISTINCT student_id) as count FROM student_remarks WHERE LOWER(lead_sub_status) = LOWER('Initial Counseling Completed')`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const totalConnectedResult = await sequelize.query(
      `SELECT COUNT(*) as count FROM student_remarks WHERE LOWER(calling_status) = LOWER('connected')`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const totalLeads = Number(totalLeadsResult[0].count || 0);
    const totalCounsel = Number(totalCounselResult[0].count || 0);
    const totalConnected = Number(totalConnectedResult[0].count || 0);

    // ========== CURRENT PERIOD STATS ==========
    const newLeads = rows.reduce((a, r) => a + (Number(r.new_leads) || 0), 0);
    const newCounsel = rows.reduce((a, r) => a + (Number(r.new_counselling) || 0), 0);
    const connectedCalls = rows.reduce((a, r) => a + (Number(r.connected_calls) || 0), 0);

    // ========== RETURN BOTH COUNT AND PERCENTAGE ==========
    const stats = {
      newLeads: {
        count: newLeads,
        percentage: totalLeads ? parseFloat(((newLeads / totalLeads) * 100).toFixed(1)) : 0
      },
      newCounsel: {
        count: newCounsel,
        percentage: totalCounsel ? parseFloat(((newCounsel / totalCounsel) * 100).toFixed(1)) : 0
      },
      connectedCalls: {
        count: connectedCalls,
        percentage: totalConnected ? parseFloat(((connectedCalls / totalConnected) * 100).toFixed(1)) : 0
      }
    };

    res.json({
      success: true,
      data: rows,
      stats, // Contains both count and percentage for each metric
      overall: {
        totalLeads,
        totalCounsel,
        totalConnected,
      }
    });

  } catch (error) {
    console.error('Track Report Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || error.toString()
    });
  }
};


export const getTrackerReport2 = async (req, res) => {
  try {
    const { date_start, date_end, groupBy = 'slot' } = req.query;
    const userRole = req.user?.role; // Get user role from request
    console.log(userRole)
    if (!date_start || !date_end) {
      return res.status(400).json({ success: false, message: 'date_start and date_end are required' });
    }

    // Use explicit timezone handling (IST = UTC+5:30)
    const startDate = new Date(date_start + 'T00:00:00+05:30');
    const endDate = new Date(date_end + 'T23:59:59+05:30');

    // Fetch counsellor names and supervisors
    const counsellors = await Counsellor.findAll({
      attributes: ['counsellor_id', 'counsellor_name', 'assigned_to'],
      raw: true
    });

    const counsellorMap = {};
    const supervisorMap = {};
    const counsellorSupervisorMap = {}; // Map counsellor_id to supervisor_name

    counsellors.forEach(c => {
      counsellorMap[c.counsellor_id] = c.counsellor_name;

      // Find supervisor name
      let supervisorName = 'No Supervisor';
      if (c.assigned_to) {
        const supervisor = counsellors.find(sup => sup.counsellor_id === c.assigned_to);
        if (supervisor) {
          supervisorName = supervisor.counsellor_name;
        }
      }

      counsellorSupervisorMap[c.counsellor_id] = supervisorName;

      // Build supervisor map for grouping
      if (!supervisorMap[supervisorName]) {
        supervisorMap[supervisorName] = {
          supervisorName,
          counsellors: []
        };
      }
    });

    // Variables for Facebook filtering
    let facebookStudentIds = [];
    let isAnalyser = userRole === 'Analyser';

    if (isAnalyser) {
      // Get all Facebook student IDs to filter remarks for analysers only
      const facebookStudents = await Student.findAll({
        where: {
          source: 'FaceBook'  // Filter by Facebook source for analysers
        },
        attributes: ['student_id'],
        raw: true
      });

      facebookStudentIds = facebookStudents.map(s => s.student_id);

      if (facebookStudentIds.length === 0) {
        return res.json({
          success: true,
          groupBy,
          rows: [],
          groupedBySupervisor: groupBy === 'counsellor' ? [] : null,
          totals: {
            totalUniqueRemarks: {
              count: 0,
              percentage: 0.0
            },
            firstTimeConnected: {
              count: 0,
              percentage: 0.0
            },
            firstTimeICC: {
              count: 0,
              percentage: 0.0
            },
            firstTimeNI: {
              count: 0,
              percentage: 0.0
            }
          },
          summary: {
            totalSupervisors: 0,
            totalCounsellors: 0,
            note: 'No Facebook leads found for the selected date range'
          }
        });
      }
    }

    // Build where conditions for remarks
    const remarkWhereConditions = {
      created_at: { [Op.between]: [startDate, endDate] }
    };

    // Add Facebook filter only for analysers
    if (isAnalyser) {
      remarkWhereConditions.student_id = { [Op.in]: facebookStudentIds };
    }

    // Filter remarks
    const remarks = await StudentRemark.findAll({
      where: remarkWhereConditions,
      attributes: ['remark_id', 'student_id', 'counsellor_id', 'calling_status', 'lead_status', 'lead_sub_status', 'created_at'],
      order: [['student_id', 'ASC'], ['created_at', 'ASC']],
      raw: true
    });

    // Build SQL queries based on role
    let firstConnectedQuery, firstICCQuery, firstNIQuery;

    if (isAnalyser) {
      // For analysers: filter by Facebook source
      firstConnectedQuery = `
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.created_at as first_connected_at
        FROM student_remarks sr
        INNER JOIN students s ON sr.student_id = s.student_id
        WHERE LOWER(TRIM(sr.calling_status)) = 'connected'
          AND s.source = 'FaceBook'
        ORDER BY sr.student_id, sr.created_at ASC
      `;

      firstICCQuery = `
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.created_at as first_icc_at
        FROM student_remarks sr
        INNER JOIN students s ON sr.student_id = s.student_id
        WHERE sr.lead_sub_status = 'Initial Counseling Completed'
          AND s.source = 'FaceBook'
        ORDER BY sr.student_id, sr.created_at ASC
      `;

      firstNIQuery = `
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.created_at as first_ni_at
        FROM student_remarks sr
        INNER JOIN students s ON sr.student_id = s.student_id
        WHERE sr.lead_status = 'NotInterested'
          AND s.source = 'FaceBook'
        ORDER BY sr.student_id, sr.created_at ASC
      `;
    } else {
      // For other roles: get all data
      firstConnectedQuery = `
        SELECT DISTINCT ON (student_id)
          student_id,
          created_at as first_connected_at
        FROM student_remarks
        WHERE LOWER(TRIM(calling_status)) = 'connected'
        ORDER BY student_id, created_at ASC
      `;

      firstICCQuery = `
        SELECT DISTINCT ON (student_id)
          student_id,
          created_at as first_icc_at
        FROM student_remarks
        WHERE lead_sub_status = 'Initial Counseling Completed'
        ORDER BY student_id, created_at ASC
      `;

      firstNIQuery = `
        SELECT DISTINCT ON (student_id)
          student_id,
          created_at as first_ni_at
        FROM student_remarks
        WHERE lead_status = 'NotInterested'
        ORDER BY student_id, created_at ASC
      `;
    }

    // Execute queries
    const firstConnected = await sequelize.query(firstConnectedQuery, { type: sequelize.QueryTypes.SELECT });
    const firstICC = await sequelize.query(firstICCQuery, { type: sequelize.QueryTypes.SELECT });
    const firstNI = await sequelize.query(firstNIQuery, { type: sequelize.QueryTypes.SELECT });

    const firstConnectedMap = {};
    firstConnected.forEach(r => {
      firstConnectedMap[r.student_id] = new Date(r.first_connected_at).getTime();
    });

    const firstICCMap = {};
    firstICC.forEach(r => {
      firstICCMap[r.student_id] = new Date(r.first_icc_at).getTime();
    });

    const firstNIMap = {};
    firstNI.forEach(r => {
      firstNIMap[r.student_id] = new Date(r.first_ni_at).getTime();
    });

    const getGroupKey = (remark) => {
      if (groupBy === 'counsellor') {
        const counsellorId = remark.counsellor_id || 'Unassigned';
        if (counsellorId === 'Unassigned') {
          return {
            groupKey: 'Unassigned',
            counsellorName: 'Unassigned',
            supervisorName: 'No Supervisor'
          };
        }

        const counsellorName = counsellorMap[counsellorId] || counsellorId;
        const supervisorName = counsellorSupervisorMap[counsellorId] || 'No Supervisor';

        return {
          groupKey: counsellorName,
          counsellorName,
          supervisorName
        };
      } else {
        // Convert UTC time to IST for slot grouping
        const d = new Date(remark.created_at);
        // Add 5 hours 30 minutes for IST
        const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
        const hour = istDate.getUTCHours();

        if (hour >= 9 && hour < 24) {
          const nextHour = hour === 23 ? '00' : (hour + 1).toString().padStart(2, '0');
          const slotKey = `${hour.toString().padStart(2, '0')}:00-${nextHour}:00`;
          return {
            groupKey: slotKey,
            counsellorName: null,
            supervisorName: null
          };
        }
        return null;
      }
    };

    // Pre-initialize all time slots if groupBy is 'slot'
    const groupData = {};
    if (groupBy === 'slot') {
      for (let h = 9; h < 24; h++) {
        const nextHour = h === 23 ? '00' : (h + 1).toString().padStart(2, '0');
        const slotKey = `${h.toString().padStart(2, '0')}:00-${nextHour}:00`;
        groupData[slotKey] = {
          groupKey: slotKey,
          counsellorName: null,
          supervisorName: null,
          totalUniqueRemarks: new Set(),
          firstTimeConnected: new Set(),
          firstTimeICC: new Set(),
          firstTimeNI: new Set()
        };
      }
    }

    const overallTotals = {
      totalUniqueRemarks: new Set(),
      firstTimeConnected: new Set(),
      firstTimeICC: new Set(),
      firstTimeNI: new Set()
    };

    remarks.forEach(remark => {
      const groupInfo = getGroupKey(remark);
      if (!groupInfo) return;

      const { groupKey, counsellorName, supervisorName } = groupInfo;

      if (!groupData[groupKey]) {
        groupData[groupKey] = {
          groupKey,
          counsellorName,
          supervisorName,
          totalUniqueRemarks: new Set(),
          firstTimeConnected: new Set(),
          firstTimeICC: new Set(),
          firstTimeNI: new Set()
        };
      }

      const remarkTime = new Date(remark.created_at).getTime();

      groupData[groupKey].totalUniqueRemarks.add(remark.student_id);
      overallTotals.totalUniqueRemarks.add(remark.student_id);

      if (remark.calling_status && remark.calling_status.toLowerCase().trim() === 'connected') {
        const firstConnTime = firstConnectedMap[remark.student_id];
        if (firstConnTime && remarkTime === firstConnTime) {
          groupData[groupKey].firstTimeConnected.add(remark.student_id);
          overallTotals.firstTimeConnected.add(remark.student_id);
        }
      }

      if (remark.lead_sub_status === 'Initial Counseling Completed') {
        const firstICCTime = firstICCMap[remark.student_id];
        if (firstICCTime && remarkTime === firstICCTime) {
          groupData[groupKey].firstTimeICC.add(remark.student_id);
          overallTotals.firstTimeICC.add(remark.student_id);
        }
      }

      if (remark.lead_status === 'NotInterested') {
        const firstNITime = firstNIMap[remark.student_id];
        if (firstNITime && remarkTime === firstNITime) {
          groupData[groupKey].firstTimeNI.add(remark.student_id);
          overallTotals.firstTimeNI.add(remark.student_id);
        }
      }
    });

    // Generate rows from groupData
    const rows = Object.keys(groupData).map(key => ({
      groupKey: groupData[key].groupKey,
      counsellorName: groupData[key].counsellorName,
      supervisorName: groupData[key].supervisorName,
      totalUniqueRemarks: groupData[key].totalUniqueRemarks.size,
      firstTimeConnected: groupData[key].firstTimeConnected.size,
      firstTimeICC: groupData[key].firstTimeICC.size,
      firstTimeNI: groupData[key].firstTimeNI.size
    }));

    // Sort if groupBy is 'slot'
    if (groupBy === 'slot') {
      const slotOrder = [];
      for (let h = 9; h < 24; h++) {
        const nextHour = h === 23 ? '00' : (h + 1).toString().padStart(2, '0');
        slotOrder.push(`${h.toString().padStart(2, '0')}:00-${nextHour}:00`);
      }
      rows.sort((a, b) => slotOrder.indexOf(a.groupKey) - slotOrder.indexOf(b.groupKey));
    }

    // Group by supervisor for counsellor view
    let groupedBySupervisor = null;
    if (groupBy === 'counsellor') {
      const supervisorGroups = {};

      rows.forEach(row => {
        const supervisorName = row.supervisorName || 'No Supervisor';

        if (!supervisorGroups[supervisorName]) {
          supervisorGroups[supervisorName] = {
            supervisorName,
            totalUniqueRemarks: 0,
            firstTimeConnected: 0,
            firstTimeICC: 0,
            firstTimeNI: 0,
            counsellors: []
          };
        }

        supervisorGroups[supervisorName].counsellors.push(row);
        supervisorGroups[supervisorName].totalUniqueRemarks += row.totalUniqueRemarks;
        supervisorGroups[supervisorName].firstTimeConnected += row.firstTimeConnected;
        supervisorGroups[supervisorName].firstTimeICC += row.firstTimeICC;
        supervisorGroups[supervisorName].firstTimeNI += row.firstTimeNI;
      });

      // Convert to array
      groupedBySupervisor = Object.values(supervisorGroups).map(group => ({
        ...group,
        counsellors: group.counsellors.sort((a, b) => {
          if (a.groupKey === 'Unassigned') return 1;
          if (b.groupKey === 'Unassigned') return -1;
          return a.groupKey.localeCompare(b.groupKey);
        })
      })).sort((a, b) => {
        if (a.supervisorName === 'No Supervisor') return 1;
        if (b.supervisorName === 'No Supervisor') return -1;
        return a.supervisorName.localeCompare(b.supervisorName);
      });
    }

    // Calculate totals
    const totals = {
      totalUniqueRemarks: overallTotals.totalUniqueRemarks.size,
      firstTimeConnected: overallTotals.firstTimeConnected.size,
      firstTimeICC: overallTotals.firstTimeICC.size,
      firstTimeNI: overallTotals.firstTimeNI.size
    };

    // Calculate percentages
    const totalPercentages = {
      connectedPerc: totals.totalUniqueRemarks
        ? ((totals.firstTimeConnected / totals.totalUniqueRemarks) * 100).toFixed(1)
        : '0.0',
      iccPerc: totals.totalUniqueRemarks
        ? ((totals.firstTimeICC / totals.totalUniqueRemarks) * 100).toFixed(1)
        : '0.0',
      niPerc: totals.totalUniqueRemarks
        ? ((totals.firstTimeNI / totals.totalUniqueRemarks) * 100).toFixed(1)
        : '0.0'
    };

    // Prepare response
    const response = {
      success: true,
      groupBy,
      rows,
      groupedBySupervisor,
      totals: {
        totalUniqueRemarks: {
          count: totals.totalUniqueRemarks,
          percentage: 100.0
        },
        firstTimeConnected: {
          count: totals.firstTimeConnected,
          percentage: parseFloat(totalPercentages.connectedPerc)
        },
        firstTimeICC: {
          count: totals.firstTimeICC,
          percentage: parseFloat(totalPercentages.iccPerc)
        },
        firstTimeNI: {
          count: totals.firstTimeNI,
          percentage: parseFloat(totalPercentages.niPerc)
        }
      },
      summary: {
        totalSupervisors: groupedBySupervisor ? groupedBySupervisor.length : 0,
        totalCounsellors: rows.length
      }
    };

    // Add note for analysers
    if (isAnalyser) {
      response.summary.note = 'Data includes only Facebook leads';
      response.summary.dataFilter = 'Facebook leads only';
    }

    res.json(response);

  } catch (err) {
    console.error('Error in getTrackerReport2:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getTrackerReport2RawData = async (req, res) => {
  try {
    const { date_start, date_end, groupBy = 'detailed' } = req.query;

    if (!date_start || !date_end) {
      return res.status(400).json({ success: false, message: 'date_start and date_end are required' });
    }

    console.log(`Starting raw student data fetch for ${date_start} to ${date_end}`);

    // Use explicit timezone handling (IST = UTC+5:30)
    const startDate = new Date(date_start + 'T00:00:00+05:30');
    const endDate = new Date(date_end + 'T23:59:59+05:30');

    // 1. Get counsellor names and supervisors
    const counsellors = await Counsellor.findAll({
      attributes: ['counsellor_id', 'counsellor_name', 'assigned_to'],
      raw: true
    });

    const counsellorMap = {};
    const counsellorSupervisorMap = {};

    counsellors.forEach(c => {
      counsellorMap[c.counsellor_id] = c.counsellor_name;

      // Find supervisor name
      let supervisorName = 'No Supervisor';
      if (c.assigned_to) {
        const supervisor = counsellors.find(sup => sup.counsellor_id === c.assigned_to);
        if (supervisor) {
          supervisorName = supervisor.counsellor_name;
        }
      }

      counsellorSupervisorMap[c.counsellor_id] = supervisorName;
    });

    // 2. Get student details
    const students = await Student.findAll({
      attributes: ['student_id', 'student_name', 'student_phone', 'student_email'],
      raw: true
    });

    const studentMap = {};
    students.forEach(s => {
      studentMap[s.student_id] = s;
    });

    // 3. Get all remarks in date range (same logic as getTrackerReport2)
    const remarks = await StudentRemark.findAll({
      where: {
        created_at: { [Op.between]: [startDate, endDate] }
      },
      attributes: ['remark_id', 'student_id', 'counsellor_id', 'calling_status', 'lead_status', 'lead_sub_status', 'created_at'],
      order: [['student_id', 'ASC'], ['created_at', 'ASC']],
      raw: true
    });

    console.log(`Found ${remarks.length} remarks in date range`);

    // 4. Get FIRST occurrences globally (same logic as getTrackerReport2)
    // FIX: Handle the array of arrays response from sequelize.query
    const firstConnectedResult = await sequelize.query(`
      SELECT DISTINCT ON (student_id)
        student_id,
        created_at as first_connected_at
      FROM student_remarks
      WHERE LOWER(TRIM(calling_status)) = 'connected'
      ORDER BY student_id, created_at ASC
    `, { type: sequelize.QueryTypes.SELECT });

    const firstICCResult = await sequelize.query(`
      SELECT DISTINCT ON (student_id)
        student_id,
        created_at as first_icc_at
      FROM student_remarks
      WHERE lead_sub_status = 'Initial Counseling Completed'
      ORDER BY student_id, created_at ASC
    `, { type: sequelize.QueryTypes.SELECT });

    const firstNIResult = await sequelize.query(`
      SELECT DISTINCT ON (student_id)
        student_id,
        created_at as first_ni_at
      FROM student_remarks
      WHERE lead_status = 'NotInterested'
      ORDER BY student_id, created_at ASC
    `, { type: sequelize.QueryTypes.SELECT });

    // Create maps for quick lookup
    const firstConnectedMap = {};
    // FIX: firstConnectedResult is already an array, not an array of arrays
    firstConnectedResult.forEach(r => {
      firstConnectedMap[r.student_id] = new Date(r.first_connected_at).getTime();
    });

    const firstICCMap = {};
    firstICCResult.forEach(r => {
      firstICCMap[r.student_id] = new Date(r.first_icc_at).getTime();
    });

    const firstNIMap = {};
    firstNIResult.forEach(r => {
      firstNIMap[r.student_id] = new Date(r.first_ni_at).getTime();
    });

    console.log(`First connected map size: ${Object.keys(firstConnectedMap).length}`);
    console.log(`First ICC map size: ${Object.keys(firstICCMap).length}`);
    console.log(`First NI map size: ${Object.keys(firstNIMap).length}`);

    // 5. Process remarks to identify first-time occurrences in date range
    const studentFirstOccurrences = {}; // Track first-time events per student per counsellor

    remarks.forEach(remark => {
      const studentId = remark.student_id;
      const counsellorId = remark.counsellor_id || 'Unassigned';
      const counsellorName = counsellorMap[counsellorId] || counsellorId;
      const supervisorName = counsellorSupervisorMap[counsellorId] || 'No Supervisor';
      const remarkTime = new Date(remark.created_at).getTime();

      // Create key for this student-counsellor pair
      const key = `${studentId}_${counsellorId}`;

      if (!studentFirstOccurrences[key]) {
        studentFirstOccurrences[key] = {
          student_id: studentId,
          counsellor_id: counsellorId,
          counsellor_name: counsellorName,
          supervisor_name: supervisorName,
          first_remark_date: remark.created_at,
          connected_date: null,
          icc_date: null,
          ni_date: null,
          is_first_connected: false,
          is_first_icc: false,
          is_first_ni: false
        };
      }

      // Check if this is the FIRST connected event globally AND it happened in our date range
      if (remark.calling_status && remark.calling_status.toLowerCase().trim() === 'connected') {
        const firstConnTime = firstConnectedMap[studentId];
        if (firstConnTime && remarkTime === firstConnTime) {
          studentFirstOccurrences[key].connected_date = remark.created_at;
          studentFirstOccurrences[key].is_first_connected = true;
        }
      }

      // Check if this is the FIRST ICC event globally AND it happened in our date range
      if (remark.lead_sub_status === 'Initial Counseling Completed') {
        const firstICCTime = firstICCMap[studentId];
        if (firstICCTime && remarkTime === firstICCTime) {
          studentFirstOccurrences[key].icc_date = remark.created_at;
          studentFirstOccurrences[key].is_first_icc = true;
        }
      }

      // Check if this is the FIRST NI event globally AND it happened in our date range
      if (remark.lead_status === 'NotInterested') {
        const firstNITime = firstNIMap[studentId];
        if (firstNITime && remarkTime === firstNITime) {
          studentFirstOccurrences[key].ni_date = remark.created_at;
          studentFirstOccurrences[key].is_first_ni = true;
        }
      }
    });

    // 6. Convert to array and get student details
    const studentOccurrences = Object.values(studentFirstOccurrences);
    console.log(`Found ${studentOccurrences.length} student-counsellor pairs with first occurrences in date range`);

    // Debug: Show counts of first-time events
    const firstConnectedCount = studentOccurrences.filter(s => s.is_first_connected).length;
    const firstICCCount = studentOccurrences.filter(s => s.is_first_icc).length;
    const firstNICount = studentOccurrences.filter(s => s.is_first_ni).length;
    console.log(`First time connected: ${firstConnectedCount}, ICC: ${firstICCCount}, NI: ${firstNICount}`);

    // 7. Format the data
    const formattedData = studentOccurrences.map(row => {
      const student = studentMap[row.student_id] || {};

      return {
        Counsellor: row.counsellor_name,
        Supervisor: row.supervisor_name,
        Student_ID: row.student_id,
        Student_Name: student.student_name || '',
        Phone: student.student_phone || '',
        Email: student.student_email || '',
        First_Remark_Date: row.first_remark_date ?
          new Date(row.first_remark_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
        First_Time_Connected: row.is_first_connected ? 'Yes' : 'No',
        Connected_Date: row.connected_date ?
          new Date(row.connected_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
        First_Time_ICC: row.is_first_icc ? 'Yes' : 'No',
        ICC_Date: row.icc_date ?
          new Date(row.icc_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
        First_Time_NI: row.is_first_ni ? 'Yes' : 'No',
        NI_Date: row.ni_date ?
          new Date(row.ni_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''
      };
    });

    // 8. Create aggregated response based on groupBy parameter
    let response;
    if (groupBy === 'counsellor') {
      // Group by counsellor
      const counsellorSummary = {};
      formattedData.forEach(row => {
        const counsellor = row.Counsellor;
        if (!counsellorSummary[counsellor]) {
          counsellorSummary[counsellor] = {
            total_unique_students: new Set(),
            first_time_connected: new Set(),
            first_time_icc: new Set(),
            first_time_ni: new Set()
          };
        }

        counsellorSummary[counsellor].total_unique_students.add(row.Student_ID);
        if (row.First_Time_Connected === 'Yes') {
          counsellorSummary[counsellor].first_time_connected.add(row.Student_ID);
        }
        if (row.First_Time_ICC === 'Yes') {
          counsellorSummary[counsellor].first_time_icc.add(row.Student_ID);
        }
        if (row.First_Time_NI === 'Yes') {
          counsellorSummary[counsellor].first_time_ni.add(row.Student_ID);
        }
      });

      // Convert sets to arrays with counts
      const summaryWithCountsAndIds = {};
      Object.keys(counsellorSummary).forEach(counsellor => {
        summaryWithCountsAndIds[counsellor] = {
          total_unique_students: {
            count: counsellorSummary[counsellor].total_unique_students.size,
            student_ids: Array.from(counsellorSummary[counsellor].total_unique_students)
          },
          first_time_connected: {
            count: counsellorSummary[counsellor].first_time_connected.size,
            student_ids: Array.from(counsellorSummary[counsellor].first_time_connected)
          },
          first_time_icc: {
            count: counsellorSummary[counsellor].first_time_icc.size,
            student_ids: Array.from(counsellorSummary[counsellor].first_time_icc)
          },
          first_time_ni: {
            count: counsellorSummary[counsellor].first_time_ni.size,
            student_ids: Array.from(counsellorSummary[counsellor].first_time_ni)
          }
        };
      });

      response = {
        success: true,
        group_by: 'counsellor',
        data: summaryWithCountsAndIds,
        count: Object.keys(summaryWithCountsAndIds).length,
        date_range: `${date_start} to ${date_end}`,
        generated_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };
    } else {
      // Return detailed data
      response = {
        success: true,
        group_by: 'detailed',
        data: formattedData,
        count: formattedData.length,
        date_range: `${date_start} to ${date_end}`,
        generated_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };
    }

    res.json(response);

  } catch (err) {
    console.error('Error in getTrackerReport2RawData:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};










export const getLeadAttemptTimeReport = async (req, res) => {
  try {
    const { date_start, date_end, source, group_by = 'counsellor' } = req.query;
    const userRole = req.user?.role; // Get user role from request
    const isAnalyser = userRole === 'Analyser';
    // Convert dates to IST timezone consistently
    const getISTDate = (dateString, time) => {
      const date = new Date(`${dateString}T${time}+05:30`); // IST offset
      return date.toISOString(); // Convert to UTC ISO string
    };

    let whereConditions = [];
    let queryParams = {};

    // Add Facebook filter for analysers regardless of source parameter
    if (isAnalyser) {
      whereConditions.push(`s.source = 'FaceBook'`);
    } else if (source) {
      // For non-analysers, use the source from query parameter
      whereConditions.push(`s.source = $source`);
      queryParams.source = source;
    }

    if (date_start) {
      whereConditions.push(`s.created_at >= $date_start`);
      queryParams.date_start = getISTDate(date_start, '00:00:00');
    }
    if (date_end) {
      whereConditions.push(`s.created_at <= $date_end`);
      queryParams.date_end = getISTDate(date_end, '23:59:59');
    }

    let groupByField, groupByName;
    if (group_by === 'hour') {
      groupByField = `EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata')`;
      groupByName = `
        CASE 
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') < 9 THEN 'Till 9 AM'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 9 THEN '9:00 - 10:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 10 THEN '10:00 - 11:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 11 THEN '11:00 - 12:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 12 THEN '12:00 - 13:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 13 THEN '13:00 - 14:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 14 THEN '14:00 - 15:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 15 THEN '15:00 - 16:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 16 THEN '16:00 - 17:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 17 THEN '17:00 - 18:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 18 THEN '18:00 - 19:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 19 THEN '19:00 - 20:00'
          WHEN EXTRACT(HOUR FROM s.created_at AT TIME ZONE 'Asia/Kolkata') = 20 THEN '20:00 - 21:00'
          ELSE 'After 9 PM'
        END
      `;
    } else {
      // Group by counsellor with supervisor information
      groupByField = `COALESCE(c.counsellor_name, 'Unassigned')`;
      groupByName = `
        COALESCE(
          CASE 
            WHEN c.counsellor_name IS NULL THEN 'Unassigned'
            ELSE c.counsellor_name || '|' || COALESCE(sup.counsellor_name, 'No Supervisor')
          END, 
          'Unassigned|No Supervisor'
        )
      `;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const query = `
      WITH student_first_remark AS (
        SELECT 
          sr.student_id,
          MIN(sr.created_at) as first_remark_time
        FROM student_remarks sr
        ${isAnalyser ? `INNER JOIN students s2 ON sr.student_id = s2.student_id AND s2.source = 'FaceBook'` : ''}
        GROUP BY sr.student_id
      )
      SELECT
        ${groupByName} as group_name,
        ${group_by === 'counsellor' ?
        `COALESCE(c.counsellor_name, 'Unassigned') as counsellor_name,
          COALESCE(sup.counsellor_name, 'No Supervisor') as supervisor_name,`
        : ''}
        COUNT(DISTINCT s.student_id) as leads_assigned,
        COUNT(DISTINCT sfr.student_id) as attempted,
        COUNT(DISTINCT CASE 
          WHEN EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 <= 15 
          THEN sfr.student_id 
        END) as within_15,
        COUNT(DISTINCT CASE 
          WHEN EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 BETWEEN 16 AND 30 
          THEN sfr.student_id 
        END) as min_15_30,
        COUNT(DISTINCT CASE 
          WHEN EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 > 30 
          THEN sfr.student_id 
        END) as gt_30
      FROM students s
      LEFT JOIN student_first_remark sfr ON s.student_id = sfr.student_id
      LEFT JOIN counsellors c ON s.assigned_counsellor_id = c.counsellor_id
      LEFT JOIN counsellors sup ON c.assigned_to = sup.counsellor_id
      ${whereClause}
      GROUP BY ${groupByName}
      ${group_by === 'counsellor' ? ', c.counsellor_name, sup.counsellor_name' : ''}
      ORDER BY 
        CASE 
          WHEN ${groupByName} LIKE '%No Supervisor%' THEN 1
          WHEN ${group_by === 'hour'} THEN
            CASE 
              WHEN ${groupByName} = 'Till 9 AM' THEN 1
              WHEN ${groupByName} = '9:00 - 10:00' THEN 2
              WHEN ${groupByName} = '10:00 - 11:00' THEN 3
              WHEN ${groupByName} = '11:00 - 12:00' THEN 4
              WHEN ${groupByName} = '12:00 - 13:00' THEN 5
              WHEN ${groupByName} = '13:00 - 14:00' THEN 6
              WHEN ${groupByName} = '14:00 - 15:00' THEN 7
              WHEN ${groupByName} = '15:00 - 16:00' THEN 8
              WHEN ${groupByName} = '16:00 - 17:00' THEN 9
              WHEN ${groupByName} = '17:00 - 18:00' THEN 10
              WHEN ${groupByName} = '18:00 - 19:00' THEN 11
              WHEN ${groupByName} = '19:00 - 20:00' THEN 12
              WHEN ${groupByName} = '20:00 - 21:00' THEN 13
              WHEN ${groupByName} = 'After 9 PM' THEN 14
              ELSE 15
            END
          ELSE 0
        END,
        ${group_by === 'counsellor' ? 'sup.counsellor_name, c.counsellor_name' : 'group_name'}
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      bind: queryParams
    });

    const rows = results.map(row => {
      const leadsAssigned = Number(row.leads_assigned) || 0;
      const attempted = Number(row.attempted) || 0;
      const within15 = Number(row.within_15) || 0;
      const min1530 = Number(row.min_15_30) || 0;
      const gt30 = Number(row.gt_30) || 0;

      let groupName, counsellorName, supervisorName;

      if (group_by === 'hour') {
        groupName = row.group_name;
        counsellorName = null;
        supervisorName = null;
      } else {
        // Parse the combined group_name field
        const parts = row.group_name.split('|');
        if (parts.length === 2) {
          counsellorName = parts[0] === 'Unassigned' ? null : parts[0];
          supervisorName = parts[1] === 'No Supervisor' ? null : parts[1];
          groupName = counsellorName || 'Unassigned';
        } else {
          counsellorName = row.counsellor_name || null;
          supervisorName = row.supervisor_name || null;
          groupName = counsellorName || 'Unassigned';
        }
      }

      return {
        groupName,
        counsellorName,
        supervisorName: supervisorName || 'No Supervisor',
        leadsAssigned,
        attempted,
        within15,
        min1530,
        gt30,
        percAttempted: leadsAssigned > 0 ? ((attempted / leadsAssigned) * 100).toFixed(0) + '%' : '0%',
        perc15: leadsAssigned > 0 ? ((within15 / leadsAssigned) * 100).toFixed(0) + '%' : '0%',
        perc30: leadsAssigned > 0 ? ((min1530 / leadsAssigned) * 100).toFixed(0) + '%' : '0%',
        percGt30: leadsAssigned > 0 ? ((gt30 / leadsAssigned) * 100).toFixed(0) + '%' : '0%',
      };
    });

    // Group by supervisor for hierarchical structure
    const groupedBySupervisor = {};
    rows.forEach(row => {
      if (group_by !== 'hour') {
        const supervisorName = row.supervisorName || 'No Supervisor';
        const counsellorName = row.counsellorName || 'Unassigned';

        if (!groupedBySupervisor[supervisorName]) {
          groupedBySupervisor[supervisorName] = {
            supervisorName,
            leadsAssigned: 0,
            attempted: 0,
            within15: 0,
            min1530: 0,
            gt30: 0,
            counsellors: []
          };
        }

        groupedBySupervisor[supervisorName].counsellors.push(row);
        groupedBySupervisor[supervisorName].leadsAssigned += row.leadsAssigned;
        groupedBySupervisor[supervisorName].attempted += row.attempted;
        groupedBySupervisor[supervisorName].within15 += row.within15;
        groupedBySupervisor[supervisorName].min1530 += row.min1530;
        groupedBySupervisor[supervisorName].gt30 += row.gt30;
      }
    });

    // Calculate percentages for supervisor groups
    Object.values(groupedBySupervisor).forEach(supervisorGroup => {
      const leadsAssigned = supervisorGroup.leadsAssigned;
      supervisorGroup.percAttempted = leadsAssigned > 0 ? ((supervisorGroup.attempted / leadsAssigned) * 100).toFixed(0) + '%' : '0%';
      supervisorGroup.perc15 = leadsAssigned > 0 ? ((supervisorGroup.within15 / leadsAssigned) * 100).toFixed(0) + '%' : '0%';
      supervisorGroup.perc30 = leadsAssigned > 0 ? ((supervisorGroup.min1530 / leadsAssigned) * 100).toFixed(0) + '%' : '0%';
      supervisorGroup.percGt30 = leadsAssigned > 0 ? ((supervisorGroup.gt30 / leadsAssigned) * 100).toFixed(0) + '%' : '0%';
    });

    // Convert to array
    const hierarchicalResult = Object.values(groupedBySupervisor).map(supervisorGroup => ({
      ...supervisorGroup,
      counsellors: supervisorGroup.counsellors.sort((a, b) => {
        if (a.counsellorName === 'Unassigned') return 1;
        if (b.counsellorName === 'Unassigned') return -1;
        return (a.counsellorName || '').localeCompare(b.counsellorName || '');
      })
    })).sort((a, b) => a.supervisorName.localeCompare(b.supervisorName));

    // Prepare response
    const response = {
      success: true,
      rows,
      groupedBySupervisor: group_by !== 'hour' ? hierarchicalResult : null,
      groupBy: group_by,
      summary: {
        totalLeadsAssigned: rows.reduce((sum, row) => sum + row.leadsAssigned, 0),
        totalAttempted: rows.reduce((sum, row) => sum + row.attempted, 0),
        totalSupervisors: group_by !== 'hour' ? Object.keys(groupedBySupervisor).length : 0,
        totalCounsellors: rows.length
      }
    };

    // Add note for analysers
    if (isAnalyser) {
      response.summary.note = 'Data includes only Facebook leads';
      response.summary.dataFilter = 'Facebook leads only';

      // Override any source parameter in the response
      if (source) {
        response.summary.originalSourceParam = source;
        response.summary.note += ` (Original source parameter "${source}" was ignored)`;
      }
    }

    res.json(response);
  } catch (err) {
    console.error('Error in getLeadAttemptTimeReport:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};
export const getLeadAttemptTimeReportRawData = async (req, res) => {
  try {
    const { date_start, date_end, source, group_by = 'detailed' } = req.query;

    // Convert dates to IST timezone consistently
    const getISTDate = (dateString, time) => {
      const date = new Date(`${dateString}T${time}+05:30`); // IST offset
      return date.toISOString(); // Convert to UTC ISO string
    };

    let whereConditions = [];
    let queryParams = {};

    if (date_start) {
      whereConditions.push(`s.created_at >= $date_start`);
      queryParams.date_start = getISTDate(date_start, '00:00:00');
    }
    if (date_end) {
      whereConditions.push(`s.created_at <= $date_end`);
      queryParams.date_end = getISTDate(date_end, '23:59:59');
    }
    if (source) {
      whereConditions.push(`s.source = $source`);
      queryParams.source = source;
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Query to get detailed student data with first attempt time
    const query = `
      WITH student_first_remark AS (
        SELECT 
          sr.student_id,
          MIN(sr.created_at) as first_remark_time
        FROM student_remarks sr
        GROUP BY sr.student_id
      ),
      lead_attempt_data AS (
        SELECT
          s.student_id,
          s.student_name,
          s.student_phone,
          s.student_email,
          s.source,
          s.created_at as lead_created_time,
          s.assigned_counsellor_id,
          COALESCE(c.counsellor_name, 'Unassigned') as counsellor_name,
          COALESCE(sup.counsellor_name, 'No Supervisor') as supervisor_name,
          sfr.first_remark_time,
          EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 as attempt_minutes,
        CASE 
  WHEN sfr.first_remark_time IS NULL THEN 'Not Attempted'
  WHEN EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 < 15 THEN 'Within 15 mins'
  WHEN EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 >= 15 
       AND EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 < 30 THEN '15-30 mins'
  WHEN EXTRACT(EPOCH FROM (sfr.first_remark_time - s.created_at))/60 >= 30 THEN 'After 30 mins'
  ELSE 'Not Attempted'
END as attempt_category
        FROM students s
        LEFT JOIN student_first_remark sfr ON s.student_id = sfr.student_id
        LEFT JOIN counsellors c ON s.assigned_counsellor_id = c.counsellor_id
        LEFT JOIN counsellors sup ON c.assigned_to = sup.counsellor_id
        ${whereClause}
        ORDER BY s.created_at DESC
      )
      SELECT * FROM lead_attempt_data
    `;

    const results = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
      bind: queryParams
    });

    // Format the data for response
    const formatISTDate = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };

    const formatTimeOnly = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const formatDateOnly = (dateString) => {
      if (!dateString) return '';
      const date = new Date(dateString);
      return date.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    };

    const detailedData = results.map(row => {
      const attemptMinutes = row.attempt_minutes ? Math.round(row.attempt_minutes * 100) / 100 : null;

      return {
        student_id: row.student_id,
        student_name: row.student_name || '',
        phone: row.student_phone || '',
        email: row.student_email || '',
        source: row.source || '',
        counsellor_name: row.counsellor_name || 'Unassigned',
        supervisor_name: row.supervisor_name || 'No Supervisor',
        lead_date: formatDateOnly(row.lead_created_time),
        lead_time: formatTimeOnly(row.lead_created_time),
        lead_datetime: formatISTDate(row.lead_created_time),
        first_attempt_date: formatDateOnly(row.first_remark_time),
        first_attempt_time: formatTimeOnly(row.first_remark_time),
        first_attempt_datetime: formatISTDate(row.first_remark_time),
        attempt_minutes: attemptMinutes,
        attempt_category: row.attempt_category || 'Not Attempted',
        status: row.first_remark_time ? 'Attempted' : 'Not Attempted'
      };
    });

    // Create aggregated response based on group_by parameter
    let response;

    if (group_by === 'counsellor') {
      // Group by counsellor with supervisor
      const counsellorSummary = {};

      detailedData.forEach(row => {
        const key = `${row.counsellor_name}|${row.supervisor_name}`;

        if (!counsellorSummary[key]) {
          counsellorSummary[key] = {
            counsellor_name: row.counsellor_name,
            supervisor_name: row.supervisor_name,
            total_leads: 0,
            attempted: 0,
            not_attempted: 0,
            within_15: 0,
            min_15_30: 0,
            after_30: 0,
            student_ids: [],
            students: []
          };
        }

        counsellorSummary[key].total_leads++;
        counsellorSummary[key].student_ids.push(row.student_id);
        counsellorSummary[key].students.push({
          student_id: row.student_id,
          student_name: row.student_name,
          attempt_category: row.attempt_category,
          attempt_minutes: row.attempt_minutes,
          lead_datetime: row.lead_datetime
        });

        if (row.status === 'Attempted') {
          counsellorSummary[key].attempted++;

          if (row.attempt_category === 'Within 15 mins') {
            counsellorSummary[key].within_15++;
          } else if (row.attempt_category === '15-30 mins') {
            counsellorSummary[key].min_15_30++;
          } else if (row.attempt_category === 'After 30 mins') {
            counsellorSummary[key].after_30++;
          }
        } else {
          counsellorSummary[key].not_attempted++;
        }
      });

      // Convert to array and calculate percentages
      const summaryArray = Object.values(counsellorSummary).map(group => ({
        ...group,
        perc_attempted: group.total_leads > 0
          ? ((group.attempted / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_not_attempted: group.total_leads > 0
          ? ((group.not_attempted / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_within_15: group.total_leads > 0
          ? ((group.within_15 / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_15_30: group.total_leads > 0
          ? ((group.min_15_30 / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_after_30: group.total_leads > 0
          ? ((group.after_30 / group.total_leads) * 100).toFixed(1) + '%'
          : '0%'
      }));

      // Group by supervisor
      const supervisorGroups = {};
      summaryArray.forEach(group => {
        const supervisorName = group.supervisor_name || 'No Supervisor';

        if (!supervisorGroups[supervisorName]) {
          supervisorGroups[supervisorName] = {
            supervisor_name: supervisorName,
            total_leads: 0,
            attempted: 0,
            not_attempted: 0,
            within_15: 0,
            min_15_30: 0,
            after_30: 0,
            counsellors: []
          };
        }

        supervisorGroups[supervisorName].counsellors.push(group);
        supervisorGroups[supervisorName].total_leads += group.total_leads;
        supervisorGroups[supervisorName].attempted += group.attempted;
        supervisorGroups[supervisorName].not_attempted += group.not_attempted;
        supervisorGroups[supervisorName].within_15 += group.within_15;
        supervisorGroups[supervisorName].min_15_30 += group.min_15_30;
        supervisorGroups[supervisorName].after_30 += group.after_30;
      });

      // Calculate percentages for supervisor groups
      Object.values(supervisorGroups).forEach(supervisor => {
        supervisor.perc_attempted = supervisor.total_leads > 0
          ? ((supervisor.attempted / supervisor.total_leads) * 100).toFixed(1) + '%'
          : '0%';
        supervisor.perc_within_15 = supervisor.total_leads > 0
          ? ((supervisor.within_15 / supervisor.total_leads) * 100).toFixed(1) + '%'
          : '0%';
      });

      response = {
        success: true,
        group_by: 'counsellor',
        data: {
          supervisors: Object.values(supervisorGroups).map(supervisor => ({
            ...supervisor,
            counsellors: supervisor.counsellors.sort((a, b) => {
              if (a.counsellor_name === 'Unassigned') return 1;
              if (b.counsellor_name === 'Unassigned') return -1;
              return a.counsellor_name.localeCompare(b.counsellor_name);
            })
          })).sort((a, b) => a.supervisor_name.localeCompare(b.supervisor_name)),
          summary: summaryArray
        },
        count: {
          total_leads: detailedData.length,
          total_counsellors: summaryArray.length,
          total_supervisors: Object.keys(supervisorGroups).length
        },
        date_range: date_start && date_end ? `${date_start} to ${date_end}` : 'All dates',
        generated_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };

    } else if (group_by === 'hour') {
      // Group by hour of day
      const hourGroups = {};

      // Define hour buckets
      const hourLabels = {
        'till_9': 'Till 9 AM',
        '9_10': '9:00 - 10:00',
        '10_11': '10:00 - 11:00',
        '11_12': '11:00 - 12:00',
        '12_13': '12:00 - 13:00',
        '13_14': '13:00 - 14:00',
        '14_15': '14:00 - 15:00',
        '15_16': '15:00 - 16:00',
        '16_17': '16:00 - 17:00',
        '17_18': '17:00 - 18:00',
        '18_19': '18:00 - 19:00',
        '19_20': '19:00 - 20:00',
        '20_21': '20:00 - 21:00',
        'after_21': 'After 9 PM'
      };

      // Initialize all hour groups
      Object.keys(hourLabels).forEach(key => {
        hourGroups[key] = {
          hour_range: hourLabels[key],
          total_leads: 0,
          attempted: 0,
          not_attempted: 0,
          within_15: 0,
          min_15_30: 0,
          after_30: 0,
          students: []
        };
      });

      // Group data by hour
      detailedData.forEach(row => {
        const leadTime = row.lead_time;
        let hourKey = 'till_9';

        if (leadTime) {
          const hour = parseInt(leadTime.split(':')[0]);

          if (hour >= 9 && hour < 10) hourKey = '9_10';
          else if (hour >= 10 && hour < 11) hourKey = '10_11';
          else if (hour >= 11 && hour < 12) hourKey = '11_12';
          else if (hour >= 12 && hour < 13) hourKey = '12_13';
          else if (hour >= 13 && hour < 14) hourKey = '13_14';
          else if (hour >= 14 && hour < 15) hourKey = '14_15';
          else if (hour >= 15 && hour < 16) hourKey = '15_16';
          else if (hour >= 16 && hour < 17) hourKey = '16_17';
          else if (hour >= 17 && hour < 18) hourKey = '17_18';
          else if (hour >= 18 && hour < 19) hourKey = '18_19';
          else if (hour >= 19 && hour < 20) hourKey = '19_20';
          else if (hour >= 20 && hour < 21) hourKey = '20_21';
          else if (hour >= 21) hourKey = 'after_21';
        }

        const group = hourGroups[hourKey];
        group.total_leads++;
        group.students.push({
          student_id: row.student_id,
          student_name: row.student_name,
          counsellor_name: row.counsellor_name,
          attempt_category: row.attempt_category,
          lead_time: row.lead_time
        });

        if (row.status === 'Attempted') {
          group.attempted++;

          if (row.attempt_category === 'Within 15 mins') {
            group.within_15++;
          } else if (row.attempt_category === '15-30 mins') {
            group.min_15_30++;
          } else if (row.attempt_category === 'After 30 mins') {
            group.after_30++;
          }
        } else {
          group.not_attempted++;
        }
      });

      // Convert to array and calculate percentages
      const hourArray = Object.values(hourGroups).filter(group => group.total_leads > 0).map(group => ({
        ...group,
        perc_attempted: group.total_leads > 0
          ? ((group.attempted / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_within_15: group.total_leads > 0
          ? ((group.within_15 / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_15_30: group.total_leads > 0
          ? ((group.min_15_30 / group.total_leads) * 100).toFixed(1) + '%'
          : '0%',
        perc_after_30: group.total_leads > 0
          ? ((group.after_30 / group.total_leads) * 100).toFixed(1) + '%'
          : '0%'
      }));

      response = {
        success: true,
        group_by: 'hour',
        data: hourArray,
        count: {
          total_leads: detailedData.length,
          hour_groups: hourArray.length
        },
        date_range: date_start && date_end ? `${date_start} to ${date_end}` : 'All dates',
        generated_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };

    } else {
      // Return detailed data
      response = {
        success: true,
        group_by: 'detailed',
        data: detailedData,
        count: detailedData.length,
        summary: {
          total_leads: detailedData.length,
          attempted: detailedData.filter(d => d.status === 'Attempted').length,
          not_attempted: detailedData.filter(d => d.status === 'Not Attempted').length,
          within_15: detailedData.filter(d => d.attempt_category === 'Within 15 mins').length,
          min_15_30: detailedData.filter(d => d.attempt_category === '15-30 mins').length,
          after_30: detailedData.filter(d => d.attempt_category === 'After 30 mins').length
        },
        date_range: date_start && date_end ? `${date_start} to ${date_end}` : 'All dates',
        generated_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      };
    }

    res.json(response);

  } catch (err) {
    console.error('Error in getLeadAttemptTimeReportRawData:', err);
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};











export const getTrackerReportAnalysis3 = async (req, res) => {
  try {
    const {
      date_start,
      date_end,
      from_date,
      to_date
    } = req.query

    const startDateParam = from_date || date_start
    const endDateParam = to_date || date_end

    if (!startDateParam || !endDateParam) {
      return res.status(400).json({
        success: false,
        message: 'Date range is required (use from_date/to_date or date_start/date_end)'
      })
    }

    const startDate = new Date(startDateParam + 'T00:00:00+05:30')
    const endDate = new Date(endDateParam + 'T23:59:59+05:30')

    const counsellors = await Counsellor.findAll({
      attributes: ['counsellor_id', 'counsellor_name', 'assigned_to'],
      raw: true
    })

    const counsellorMap = {}
    const supervisorCounsellorMap = {}
    const supervisorNameMap = {}

    counsellors.forEach(c => {
      counsellorMap[c.counsellor_id] = c.counsellor_name

      if (c.assigned_to) {
        if (!supervisorCounsellorMap[c.assigned_to]) {
          supervisorCounsellorMap[c.assigned_to] = []
        }
        supervisorCounsellorMap[c.assigned_to].push(c.counsellor_id)

        if (!supervisorNameMap[c.assigned_to] && counsellorMap[c.assigned_to]) {
          supervisorNameMap[c.assigned_to] = counsellorMap[c.assigned_to]
        }
      }
    })

    const firstICCQuery = `
      SELECT DISTINCT ON (sr.student_id)
        sr.student_id,
        sr.counsellor_id,
        sr.created_at as first_icc_at
      FROM student_remarks sr
      WHERE sr.lead_sub_status = 'Initial Counseling Completed'
      ORDER BY sr.student_id, sr.created_at ASC
    `

    const firstICCRecords = await sequelize.query(firstICCQuery, {
      type: sequelize.QueryTypes.SELECT
    })

    const startMs = startDate.getTime()
    const endMs = endDate.getTime()

    const firstICCInRange = firstICCRecords.filter(r => {
      const ts = new Date(r.first_icc_at).getTime()
      return ts >= startMs && ts <= endMs
    })

    const counsellorICCMap = {}
    const studentIdsSet = new Set()

    firstICCInRange.forEach(record => {
      const counsellorId = record.counsellor_id
      if (!counsellorId) return

      if (!counsellorICCMap[counsellorId]) {
        counsellorICCMap[counsellorId] = {
          studentIds: [],
          count: 0
        }
      }

      if (!studentIdsSet.has(record.student_id)) {
        counsellorICCMap[counsellorId].studentIds.push(record.student_id)
        counsellorICCMap[counsellorId].count++
        studentIdsSet.add(record.student_id)
      }
    })

    const allStudentIds = Array.from(studentIdsSet)

    let studentsDetails = []
    if (allStudentIds.length > 0) {
      studentsDetails = await Student.findAll({
        where: {
          student_id: { [Op.in]: allStudentIds }
        },
        attributes: [
          'student_id',
          'student_age',
          'objective',
          'highest_degree',
          'completion_year',
          'current_profession',
          'current_role',
          'work_experience',
          'preferred_budget',
          'preferred_degree',
          'preferred_level',
          'preferred_specialization',
          'student_current_city',
          'student_current_state'
        ],
        raw: true
      })
    }

    const studentDetailsMap = {}
    studentsDetails.forEach(student => {
      studentDetailsMap[student.student_id] = student
    })

    const attributeKeys = [
      'student_age', 'objective', 'highest_degree', 'completion_year',
      'current_profession', 'current_role', 'work_experience', 'preferred_budget',
      'preferred_degree', 'preferred_level', 'preferred_specialization',
      'student_current_city', 'student_current_state'
    ]

    const counsellorAttributeCounts = {}

    Object.keys(counsellorICCMap).forEach(counsellorId => {
      const counsellorICC = counsellorICCMap[counsellorId]
      const attributeCounts = {}

      attributeKeys.forEach(key => {
        attributeCounts[key] = {
          'Has Data': 0,
          percentage: 0
        }
      })

      counsellorICC.studentIds.forEach(studentId => {
        const student = studentDetailsMap[studentId]
        if (!student) return

        attributeKeys.forEach(attribute => {
          let value = student[attribute]

          if (Array.isArray(value)) {
            value = value.length > 0 ? value[0] : null
          }

          if (value !== null && value !== undefined && value !== '' && value !== 0) {
            attributeCounts[attribute]['Has Data']++
          }
        })
      })

      attributeKeys.forEach(attribute => {
        const hasDataCount = attributeCounts[attribute]['Has Data'] || 0
        const totalStudents = counsellorICC.count

        attributeCounts[attribute].percentage = totalStudents > 0
          ? Math.round((hasDataCount / totalStudents) * 100)
          : 0
      })

      const totalAttributes = attributeKeys.length
      const totalPercentageSum = attributeKeys.reduce((sum, attr) =>
        sum + attributeCounts[attr].percentage, 0
      )
      const overallPercentage = totalAttributes > 0
        ? Math.round(totalPercentageSum / totalAttributes)
        : 0

      counsellorAttributeCounts[counsellorId] = {
        attributeCounts,
        overallPercentage
      }
    })

    const supervisorGroupsMap = {}

    Object.keys(counsellorICCMap).forEach(counsellorId => {
      let supervisorId = null
      let supervisorName = 'No Supervisor'

      for (const [supId, counsellorIds] of Object.entries(supervisorCounsellorMap)) {
        if (counsellorIds.includes(counsellorId)) {
          supervisorId = supId
          supervisorName = supervisorNameMap[supId] || 'Unknown Supervisor'
          break
        }
      }

      if (!supervisorGroupsMap[supervisorId]) {
        supervisorGroupsMap[supervisorId] = {
          supervisorId: supervisorId || 'none',
          supervisorName,
          supervisorTotalLeads: 0,
          counsellors: []
        }
      }

      const counsellorName = counsellorMap[counsellorId] || 'Unknown Counsellor'
      const iccInfo = counsellorICCMap[counsellorId]
      const counsellorStats = counsellorAttributeCounts[counsellorId] || {}

      const counsellorData = {
        counsellorId,
        counsellorName,
        totalCounsellingLeads: iccInfo.count,
        attributeCounts: counsellorStats.attributeCounts || {},
        overallPercentage: counsellorStats.overallPercentage || 0
      }

      supervisorGroupsMap[supervisorId].counsellors.push(counsellorData)
      supervisorGroupsMap[supervisorId].supervisorTotalLeads += iccInfo.count
    })

    Object.keys(supervisorGroupsMap).forEach(supervisorId => {
      const group = supervisorGroupsMap[supervisorId]

      const supervisorAttributeCounts = {}
      attributeKeys.forEach(key => {
        supervisorAttributeCounts[key] = {
          hasData: 0,
          percentage: 0
        }
      })

      group.counsellors.forEach(c => {
        attributeKeys.forEach(attr => {
          const counts = c.attributeCounts?.[attr] || {}
          const hasData = counts['Has Data'] || 0
          supervisorAttributeCounts[attr].hasData += hasData
        })
      })

      attributeKeys.forEach(attr => {
        const hasData = supervisorAttributeCounts[attr].hasData
        supervisorAttributeCounts[attr].percentage = group.supervisorTotalLeads > 0
          ? Math.round((hasData / group.supervisorTotalLeads) * 100)
          : 0
      })

      const totalAttrPercentage = attributeKeys.reduce(
        (sum, attr) => sum + supervisorAttributeCounts[attr].percentage,
        0
      )

      group.supervisorAttributeCounts = supervisorAttributeCounts
      group.supervisorTotalPercentage = attributeKeys.length > 0
        ? Math.round(totalAttrPercentage / attributeKeys.length)
        : 0
    })

    Object.values(supervisorGroupsMap).forEach(group => {
      group.counsellors.sort((a, b) => b.totalCounsellingLeads - a.totalCounsellingLeads)
    })

    const supervisorGroups = Object.values(supervisorGroupsMap)
    supervisorGroups.sort((a, b) => {
      if (a.supervisorName === 'No Supervisor') return 1
      if (b.supervisorName === 'No Supervisor') return -1
      return a.supervisorName.localeCompare(b.supervisorName)
    })

    const response = {
      success: true,
      dateRange: {
        start: startDateParam,
        end: endDateParam
      },
      totalFirstTimeICCLeads: allStudentIds.length,
      supervisorGroups,
      summary: {
        totalSupervisors: supervisorGroups.length,
        totalCounsellors: Object.keys(counsellorICCMap).length,
        totalFirstTimeICCLeads: allStudentIds.length,
        note: allStudentIds.length === 0
          ? 'No first time ICC leads found in the selected date range'
          : ''
      },
      generatedAt: new Date().toISOString()
    }

    res.json(response)

  } catch (err) {
    console.error('Error in getTrackerReportAnalysis3:', err)
    res.status(500).json({
      success: false,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    })
  }
}





export const bulkInsertCourseStatus = async (req, res) => {
  try {
    const  courseStatusList  = req.body; // Expecting an array of objects

    if (!Array.isArray(courseStatusList) || courseStatusList.length === 0) {
      return res.status(400).json({ success: false, message: 'courseStatusList must be a non-empty array' });
    }

    // Bulk create with "updateOnDuplicate" to avoid unique index conflicts
    const insertedRecords = await CourseStatus.bulkCreate(courseStatusList, {
      updateOnDuplicate: ['latest_course_status', 'is_shortlisted', 'college_api_sent_status', 'updated_at']
    });

    return res.status(200).json({
      success: true,
      message: `${insertedRecords.length} records inserted/updated successfully`,
      data: insertedRecords
    });
  } catch (error) {
    console.error('Bulk insert error:', error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};