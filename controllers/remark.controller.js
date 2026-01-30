import { StudentRemark, Student, Counsellor, StudentLeadActivity, sequelize } from '../models/index.js';
import { Op, fn, literal, col } from 'sequelize';
import pMap from 'p-map';
export const createRemark = async (data) => {
  const requiredFields = [
    'student_id',
    'lead_status',
    'lead_sub_status',
    'calling_status',
    'lead_sub_status',
    'remarks'
  ];

  const missingFields = requiredFields.filter(field => !data[field]);

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  try {
    const newRemark = await StudentRemark.create({
      student_id: data.student_id,
      counsellor_id: data.counsellor_id,
      supervisor_id: data.supervisor_id,
      lead_status: data.lead_status,
      lead_sub_status: data.lead_sub_status,
      calling_status: data.calling_status,
      sub_calling_status: data.sub_calling_status,
      remarks: data.remarks,
      callback_date: data.callback_date || null,
      callback_time: data.callback_time || null,
      feesAmount:data.feesAmount
    });

    return newRemark;
  } catch (error) {
    throw new Error(`Failed to create remark: ${error.message}`);
  }
};
export const getConnectedCallsAnalysis = async (req, res) => {
  try {
    const { from, to, counsellors } = req.query;
    const userRole = req.user?.role; // Get user role from request
    const isAnalyser = userRole === 'Analyser';

    const counsellor_array = counsellors
      ? counsellors.split(',').map(v => v.trim())
      : null;

    const today = new Date().toISOString().slice(0, 10);
    const fromDate = from || today;
    const toDateRaw = to || today;
    const toDateEnd = new Date(new Date(toDateRaw).setHours(23, 59, 59, 999)).toISOString();

    // Build base WHERE conditions
    let baseWhereCondition = 'WHERE sr.created_at BETWEEN :fromDate AND :toDateEnd';
    let connectedWhereCondition = 'WHERE sr.calling_status = \'Connected\' AND sr.created_at BETWEEN :fromDate AND :toDateEnd';
    console.log("isAnalyser",isAnalyser)
    // Add Facebook filter for analysers
    if (isAnalyser) {
      baseWhereCondition += ` AND s.source = 'FaceBook'`;
      connectedWhereCondition += ` AND s.source = 'FaceBook'`;
    }

    // Add counsellor filter if provided
    if (counsellor_array) {
      baseWhereCondition += ` AND sr.counsellor_id = ANY(ARRAY[:counsellor_array])`;
      connectedWhereCondition += ` AND sr.counsellor_id = ANY(ARRAY[:counsellor_array])`;
    }

    // Query for total remarks rows
    const [totalRemarksRows] = await sequelize.query(
      `
      SELECT
        sr.counsellor_id,
        c.counsellor_name,
        c.assigned_to,
        sup.counsellor_name as supervisor_name
      FROM student_remarks sr
      JOIN counsellors c ON c.counsellor_id = sr.counsellor_id
      LEFT JOIN counsellors sup ON c.assigned_to = sup.counsellor_id
      ${isAnalyser ? 'JOIN students s ON sr.student_id = s.student_id' : ''}
      ${baseWhereCondition}
      GROUP BY sr.counsellor_id, c.counsellor_name, c.assigned_to, sup.counsellor_name
      ORDER BY sup.counsellor_name, c.counsellor_name;
      `,
      {
        replacements: { fromDate, toDateEnd, counsellor_array }
      }
    );

    // Query for connected calls
    const [connectedRows] = await sequelize.query(
      `
      SELECT
        DATE_PART('hour', timezone('Asia/Kolkata', sr.created_at)) AS hour,
        sr.counsellor_id,
        c.counsellor_name,
        c.assigned_to,
        sup.counsellor_name as supervisor_name,
        COUNT(*) AS connected_calls_count
      FROM student_remarks sr
      JOIN counsellors c ON c.counsellor_id = sr.counsellor_id
      LEFT JOIN counsellors sup ON c.assigned_to = sup.counsellor_id
      ${isAnalyser ? 'JOIN students s ON sr.student_id = s.student_id' : ''}
      ${connectedWhereCondition}
      GROUP BY hour, sr.counsellor_id, c.counsellor_name, c.assigned_to, sup.counsellor_name
      ORDER BY sup.counsellor_name, c.counsellor_name, hour;
      `,
      {
        replacements: { fromDate, toDateEnd, counsellor_array }
      }
    );

    // Count total remarks per counsellor with Facebook filter for analysers
    const totalRemarksMap = {};
    for (const row of totalRemarksRows) {
      totalRemarksMap[row.counsellor_id] = {
        name: row.counsellor_name,
        supervisor_name: row.supervisor_name || 'No Supervisor',
        totalRemarks: 0 // Will be calculated separately
      };
    }

    // Get total remarks count per counsellor with Facebook filter for analysers
    const totalRemarksCountQuery = `
      SELECT
        sr.counsellor_id,
        COUNT(*) AS total_remarks_count
      FROM student_remarks sr
      ${isAnalyser ? 'JOIN students s ON sr.student_id = s.student_id' : ''}
      WHERE sr.created_at BETWEEN :fromDate AND :toDateEnd
        ${isAnalyser ? `AND s.source = 'FaceBook'` : ''}
        ${counsellor_array ? `AND sr.counsellor_id = ANY(ARRAY[:counsellor_array])` : ''}
      GROUP BY sr.counsellor_id
    `;

    const [totalRemarksCountRows] = await sequelize.query(
      totalRemarksCountQuery,
      {
        replacements: { fromDate, toDateEnd, counsellor_array }
      }
    );

    // Update total remarks count
    for (const row of totalRemarksCountRows) {
      if (totalRemarksMap[row.counsellor_id]) {
        totalRemarksMap[row.counsellor_id].totalRemarks = parseInt(row.total_remarks_count, 10);
      }
    }

    const grouped = {};
    for (const row of connectedRows) {
      const hour = parseInt(row.hour, 10);
      if (hour < 9 || hour > 19) continue;

      const counsellorId = row.counsellor_id;
      const counsellorName = row.counsellor_name;
      const supervisorName = row.supervisor_name || 'No Supervisor';
      const count = parseInt(row.connected_calls_count, 10);
      const totalRemarks = totalRemarksMap[counsellorId]?.totalRemarks || 0;

      const key = `${supervisorName}|${counsellorId}`; // Unique key with supervisor + counsellor

      if (!grouped[key]) {
        grouped[key] = {
          counsellorId,
          counsellorName,
          supervisorName,
          totalConnectedCalls: 0,
          totalRemarks: totalRemarks,
          timeSlots: {}
        };
      }

      const slotLabel = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1)
        .toString()
        .padStart(2, '0')}:00`;

      grouped[key].totalConnectedCalls += count;

      if (!grouped[key].timeSlots[slotLabel]) {
        grouped[key].timeSlots[slotLabel] = { count: 0 };
      }
      grouped[key].timeSlots[slotLabel].count += count;
    }

    const currentTimeInIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const currentHour = new Date(currentTimeInIST).getHours();

    let finalResult = Object.entries(grouped).map(([key, data]) => {
      const total = data.totalConnectedCalls;
      const totalRemarks = data.totalRemarks;
      const totalPercentage = totalRemarks > 0 ? Math.round((total / totalRemarks) * 10000) / 100 : 0;

      const timeSlots = Object.entries(data.timeSlots).reduce((acc, [label, val]) => {
        const slotHour = parseInt(label.split(':')[0], 10);

        if (slotHour > currentHour) {
          acc[label] = { count: "-", percentage: "-" };
        } else {
          acc[label] = {
            count: val.count,
            percentage: total > 0 ? Math.round((val.count / total) * 10000) / 100 : 0
          };
        }
        return acc;
      }, {});

      return {
        counsellorId: data.counsellorId,
        counsellorName: data.counsellorName,
        supervisorName: data.supervisorName,
        totalConnectedCalls: total,
        totalRemarks,
        totalPercentage,
        timeSlots
      };
    });

    // Sort by supervisor name first, then by counsellor name
    finalResult = finalResult.sort((a, b) => {
      const supervisorCompare = a.supervisorName.localeCompare(b.supervisorName);
      if (supervisorCompare !== 0) return supervisorCompare;
      return a.counsellorName.localeCompare(b.counsellorName);
    });

    // Group by supervisor for hierarchical response
    const groupedBySupervisor = {};
    finalResult.forEach(item => {
      const supervisorName = item.supervisorName;
      if (!groupedBySupervisor[supervisorName]) {
        groupedBySupervisor[supervisorName] = {
          supervisorName,
          totalConnectedCalls: 0,
          totalRemarks: 0,
          counsellors: []
        };
      }
      groupedBySupervisor[supervisorName].counsellors.push(item);
      groupedBySupervisor[supervisorName].totalConnectedCalls += item.totalConnectedCalls;
      groupedBySupervisor[supervisorName].totalRemarks += item.totalRemarks;
    });

    // Calculate percentage for each supervisor group
    Object.values(groupedBySupervisor).forEach(supervisorGroup => {
      supervisorGroup.totalPercentage = supervisorGroup.totalRemarks > 0 
        ? Math.round((supervisorGroup.totalConnectedCalls / supervisorGroup.totalRemarks) * 10000) / 100 
        : 0;
    });

    // Convert to array
    const hierarchicalResult = Object.values(groupedBySupervisor).map(supervisorGroup => ({
      ...supervisorGroup,
      counsellors: supervisorGroup.counsellors.sort((a, b) => a.counsellorName.localeCompare(b.counsellorName))
    }));

    // Prepare response
    const response = {
      success: true,
      data: finalResult, // Flat structure
      groupedBySupervisor: hierarchicalResult, // Hierarchical structure
      totalRecords: finalResult.length,
      totalSupervisors: Object.keys(groupedBySupervisor).length,
      summary: {
        totalConnectedCalls: finalResult.reduce((sum, item) => sum + item.totalConnectedCalls, 0),
        totalRemarks: finalResult.reduce((sum, item) => sum + item.totalRemarks, 0),
        overallPercentage: finalResult.reduce((sum, item) => sum + item.totalRemarks, 0) > 0
          ? Math.round((finalResult.reduce((sum, item) => sum + item.totalConnectedCalls, 0) / 
                       finalResult.reduce((sum, item) => sum + item.totalRemarks, 0)) * 10000) / 100
          : 0
      }
    };

    // Add note for analysers
    if (isAnalyser) {
      response.note = 'Data includes only Facebook leads';
      response.dataFilter = 'Facebook leads only';
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching connected calls analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};






export const getRemarkByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;

    const remarks = await StudentRemark.findAll({
      where: { student_id: studentId },
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Student,
          attributes: ['student_id', 'student_name', 'student_email']
        },
        {
          model: Counsellor,
          attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
        }
      ]
    });
    res.status(200).json({
      success: true,
      data: remarks
    });
  } catch (error) {
    console.error('Error fetching student remarks:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Additional controller functions for better functionality

export const createRemarkController = async (req, res) => {
  try {
    const remarkData = req.body;
    console.log(remarkData)
    const newRemark = await createRemark(remarkData);

    res.status(201).json({
      success: true,
      message: 'Remark created successfully',
      data: newRemark
    });
  } catch (error) {
    console.error('Error creating remark:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllRemarks = async (req, res) => {
  try {
    const { page = 1, limit = 10, studentId, counsellorId, leadStatus } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (studentId) whereClause.student_id = studentId;
    if (counsellorId) whereClause.counsellor_id = counsellorId;
    if (leadStatus) whereClause.lead_status = leadStatus;

    const { count, rows } = await StudentRemark.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Student,
          attributes: ['student_id', 'student_name', 'student_email', 'student_phone']
        },
        {
          model: Counsellor,
          attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
        }
      ]
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
    console.error('Error fetching all remarks:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getRemarkById = async (req, res) => {
  try {
    const { remarkId } = req.params;

    const remark = await StudentRemark.findByPk(remarkId, {
      include: [
        {
          model: Student,
          attributes: ['student_id', 'student_name', 'student_email', 'student_phone']
        },
        {
          model: Counsellor,
          attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
        }
      ]
    });

    if (!remark) {
      return res.status(404).json({
        success: false,
        message: 'Remark not found'
      });
    }

    res.status(200).json({
      success: true,
      data: remark
    });
  } catch (error) {
    console.error('Error fetching remark by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const updateRemark = async (req, res) => {
  try {
    const { remarkId } = req.params;
    const updateData = req.body;

    const remark = await StudentRemark.findByPk(remarkId);

    if (!remark) {
      return res.status(404).json({
        success: false,
        message: 'Remark not found'
      });
    }

    // Update fields
    const allowedFields = [
      'lead_status', 'lead_sub_status', 'calling_status',
      'sub_calling_status', 'remarks', 'callback_date', 'callback_time'
    ];

    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        remark[field] = updateData[field];
      }
    });

    await remark.save();

    res.status(200).json({
      success: true,
      message: 'Remark updated successfully',
      data: remark
    });
  } catch (error) {
    console.error('Error updating remark:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const deleteRemark = async (req, res) => {
  try {
    const { remarkId } = req.params;

    const deleted = await StudentRemark.destroy({
      where: { remark_id: remarkId }
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Remark not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Remark deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting remark:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getRemarksByDateRange = async (req, res) => {
  try {
    const { startDate, endDate, studentId, counsellorId } = req.query;

    const whereClause = {};

    if (startDate && endDate) {
      whereClause.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    if (studentId) whereClause.student_id = studentId;
    if (counsellorId) whereClause.counsellor_id = counsellorId;

    const remarks = await StudentRemark.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Student,
          attributes: ['student_id', 'student_name', 'student_email']
        },
        {
          model: Counsellor,
          attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: remarks
    });
  } catch (error) {
    console.error('Error getting remarks by date range:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getRemarksByStatus = async (req, res) => {
  try {
    const { leadStatus, callingStatus } = req.params;

    const whereClause = {};
    if (leadStatus) whereClause.lead_status = leadStatus;
    if (callingStatus) whereClause.calling_status = callingStatus;

    const remarks = await StudentRemark.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Student,
          attributes: ['student_id', 'student_name', 'student_email', 'student_phone']
        },
        {
          model: Counsellor,
          attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: remarks
    });
  } catch (error) {
    console.error('Error getting remarks by status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

export const getLatestRemarkByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const latestRemark = await StudentRemark.findOne({
      where: { student_id: studentId },
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Student,
          attributes: ['student_id', 'student_name', 'student_email']
        },
        {
          model: Counsellor,
          attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
        }
      ]
    });

    if (!latestRemark) {
      return res.status(404).json({
        success: false,
        message: 'No remarks found for this student'
      });
    }

    res.status(200).json({
      success: true,
      data: latestRemark
    });
  } catch (error) {
    console.error('Error getting latest remark:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};


export const getAnalysisReportSQL = async (req, res) => {
  try {
    const userRole = req.user?.role; // Get user role from request
    const isAnalyser = userRole?.toLowerCase() === 'analyser'; // Case-insensitive check
    
    console.log("User role for analysis report:", userRole, "isAnalyser:", isAnalyser);
    
    const results = await getAnalysisReporthelper(req.query, isAnalyser);
    
    if (!results.success) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }

    const remarks = results?.data;
    const grouped = {};

    for (const row of remarks) {
      const hour = parseInt(row.hour, 10);
      if (hour < 9 || hour > 19) continue;

      const counsellorId = row.counsellorId;
      const count = parseInt(row.count, 10);

      if (!grouped[counsellorId]) {
        grouped[counsellorId] = {
          totalRemarks: 0,
          timeSlots: {},
          counsellor_name: row?.counsellorName,
          supervisor_id: row?.assigned_to || null,
          supervisor_name: row?.supervisor_name || null
        };
      }

      const slotLabel = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1)
        .toString()
        .padStart(2, '0')}:00`;

      grouped[counsellorId].totalRemarks += count;

      if (!grouped[counsellorId].timeSlots[slotLabel]) {
        grouped[counsellorId].timeSlots[slotLabel] = { count: 0 };
      }
      grouped[counsellorId].timeSlots[slotLabel].count += count;
    }

    // Fetch supervisor names if not already in results
    const counsellorIds = Object.keys(grouped);
    
    if (counsellorIds.length > 0) {
      try {
        const supervisorQuery = `
          SELECT 
            c1.counsellor_id,
            c1.assigned_to,
            c2.counsellor_name as supervisor_name
          FROM counsellors c1
          LEFT JOIN counsellors c2 ON c1.assigned_to = c2.counsellor_id
          WHERE c1.counsellor_id IN (:counsellorIds)
        `;
        
        const supervisorResults = await sequelize.query(supervisorQuery, {
          replacements: { counsellorIds },
          type: sequelize.QueryTypes.SELECT
        });

        const supervisorMap = {};
        supervisorResults.forEach(sup => {
          supervisorMap[sup.counsellor_id] = sup.supervisor_name;
        });

        Object.keys(grouped).forEach(counsellorId => {
          if (supervisorMap[counsellorId]) {
            grouped[counsellorId].supervisor_name = supervisorMap[counsellorId];
          }
        });
      } catch (error) {
        console.error('Error fetching supervisor names:', error);
      }
    }

    let finalResult = Object.entries(grouped).map(([counsellorId, data]) => {
      const total = data.totalRemarks;

      const currentTimeInIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const currentHour = new Date(currentTimeInIST).getHours();

      const timeSlots = Object.entries(data.timeSlots).reduce((acc, [label, val]) => {
        const slotHour = parseInt(label.split(':')[0], 10);

        if (slotHour > currentHour) {
          acc[label] = {
            count: "-",
            percentage: "-"
          };
        } else {
          acc[label] = {
            count: val.count,
            percentage: total > 0 ? Math.round((val.count / total) * 10000) / 100 : 0
          };
        }
        return acc;
      }, {});

      return {
        counsellorId: counsellorId,
        counsellorName: data.counsellor_name,
        supervisorId: data.supervisor_id,
        supervisorName: data.supervisor_name || 'No Supervisor',
        totalRemarks: total,
        name: data.counsellor_name,
        timeSlots
      };
    });

    // Sort by supervisor name first, then by counsellor name
    finalResult = finalResult.sort((a, b) => {
      const supervisorCompare = a.supervisorName.localeCompare(b.supervisorName);
      if (supervisorCompare !== 0) return supervisorCompare;
      return a.counsellorName.localeCompare(b.counsellorName);
    });

    // Group by supervisor for hierarchical structure
    const groupedBySupervisor = {};
    finalResult.forEach(item => {
      const supervisorName = item.supervisorName;
      if (!groupedBySupervisor[supervisorName]) {
        groupedBySupervisor[supervisorName] = {
          supervisorName: supervisorName,
          totalRemarks: 0,
          counsellors: []
        };
      }
      groupedBySupervisor[supervisorName].counsellors.push(item);
      groupedBySupervisor[supervisorName].totalRemarks += item.totalRemarks;
    });

    const hierarchicalResult = Object.values(groupedBySupervisor).map(supervisorGroup => ({
      supervisorName: supervisorGroup.supervisorName,
      totalRemarks: supervisorGroup.totalRemarks,
      counsellors: supervisorGroup.counsellors
    }));

    // Prepare response
    const response = {
      success: true,
      data: finalResult,
      groupedBySupervisor: hierarchicalResult,
      totalRecords: finalResult.length,
      totalSupervisors: Object.keys(groupedBySupervisor).length
    };

    // Add note for analysers
    if (isAnalyser) {
      response.note = 'Data includes only Facebook leads';
      response.dataFilter = 'Facebook leads only';
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error generating SQL analysis report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getAnalysisReporthelper = async (query, isAnalyser = false) => {
  try {
    const {
      mode,
      source,
      campaign,
      from,
      to,
      counsellors, sortOrder, sortBy
    } = query;

    console.log("Analysis report query params:", {
      mode, source, campaign, from, to, counsellors, isAnalyser
    });

    const counsellor_array = counsellors
      ? counsellors.split(',').map(v => v.trim())
      : null;

    const today = new Date().toISOString().slice(0, 10);
    const fromDate = from || today;
    const toDateRaw = to || today;
    const toDateEnd = new Date(
      new Date(toDateRaw).setHours(23, 59, 59, 999)
    ).toISOString();

    // For analysers, we need to ensure the source is Facebook-related
    let actualSource = source;
    let actualCampaign = campaign;
    
    if (isAnalyser) {
      // If analyser provides a source, validate it's Facebook-related
      if (source && !source.toLowerCase().includes('facebook') && !source.toLowerCase().includes('fb')) {
        // If analyser tries to use non-Facebook source, override to Facebook
        console.log(`Analyser tried to use source "${source}", overriding to Facebook filter`);
        actualSource = 'FaceBook';
      } else if (!source) {
        // If analyser doesn't specify source, apply Facebook filter
        actualSource = 'FaceBook';
      }
    }

    // Build the SQL query
    let sqlQuery = `
      SELECT
        DATE_PART('hour', timezone('Asia/Kolkata', sr.created_at)) AS hour,
        sr.counsellor_id AS "counsellorId",
        c.counsellor_name AS "counsellorName",
        COUNT(*) AS count
      FROM student_remarks sr
      JOIN counsellors c ON c.counsellor_id = sr.counsellor_id
      JOIN students s ON sr.student_id = s.student_id
      JOIN (
        SELECT DISTINCT ON (student_id) *
        FROM student_lead_activities
        WHERE 1=1
          ${actualSource ? `AND source ILIKE '%' || :actualSource || '%'` : ''}
          ${actualCampaign ? `AND utm_campaign = :actualCampaign` : ''}
          ${isAnalyser && !actualSource ? `AND (source ILIKE '%facebook%' OR source ILIKE '%fb%')` : ''}
        ORDER BY student_id, created_at ASC
      ) la ON la.student_id = sr.student_id
      WHERE sr.created_at BETWEEN :fromDate AND :toDateEnd
        ${mode ? `AND c.counsellor_preferred_mode = :mode` : ''}
        ${counsellor_array ? `AND sr.counsellor_id = ANY(ARRAY[:counsellor_array])` : ''}
    `;

    // Add Facebook student filter for analysers
    if (isAnalyser) {
      sqlQuery += ` AND (s.source ILIKE '%facebook%' OR s.source ILIKE '%fb%')`;
    }

    sqlQuery += `
      GROUP BY hour, sr.counsellor_id, c.counsellor_name
      ORDER BY sr.counsellor_id, hour;
    `;

    console.log("SQL Query for analysis report:", sqlQuery);
    console.log("Query parameters:", {
      fromDate,
      toDateEnd,
      mode,
      actualSource,
      actualCampaign,
      counsellor_array,
      isAnalyser
    });

    const [rows] = await sequelize.query(
      sqlQuery,
      {
        replacements: {
          fromDate,
          toDateEnd,
          mode,
          actualSource,
          actualCampaign,
          counsellor_array
        },
      }
    );

    console.log(`Found ${rows.length} records for analysis report`);
    return { success: true, data: rows };
  } catch (error) {
    console.error('Download analysis report SQL error:', error);
    return { success: false, message: 'Internal server error' };
  }
};




export const getAllRemarksofData = async (req, res) => {
  try {
    const now = new Date();
    const fromDate = new Date(now.setHours(0, 0, 0, 0));

    const wherecondition = {};

    if (fromDate) {
      wherecondition.created_at = {
        [Op.gte]: fromDate
      };
    }
    const remarks = await StudentRemark.findAll({
      where: wherecondition, include: [{ model: Counsellor, as: 'counsellor', attributes: ['counsellor_name'] }]
    })

    const formattedRemarks = await pMap(
      remarks,
      async (item) => {
        return {
          _id: item.remark_id || '',
          student_id: item.student_id,
          agent_id: item.counsellor_id,
          funnel_1: item.lead_status,
          funnel_2: item.lead_sub_status,
          Callng_Status: item.calling_status,
          Sub_Calling_Status: item.sub_calling_status,
          remarks: item.remark || item?.remarks,
          callbackDate: item.callback_date,
          callbackTime: item.callback_time,
          updated_at: item.created_at || item?.updated_at,

        };
      },
      { concurrency: 10 }
    );

    res.status(200).json(formattedRemarks);
  } catch (error) {
    console.error("Error in getAllRemarksofData:", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
import { formatDate } from './studentcoursestatus.controller.js'
export const downloadAnalysisReport = async (req, res) => {
  try {
    const { mode, role = 'L2', source, campaign, from, to, counsellorName } = req.query;
    const results = await getAnalysisReporthelper(req.query)

    if (!results.success) {
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
    const remarks = results?.data

    const grouped = {};
    for (const row of remarks) {
      const hour = parseInt(row.hour, 10);
      if (hour < 9 || hour > 19) continue;

      const counsellorId = row.counsellorId;
      const count = parseInt(row.count, 10);

      if (!grouped[counsellorId]) {
        grouped[counsellorId] = {
          totalRemarks: 0,
          timeSlots: {}
        };
      }

      const slotLabel = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 1)
        .toString()
        .padStart(2, '0')}:00`;

      grouped[counsellorId].totalRemarks += count;

      if (!grouped[counsellorId].timeSlots[slotLabel]) {
        grouped[counsellorId].timeSlots[slotLabel] = { count: 0 };
      }

      grouped[counsellorId].timeSlots[slotLabel].count += count;
    }

    console.log(grouped)
    // Add percentages
    const finalResult = Object.entries(grouped).map(([counsellorId, data]) => {
      const total = data.totalRemarks;
      const timeSlots = Object.entries(data.timeSlots).reduce(
        (acc, [label, val]) => {
          acc[label] = {
            count: val.count,
            percentage: Math.round((val.count / total) * 10000) / 100
          };
          return acc;
        },
        {}
      );
      return {
        counsellorName: counsellorId,
        totalRemarks: total,
        timeSlots
      };
    });

    finalResult.sort((a, b) =>
      a.counsellorName.localeCompare(b.counsellorName)
    );
    res.status(200).json({
      success: true,
      totalRecords: finalResult.length,
      success: true,
      data: finalResult
    });
  } catch (error) {
    console.error('Error generating SQL analysis report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};





export const bulkCreateStudentRemarks = async (req, res) => {
  try {
    const remarks = req.body;

    if (!Array.isArray(remarks) || remarks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Body must be a non-empty array'
      });
    }

    const cleanValue = (val) => {
      if (val === 'NULL' || val === '' || val === undefined) return null;
      return val;
    };

    const preparedData = remarks.map((r) => ({
      remark_id: Number(r.remark_id),
      student_id: r.student_id,
      counsellor_id: r.counsellor_id,
      supervisor_id: cleanValue(r.supervisor_id),

      lead_status: r.lead_status,
      lead_sub_status: r.lead_sub_status,
      calling_status: r.calling_status,
      sub_calling_status: r.sub_calling_status,
      remarks: r.remarks,

      callback_date:
        r.callback_date && r.callback_date !== 'NULL'
          ? new Date(r.callback_date)
          : null,

      callback_time: cleanValue(r.callback_time),

      isdisabled:
        r.isdisabled === 'TRUE'
          ? true
          : r.isdisabled === 'FALSE'
          ? false
          : false,

      feesAmount: Number(r.feesAmount) || 0,

      created_at: r.created_at ? new Date(r.created_at) : new Date(),
      updated_at: r.updated_at ? new Date(r.updated_at) : new Date(),
    }));

    const inserted = await StudentRemark.bulkCreate(preparedData, {
      validate: true,
      ignoreDuplicates: true
    });

    return res.status(201).json({
      success: true,
      inserted: inserted.length
    });

  } catch (error) {
    console.error('Bulk remark create error:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
