import { Op, Sequelize } from 'sequelize';
import { StudentRemark, Counsellor } from '../models/index.js'; // Updated import
import sequelize from '../config/database-config.js';

const POINTS_CONFIG = {
  'Connected': 1,
  'Not Connected': 0.5,
  'Application': 20,
  'Admission': 30,
  'Initial Counseling Completed': 3
};

export const getWeeklyLeaderboard = async (req, res) => {
  try {
    // Add database connection check
    await sequelize.authenticate();
    console.log('Database connection established successfully.');

    const { level, week, year } = req.query;
    console.log('=== LEADERBOARD API DEBUG START ===');
    console.log('Query params received:', { level, week, year });

    const weekDates = getWeekDateRange(week, year);
    const { startDate, endDate } = weekDates;
    console.log('Calculated date range:', { startDate, endDate });

    const counsellorFilter = {};
    if (level && ['l2', 'l3'].includes(level.toLowerCase())) {
      counsellorFilter.role = level.toLowerCase();
    }
    console.log('Counsellor filter:', counsellorFilter);

    // Add timeout and better error handling for Sequelize queries
    const counsellors = await Promise.race([
      Counsellor.findAll({
        where: counsellorFilter,
        attributes: ['counsellor_id', 'counsellor_name', 'role'],
        timeout: 5000 // 5 second timeout
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Query timeout after 5 seconds')), 5000)
      )
    ]);

    console.log(`Found ${counsellors.length} counsellors`);

    if (counsellors.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No counsellors found for the specified level'
      });
    }

    const counsellorIds = counsellors.map(c => c.counsellor_id);
    console.log('Counsellor IDs:', counsellorIds);

    const allRemarks = await Promise.race([
      StudentRemark.findAll({
        where: {
          counsellor_id: { [Op.in]: counsellorIds },
          created_at: { [Op.between]: [startDate, endDate] }
        },
        include: [{
          model: Counsellor,
          as: 'counsellor', // Added alias
          attributes: ['counsellor_name'],
          required: false
        }],
        raw: true,
        nest: true,
        timeout: 10000 // 10 second timeout
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Remarks query timeout after 10 seconds')), 10000)
      )
    ]);

    console.log(`Found ${allRemarks.length} remarks`);

    const counsellorData = {};

    counsellorIds.forEach(counsellorId => {
      counsellorData[counsellorId] = {
        counsellorId,
        counsellorName: '',
        totalRemarks: 0,
        connectedCalls: 0,
        notConnectedCalls: 0,
        initialCounsellingCases: 0,
        uniqueStudentStatuses: new Map(),
        statusBreakdown: []
      };
    });

    allRemarks.forEach(remark => {
      const counsellorId = remark.counsellor_id;
      if (!counsellorData[counsellorId]) return;

      const data = counsellorData[counsellorId];
      
      // Updated reference to use lowercase 'counsellor'
      if (!data.counsellorName && remark.counsellor?.counsellor_name) {
        data.counsellorName = remark.counsellor.counsellor_name;
      }

      data.totalRemarks++;

      if (remark.calling_status === 'Connected') {
        data.connectedCalls++;
      } else if (remark.calling_status === 'Not Connected') {
        data.notConnectedCalls++;
      }

      if (remark.lead_sub_status === 'Initial Counseling Completed') {
        data.initialCounsellingCases++;
      }

      if (remark.lead_status === 'Application' || remark.lead_status === 'Admission') {
        const studentId = remark.student_id;
        const currentStatus = data.uniqueStudentStatuses.get(studentId);
        
        if (!currentStatus) {
          data.uniqueStudentStatuses.set(studentId, remark.lead_status);
        } else if (currentStatus === 'Application' && remark.lead_status === 'Admission') {
          data.uniqueStudentStatuses.set(studentId, remark.lead_status);
        }
      }

      data.statusBreakdown.push({
        leadStatus: remark.lead_status,
        leadSubStatus: remark.lead_sub_status,
        callingStatus: remark.calling_status,
        studentId: remark.student_id
      });
    });

    // Rest of your code remains the same...
    const leaderboardData = Object.values(counsellorData)
      .filter(data => data.totalRemarks > 0)
      .map(data => {
        let applicationCases = 0;
        let admissionCases = 0;
        
        data.uniqueStudentStatuses.forEach(status => {
          if (status === 'Application') applicationCases++;
          else if (status === 'Admission') admissionCases++;
        });

        const totalPoints = 
          (applicationCases * POINTS_CONFIG['Application']) +
          (admissionCases * POINTS_CONFIG['Admission']) +
          (data.initialCounsellingCases * POINTS_CONFIG['Initial Counseling Completed']) +
          (data.connectedCalls * POINTS_CONFIG['Connected']) +
          (data.notConnectedCalls * POINTS_CONFIG['Not Connected']);

        const totalCalls = data.connectedCalls + data.notConnectedCalls;
        const efficiency = totalCalls > 0 ? (data.connectedCalls / totalCalls) * 100 : 0;

        return {
          _id: data.counsellorId,
          counsellorName: data.counsellorName,
          totalRemarks: data.totalRemarks,
          connectedCalls: data.connectedCalls,
          notConnectedCalls: data.notConnectedCalls,
          initialCounsellingCases: data.initialCounsellingCases,
          applicationCases,
          admissionCases,
          totalPoints,
          efficiency,
          statusBreakdown: data.statusBreakdown
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);

    const enhancedLeaderboard = leaderboardData.map((data, index) => {
      const counsellor = counsellors.find(c => c.counsellor_id === data._id);
      const trend = calculateTrend(data.totalPoints, index);
      const streak = Math.floor(Math.random() * 10) + 1;
      const badge = getBadge(data.totalPoints, data.efficiency);

      return {
        counsellorId: data._id,
        name: data.counsellorName || counsellor?.counsellor_name || 'Unknown',
        role: counsellor?.role || 'unknown',
        totalPoints: Math.round(data.totalPoints * 10) / 10,
        applicationCases: data.applicationCases,
        admissionCases: data.admissionCases,
        initialCounsellingCompleted: data.initialCounsellingCases,
        formsCompleted: data.applicationCases + data.admissionCases,
        totalRemarks: data.totalRemarks,
        connectedCalls: data.connectedCalls,
        notConnectedCalls: data.notConnectedCalls,
        efficiency: Math.round(data.efficiency),
        trend: trend,
        streak: streak,
        badge: badge,
        rank: index + 1,
        avatar: generateAvatar(data.counsellorName || counsellor?.counsellor_name || 'Unknown'),
        pointsBreakdown: {
          application: data.applicationCases * POINTS_CONFIG['Application'],
          admission: data.admissionCases * POINTS_CONFIG['Admission'],
          initialCounselling: data.initialCounsellingCases * POINTS_CONFIG['Initial Counseling Completed'],
          connected: data.connectedCalls * POINTS_CONFIG['Connected'],
          notConnected: data.notConnectedCalls * POINTS_CONFIG['Not Connected']
        }
      };
    });

    const summary = calculateSummaryStats(enhancedLeaderboard);

    const response = {
      success: true,
      data: {
        week: {
          weekNumber: parseInt(week) || getCurrentWeek(),
          year: parseInt(year) || new Date().getFullYear(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        },
        leaderboard: level ? enhancedLeaderboard : {
          L2: enhancedLeaderboard.filter(c => c.role === 'l2'),
          L3: enhancedLeaderboard.filter(c => c.role === 'l3')
        },
        summary: summary,
        pointsSystem: POINTS_CONFIG
      }
    };

    console.log('=== LEADERBOARD API SUCCESS ===');
    res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error fetching leaderboard data:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to fetch leaderboard data';
    if (error.message.includes('timeout')) {
      errorMessage = 'Database query timed out. Please try again.';
    } else if (error.name === 'ConnectionError') {
      errorMessage = 'Database connection failed. Please check your database configuration.';
    } else if (error.name === 'SequelizeConnectionError') {
      errorMessage = 'Unable to connect to the database. Please verify your database credentials and connection.';
    }

    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : undefined
    });
  }
};


function getWeekDateRange(week, year) {
  const currentDate = new Date();
  const targetYear = year ? parseInt(year) : currentDate.getFullYear();

  let targetWeek;
  if (week) {
    targetWeek = parseInt(week);
  } else {
    const currentWeek = getCurrentWeek();
    targetWeek = currentWeek - 1;
    if (targetWeek < 1) {
      targetWeek = 52;
      targetYear = targetYear - 1;
    }
  }

  const startOfYear = new Date(targetYear, 0, 1);
  const firstMonday = new Date(startOfYear);
  const dayOfWeek = startOfYear.getDay();
  const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  firstMonday.setDate(startOfYear.getDate() + daysToMonday);

  const startDate = new Date(firstMonday);
  startDate.setDate(firstMonday.getDate() + (targetWeek - 1) * 7);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  endDate.setHours(23, 59, 59, 999);

  return { startDate, endDate };
}

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - start) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + start.getDay() + 1) / 7);
}

function calculateTrend(points, rank) {
  if (points > 25) return 'up';
  if (points < 10) return 'down';
  return Math.random() > 0.5 ? 'up' : 'down';
}

function getBadge(points, efficiency) {
  if (points >= 50 && efficiency >= 95) return '🔥';
  if (points >= 40 && efficiency >= 90) return '⚡';
  if (points >= 30 && efficiency >= 85) return '🎯';
  if (points >= 20 && efficiency >= 80) return '💎';
  if (points >= 10) return '🌟';
  return '🚀';
}

function generateAvatar(name) {
  if (!name) return 'UN';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function calculateSummaryStats(leaderboard) {
  if (leaderboard.length === 0) {
    return {
      totalCounsellors: 0,
      totalApplicationCases: 0,
      totalAdmissionCases: 0,
      totalInitialCounselling: 0,
      totalFormsCompleted: 0,
      totalRemarks: 0,
      avgEfficiency: 0,
      topPerformer: null
    };
  }

  const totalApplicationCases = leaderboard.reduce((sum, c) => sum + c.applicationCases, 0);
  const totalAdmissionCases = leaderboard.reduce((sum, c) => sum + c.admissionCases, 0);
  const totalInitialCounselling = leaderboard.reduce((sum, c) => sum + c.initialCounsellingCompleted, 0);
  const totalFormsCompleted = leaderboard.reduce((sum, c) => sum + c.formsCompleted, 0);
  const totalRemarks = leaderboard.reduce((sum, c) => sum + c.totalRemarks, 0);
  const avgEfficiency = Math.round(
    leaderboard.reduce((sum, c) => sum + c.efficiency, 0) / leaderboard.length
  );

  return {
    totalCounsellors: leaderboard.length,
    totalApplicationCases,
    totalAdmissionCases,
    totalInitialCounselling,
    totalFormsCompleted,
    totalRemarks,
    avgEfficiency,
    topPerformer: leaderboard[0] || null
  };
}