import { StudentCollegeApiSentStatus, UniversityCourse, CourseStatus, Student, Counsellor, StudentLeadActivity, sequelize } from '../models/index.js';
import { Op, Sequelize } from 'sequelize';

export const createCollegeApiSentStatus = async ({
  collegeName,
  status,
  studentId,
  requestToApi = {},
  responseFromApi = {},
  requestHeaderToApi = {},
  responseHeaderFromApi = {},
  sendType = 'manual',
  studentEmail = null,
  studentPhone = null,
  isPrimary = true
}) => {
  try {
    const course_ids = await Promise.all([
      UniversityCourse.findAll({ where: { university_name: collegeName }, attributes: ['course_id'] }),
    ]);
    const student = await Student.findByPk(studentId);
    if (!student) {
      console.error("Student not found for ID:", studentId);
      return;
    }
    const flatCourseIds = course_ids.flat().map(course => course.course_id);

    const existingEntry = await StudentCollegeApiSentStatus.findOne({
      where: {
        [Op.and]: [
          { college_name: collegeName },
          { student_id: studentId },
          { student_email: studentEmail || student.student_email },
          { student_phone: studentPhone || student.student_phone },
          { isPrimary: isPrimary }
        ],
      },
    });

    if (existingEntry) {
      if (existingEntry.api_sent_status === 'Proceed' && status !== 'Proceed') {
        await updatedIncourseStatus(status, flatCourseIds, studentId);

        return {
          message: 'Status is already "Proceed" and cannot be changed',
          updated: false,
          data: existingEntry,
        };
      }


      existingEntry.api_sent_status = status;
      if (requestToApi) existingEntry.request_to_api = requestToApi;
      if (responseFromApi) existingEntry.response_from_api = responseFromApi;
      if (requestHeaderToApi) existingEntry.request_header_to_api = requestHeaderToApi;
      if (responseHeaderFromApi) existingEntry.response_header_from_api = responseHeaderFromApi;
      existingEntry.sent_type = sendType;

      await existingEntry.save();
      if (isPrimary) {
        await updatedIncourseStatus(status, flatCourseIds, studentId);
      }
      return {
        message: 'Status updated successfully',
        updated: true,
        data: existingEntry,
      };
    } else {
      const newEntry = await StudentCollegeApiSentStatus.create({
        college_name: collegeName,
        student_id: studentId,
        student_email: studentEmail || student.student_email,
        student_phone: studentPhone || student.student_phone,
        isPrimary: isPrimary,
        api_sent_status: status,
        request_to_api: requestToApi,
        response_from_api: responseFromApi,
        request_header_to_api: requestHeaderToApi,
        response_header_from_api: responseHeaderFromApi,
        sent_type: sendType
      });
      if (isPrimary) {
        await updatedIncourseStatus(status, flatCourseIds, studentId);
      }
      return {
        message: 'Status created successfully',
        updated: false,
        data: newEntry,
      };
    }
  } catch (error) {
    console.error('Error in createCollegeApiSentStatus:', error);
    throw new Error('Failed to create or update College API sent status');
  }
};
async function updatedIncourseStatus(status, course_ids, studentId) {
  if (!course_ids || course_ids.length === 0) {
    throw new Error('No course IDs provided for updating status');
  }
  try {
    const [updated] = await CourseStatus.update(
      { college_api_sent_status: status },
      {
        where: {
          course_id: { [Op.in]: course_ids },
          is_shortlisted: true,
          student_id: studentId,
        },
      }
    );
    return updated;
  } catch (error) {
    console.error('Error updating course status:', error.message);
    throw error;
  }
}

export const getCollegeApiSentStatus = async ({ collegeName, studentId }) => {
  if (!collegeName || !studentId) {
    throw new Error('collegeName and studentId are required');
  }

  const status = await StudentCollegeApiSentStatus.findOne({
    where: {
      college_name: collegeName,
      student_id: studentId,
    },
  });

  if (!status) {
    const error = new Error('Status not found for the given collegeName and studentId');
    error.statusCode = 404;
    throw error;
  }

  return {
    message: 'Status retrieved successfully',
    data: status,
  };
};

import { QueryTypes } from 'sequelize';

export const getCollegeApiStatusForReport = async (req, res) => {
  try {
    const result = await CollegeApiHelper(req.query);

    if (!result?.success) {
      return res.status(500).json({
        success: false,
        message: 'Server Error',
        error: 'Failed to fetch data from CollegeApiHelper',
      });
    }

    const { stats, totalRecords, currentPage, totalPages, data } = result;

    // Extract college filter from query parameters
    const { collegeFilter } = req.query;

    // If college filter is provided, filter the data and recalculate stats
    if (collegeFilter) {
      // Filter data by college name
      const filteredData = data.filter(item =>
        item.collegeName && item.collegeName.toLowerCase().includes(collegeFilter.toLowerCase())
      );

      // Recalculate stats based on filtered data
      const filteredStats = calculateFilteredStats(filteredData);

      return res.status(200).json({
        success: true,
        stats: filteredStats,
        totalRecords: filteredData.length,
        currentPage: 1, // Reset to first page when filtering
        totalPages: 1, // Single page for filtered results
        data: filteredData,
        appliedFilter: collegeFilter,
        originalTotalRecords: totalRecords // Keep original count for reference
      });
    }

    // Return original data if no filter applied
    return res.status(200).json({
      success: true,
      stats: stats,
      totalRecords: totalRecords,
      currentPage: currentPage,
      totalPages: totalPages,
      data: data,
    });
  } catch (err) {
    console.error('❌ Error in getCollegeApiStatusForReport:', err);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message,
    });
  }
};

// Helper function to calculate stats for filtered data
const calculateFilteredStats = (filteredData) => {
  const statusCounts = {};

  // Count occurrences of each apiSentStatus
  filteredData.forEach(item => {
    const status = item.apiSentStatus || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const total = filteredData.length;
  const stats = [];

  // Calculate percentages and create stats array
  Object.keys(statusCounts).forEach(status => {
    const count = statusCounts[status];
    const percentage = total > 0 ? ((count / total) * 100).toFixed(2) + '%' : '0%';

    stats.push({
      label: status,
      count: count,
      percentage: percentage
    });
  });

  return stats;
};





export const downloadCollegeApiStatus = async (req, res) => {
  try {
    const result = await CollegeApiHelper(req.query)
    if (!result?.success) {
      return res.status(500).json({
        success: false,
        message: 'Server Error',
        error: err.message,
      });
    }
    const {
      stats,
      totalRecords,
      currentPage,
      totalPages,
      data, fullData } = result
    return res.status(200).send({
      success: true,
      stats: stats,
      totalRecords: totalRecords,
      currentPage: currentPage,
      totalPages: totalPages,
      data: fullData,
    })
  }
  catch (err) {
    console.error('❌ Error in getCollegeApiStatusForReport:', err);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message,
    });
  }
};
const CollegeApiHelper = async (param) => {
  try {
    const { from, to, page = 1, limit = 10, roleL2, roleL3 } = param;

    if (roleL2 === 'true' && roleL3 === 'true') {
      return res.status(400).json({
        success: false,
        message: 'Please provide only one role filter at a time (either roleL2 or roleL3)',
      });
    }

    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30);
    const toDateObj = to ? new Date(to) : now;
    toDateObj.setHours(23, 59, 59, 999);

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const baseQuery = `
      SELECT DISTINCT ON (sc.student_id, sc.college_name)
        sc.student_id,
        sc.college_name,
        sc.request_to_api,
        sc.response_from_api,
        sc.request_header_to_api,
        sc.response_header_from_api,
        sc.api_sent_status,
        sc.created_at,
        s.student_name,
        s.student_email,
        c2.counsellor_name AS counsellor_name_l2,
        c3.counsellor_name AS counsellor_name_l3
      FROM student_college_api_sent_status sc
      LEFT JOIN students s ON s.student_id = sc.student_id
      LEFT JOIN counsellors c2 ON c2.counsellor_id = s.assigned_counsellor_id
      LEFT JOIN counsellors c3 ON c3.counsellor_id = s.assigned_counsellor_l3_id
      WHERE sc.created_at BETWEEN :fromDate AND :toDate
      ORDER BY sc.student_id, sc.college_name, sc.created_at DESC
    `;

    const allStats = await sequelize.query(baseQuery, {
      replacements: { fromDate: fromDate, toDate: toDateObj },
      type: QueryTypes.SELECT,
    });

    const totalRecords = allStats.length;

    const fullFormatted = allStats.map(item => ({
      studentId: item.student_id,
      studentName: item.student_name || '',
      collegeName: item.college_name || '',
      requestToApi: item.request_to_api || {},
      responseFromApi: item.response_from_api || {},
      requestHeaderToApi: item.request_header_to_api || {},
      responseHeaderFromApi: item.response_header_from_api || {},
      apiSentStatus: item.api_sent_status || '',
      createdAt: item.created_at,
      counsellorName: item.counsellor_name_l2 || '',
      counsellorNameL3: item.counsellor_name_l3 || '',
    }));
    let stats = [];

    if (roleL2 === 'true') {
      const map = new Map();
      for (const item of fullFormatted) {
        const key = item.counsellorName?.trim() || 'Unknown';
        map.set(key, (map.get(key) || 0) + 1);
      }
      const total = [...map.values()].reduce((a, b) => a + b, 0);
      stats = [...map.entries()].map(([counsellor, count]) => ({
        counsellor,
        count,
        percentage: ((count / total) * 100).toFixed(2) + '%',
      }));
    } else if (roleL3 === 'true') {
      const map = new Map();
      for (const item of fullFormatted) {
        const key = item.counsellorNameL3?.trim() || 'Unknown';
        map.set(key, (map.get(key) || 0) + 1);
      }
      const total = [...map.values()].reduce((a, b) => a + b, 0);
      stats = [...map.entries()].map(([counsellor, count]) => ({
        counsellor,
        count,
        percentage: ((count / total) * 100).toFixed(2) + '%',
      }));
    } else {
      const counters = { success: 0, failure: 0, others: 0 };
      for (const item of fullFormatted) {
        const status = item.apiSentStatus.trim().toLowerCase();
        if (status === 'proceed') {
          counters.success++;
        } else if (status === 'do not proceed' || status === 'failed due to technical issues') {
          counters.failure++;
        } else {
          counters.others++;
        }
      }
      const total = counters.success + counters.failure + counters.others;
      const toPercent = count => total > 0 ? ((count / total) * 100).toFixed(2) + '%' : '0%';
      stats = [
        { label: 'Success', count: counters.success, percentage: toPercent(counters.success) },
        { label: 'Failure', count: counters.failure, percentage: toPercent(counters.failure) },
        { label: 'Others', count: counters.others, percentage: toPercent(counters.others) },
      ];
    }

    const paginated = fullFormatted.slice(offset, offset + parseInt(limit));

    return ({
      success: true,
      stats,
      totalRecords,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalRecords / limit),
      data: paginated,
      fullData: fullFormatted
    });
  }
  catch (e) {
    console({
      success: false
    })
  }
}