import { Counsellor, Student, counsellorBreak, sequelize } from '../models/index.js';
import bcrypt from 'bcryptjs';
import { generateTokenAndSetCookie } from '../helper/getTimeForCookieExpires.js';
import { Op, fn, col, literal } from 'sequelize';
import { createLeadLog } from './Lead_logs.controller.js'
import { SocketEmitter } from '../helper/leadAssignmentService.js';
import GenerateEmailFunction from '../config/SendLmsEmail.js'
import activityLogger from './supervisorController.js'

export const registerCounsellor = async (req, res) => {
  try {
    const { name, email, password, role, preferredMode, teamOwnerId } = req.body;
    if (!name || !email || !password || !role || !preferredMode || !teamOwnerId) {
      return res.status(400).json({ message: 'Please fill all required fields' });
    }

    const existingCounsellor = await Counsellor.findOne({ where: { counsellor_email: email } });
    if (existingCounsellor) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newCounsellor = await Counsellor.create({
      counsellor_name: name,
      counsellor_email: email,
      counsellor_password: hashedPassword,
      counsellor_role: role,
      role,
      counsellor_preferred_mode: preferredMode,
      assigned_to: teamOwnerId || null
    });

    const token = generateTokenAndSetCookie(res, {
      id: newCounsellor.counsellor_id,
      role: newCounsellor.counsellor_role,
      name: newCounsellor.counsellor_name
    }, 'token');

    res.status(201).json({
      counsellor: newCounsellor
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

export const loginCounsellor = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    console.log('Login attempt:', email);

    const counsellor = await Counsellor.findOne({ where: { counsellor_email: email } });
    if (!counsellor) return res.status(401).json({ message: 'Counsellor Not Found' });

    const isMatch = await bcrypt.compare(password, counsellor.counsellor_password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    // Update last login time
    await Counsellor.update({
      counsellor_last_login: new Date(),
      is_logout: false
    }, {
      where: { counsellor_id: counsellor.counsellor_id }
    });

    const token = generateTokenAndSetCookie(res, {
      id: counsellor.counsellor_id,
      role: counsellor.role,
      name: counsellor.counsellor_name,
      counsellorPreferredMode: counsellor.counsellor_preferred_mode
    }, 'token');

    res.cookie(token);

    const newcouns = {
      id: counsellor.counsellor_id,
      name: counsellor.counsellor_name,
      email: counsellor.counsellor_email,
      phoneNumber: counsellor?.counsellor_phone_number,
      role: counsellor?.role
    }

    res.status(200).json({
      message: 'Login successful',
      counsellor: newcouns
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login error' });
  }
};

export const logoutCounsellor = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (userId) {
      await Counsellor.update({
        is_logout: true
      }, {
        where: { counsellor_id: userId }
      });
    }

    res.clearCookie('token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax'
    });

    res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const logoutFromAllDevices = async (req, res) => {
  try {
    const { id } = req.params;

    await Counsellor.update({
      is_logout: true
    }, {
      where: { counsellor_id: id }
    });

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Error in logoutFromAllDevices:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getUserDetails = async (req, res) => {
  try {
    const userId = req?.user?.id;

    const user = await Counsellor.findByPk(userId, {
      attributes: { exclude: ['counsellor_password'] }
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ user });
  } catch (error) {
    console.error('getUserDetails error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const changePassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  try {
    if (!password) return res.status(400).json({ message: 'Password is required' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const [updated] = await Counsellor.update(
      { counsellor_password: hashedPassword },
      { where: { counsellor_id: id } }
    );

    if (updated === 0) return res.status(404).json({ message: 'Counsellor not found' });
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};


export const getAllCounsellors = async (req, res) => {
  const { role } = req.query;
  const user = req.user;

  try {
    let whereClause = {
      role: { [Op.ne]: 'to' } 
    };

    if (role && role !== 'to') {
      whereClause.role = role;
    }

    if (user?.role === 'to' && user?.id) {
      whereClause.assigned_to = user.id;
    }

    const counsellors = await Counsellor.findAll({
      where: whereClause,
      attributes: { exclude: ['counsellor_password', 'role'] }
    });

    const supervisors = await Counsellor.findAll({
      where: { role: 'to' },
      attributes: ['counsellor_id', 'counsellor_name']
    });

    const supervisorMap = {};
    supervisors.forEach(sup => {
      supervisorMap[sup.counsellor_id] = sup.counsellor_name;
    });

    const formattedCounsellors = counsellors.map(c => {
      const data = c.toJSON();
      return {
        ...data,
        supervisor_name: data.assigned_to
          ? supervisorMap[data.assigned_to] || null
          : null
      };
    });

    res.status(200).json(formattedCounsellors);
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching counsellors',
      error: error.message
    });
  }
};


export const deleteCounsellor = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Counsellor.destroy({ where: { counsellor_id: id } });
    if (!deleted) return res.status(404).json({ message: 'Counsellor not found' });

    res.status(200).json({ message: 'Counsellor deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting counsellor', error });
  }
};

export const updateCounsellorStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    console.log(status, id)
    if (!['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const [updated] = await Counsellor.update(
      { status: status },
      { where: { counsellor_id: id } }
    );

    console.log(': Counsellor not found', updated)

    if (updated === 0) return res.status(404).json({ message: 'Counsellor not found' });
    res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating status', error });
  }
};

export const changeCounsellorPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password: newPassword } = req.body;
    console.log(id, newPassword)
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log(hashedPassword, 'hasedPass')
    console.log(hashedPassword)
    const [updated] = await Counsellor.update(
      { counsellor_password: hashedPassword },
      { where: { counsellor_id: id } }
    );

    if (updated === 0) return res.status(404).json({ message: 'Counsellor not found' });
    res.status(200).json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error changing password', error });
  }
};

export const updateCounsellorPreferredMode = async (req, res) => {
  try {
    const { id } = req.params;
    const { preferredMode } = req.body;
    console.log('id', id)
    if (!['Regular', 'Online'].includes(preferredMode)) {
      return res.status(400).json({ message: 'Invalid preferred mode' });
    }

    const [updated] = await Counsellor.update(
      { counsellor_preferred_mode: preferredMode },
      { where: { counsellor_id: id } }
    );
    if (updated === 0) return res.status(404).json({ message: 'Counsellor not found' });
    res.status(200).json({ message: 'Preferred mode updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating preferred mode', error });
  }
};

export const getCounsellorById = async (req, res) => {
  try {
    const { counsellorId } = req.params;

    const response = await Counsellor.findOne({
      where: { counsellor_id: counsellorId },
      attributes: { exclude: ['counsellor_password'] }
    });

    if (!response) {
      return res.status(404).json({ message: 'Counsellor not found' });
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error in getCounsellorById:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const assignCounsellorsToStudents = async (req, res) => {
  try {
    const { assignmentType, selectedStudents, selectedAgents } = req.body;
    const { supervisorId } = req.user;

    if (
      !['L2', 'L3'].includes(assignmentType) ||
      !Array.isArray(selectedStudents) || selectedStudents.length === 0 ||
      !Array.isArray(selectedAgents) || selectedAgents.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing assignmentType, selectedStudents, or selectedAgents'
      });
    }

    const agentIds = selectedAgents.map(agent => agent.counsellorId);

    const validCounsellors = await Counsellor.findAll({
      where: {
        counsellor_id: { [Op.in]: agentIds },
        role: assignmentType.toLowerCase()
        // status: 'active'
      }
    });

    if (validCounsellors.length !== selectedAgents.length) {
      return res.status(400).json({
        success: false,
        message: `Some agents are invalid or not active ${assignmentType} counsellors`
      });
    }

    const students = await Student.findAll({
      where: { student_id: { [Op.in]: selectedStudents } },
    });

    if (students.length !== selectedStudents.length) {
      return res.status(400).json({
        success: false,
        message: 'Some selected students do not exist'
      });
    }

    // 1️⃣ Create a mapping of studentId -> counsellorId
    const studentCounsellorMap = {};

    const updatePromises = selectedStudents.map((studentId, index) => {
      const { counsellorId, name } = selectedAgents[index % selectedAgents.length];

      // Save mapping for logs later
      studentCounsellorMap[studentId] = counsellorId;

      const updateFields = assignmentType === 'L2'
        ? { assigned_counsellor_id: counsellorId }
        : { assigned_counsellor_l3_id: counsellorId, assigned_l3_date: new Date() };

      SocketEmitter({ student_id: studentId }, {
        counsellor_id: counsellorId,
        counsellor_name: name
      });

      return Student.update(updateFields, {
        where: { student_id: studentId }
      });
    });

    await Promise.all(updatePromises);

    const logPromises = Object.entries(studentCounsellorMap).map(([studentId, counsellorId]) => {
      return createLeadLog({
        studentId,
        assignedCounsellorId: counsellorId,
        assignedBy: supervisorId || req?.user?.id
      });
    });

    await Promise.all(logPromises);


    const updatedStudents = await Student.findAll({
      where: {
        student_id: { [Op.in]: selectedStudents }
      },
      include: [
        {
          model: Counsellor,
          as: 'assignedCounsellorL3',
          attributes: ['counsellor_name', 'counsellor_email']
        },
      ]
    });

    if (assignmentType.toLowerCase() === 'l3') {
      const emailPromises = updatedStudents.map(student => {
        return GenerateEmailFunction({
          id: student.student_id,
          name: student.student_name,
          email: student.student_email,
          phone: student.student_phone,
          timestamp: new Date(),
          asigned_college: student?.course?.collegeName || 'N/A',
          asigned_course: student?.course?.courseName || 'N/A',
          agent_name: student?.assignedCounsellorL3?.counsellor_name,
          agent_email: student?.assignedCounsellorL3?.counsellor_email
        }, [
          student?.assignedCounsellorL3?.counsellor_email
        ]);
      });
      await Promise.all(emailPromises);
    }


    res.status(200).json({
      success: true,
      message: `Assigned ${selectedStudents.length} students to ${selectedAgents.length} ${assignmentType} counsellor(s)`,
      data: {
        assignmentType,
        updatedStudents,
        summary: {
          totalStudents: selectedStudents.length,
          totalCounsellors: selectedAgents.length,
          assignmentDate: new Date()
        }
      }
    });
    await activityLogger(req, {
      success: true,
      message: `Assigned ${selectedStudents.length} students to ${selectedAgents.length} ${assignmentType} counsellor(s)`,
      data: {
        assignmentType,
        updatedStudents,
        summary: {
          totalStudents: selectedStudents.length,
          totalCounsellors: selectedAgents.length,
          assignmentDate: new Date()
        }
      }
    })

  } catch (error) {
    console.error('Error in assignCounsellorsToStudents:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
    await activityLogger(req, {
      success: false,
      message: 'Internal server error',
      error: error
    })
  }
};

export const makeCounsellorLogout = async (req, res) => {
  try {
    const { counsellor_id } = req.params;
    const [updated] = await Counsellor.update(
      {
        is_logout: true
      },
      { where: { counsellor_id: counsellor_id } }
    );
    res.status(200).json({ message: 'Counsellor logged out successfully' });

  } catch (error) {
    console.error('Error in making Logout :', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const start_Counsellors_break = async (req, res) => {
  const { counselor_id, break_start, break_type, break_notes } = req.body;
  console.log(req.body)
  try {
    const row = await counsellorBreak.create({
      counsellor_id: counselor_id,
      break_start: new Date(),
      break_type: break_type,
      notes: break_notes

    })
    res.status(201).send({ success: true, data: row })
  }
  catch (e) {
    console.log(e.message, 'eror')
  }
}

export const end_Counsellors_break = async (req, res) => {
  const { counselor_id, break_end } = req.body;
  console.log(counselor_id, break_end)
  if (!counselor_id) {
    return res.status(400).json({
      success: false,
      message: 'counselor_id is required'
    });
  }

  const transaction = await sequelize.transaction();

  try {
    const activeBreak = await counsellorBreak.findOne({
      where: {
        counsellor_id: counselor_id,
        break_end: null
      },
      order: [['created_at', 'DESC']],
      transaction
    });

    if (!activeBreak) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'No active break found for this counselor'
      });
    }

    const breakEndTime = break_end ? new Date(break_end) : new Date();
    const breakStartTime = new Date(activeBreak.break_start);


    if (breakEndTime <= breakStartTime) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Break end time must be after break start time'
      });
    }

    const durationMs = breakEndTime - breakStartTime;
    const durationMinutes = Math.floor(durationMs / (1000 * 60));
    const durationSeconds = Math.floor(durationMs / 1000);
    const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2);

    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    const formattedDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const [affectedRows] = await counsellorBreak.update(
      {
        break_end: breakEndTime,
        duration: durationMinutes,
        duration_seconds: durationSeconds,
        duration_formatted: formattedDuration,
        updated_at: new Date()
      },
      {
        where: { id: activeBreak.id },
        transaction
      }
    );

    const updatedBreak = await counsellorBreak.findByPk(activeBreak.id, {
      transaction
    });

    await transaction.commit();

    res.status(200).json({
      success: true,
      data: {
        breakRecord: updatedBreak,
        calculatedDuration: {
          milliseconds: durationMs,
          seconds: durationSeconds,
          minutes: durationMinutes,
          hours: parseFloat(durationHours),
          formatted: formattedDuration
        }
      },
      message: `Break ended successfully. Duration: ${formattedDuration}`
    });

  } catch (e) {
    await transaction.rollback();
    console.log(e.message, 'error');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: e.message
    });
  }
};

export const activeBreak = async (req, res) => {
  try {
    const { counsellor_id } = req.params;
    console.log(req.params)
    const activeBreak = await counsellorBreak.findOne({
      where: {
        counsellor_id: counsellor_id,
        break_end: null
      },
      order: [['created_at', 'DESC']]
    });
    console.log('active break', activeBreak)
    res.status(200).json({
      success: true,
      data: activeBreak
    })
  }
  catch (e) {
    console.log(e.message, 'error');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: e.message
    });
  }
}

export const formatBreakDuration = (startTime, endTime) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = end - start;

  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);

  return {
    milliseconds: durationMs,
    seconds: Math.floor(durationMs / 1000),
    minutes: Math.floor(durationMs / (1000 * 60)),
    hours: (durationMs / (1000 * 60 * 60)).toFixed(2),
    formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  };
};

export async function getCounsellorBreakStats(param = {}, userRole = null, userId = null) {
  const parseDate = (dateString, isEndDate = false) => {
    const date = new Date(dateString);
    if (isEndDate) {
      date.setHours(23, 59, 59, 999);
    } else {
      date.setHours(0, 0, 0, 0);
    }
    return date;
  };

  let startDate, endDate;

  if (param.from && param.to) {
    startDate = parseDate(param.from);
    endDate = parseDate(param.to, true);
  } else if (param.from && !param.to) {
    startDate = parseDate(param.from);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  } else if (!param.from && param.to) {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = parseDate(param.to, true);
  } else {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }

  // Build where clause for counsellor inclusion
  const counsellorWhere = {};
  
  // If user is a Team Owner (to), only show counsellors assigned to them
  if (userRole === 'to' && userId) {
    counsellorWhere.assigned_to = userId;
  }

  const stats = await counsellorBreak.findAll({
    attributes: [
      'counsellor_id',
      [fn('COUNT', col('id')), 'no_of_breaks_today'],
      [fn('SUM', col('duration_seconds')), 'total_break_time'],
      [
        // Currently on break within this date range
        literal(`(
          SELECT CASE WHEN EXISTS (
            SELECT 1
            FROM "counsellor_break_logs" cb2
            WHERE cb2.counsellor_id = "counsellorBreak".counsellor_id
              AND cb2.break_end IS NULL
              AND cb2.break_start BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'
          ) THEN TRUE ELSE FALSE END
        )`),
        'currently_on_break'
      ],
      [
        literal(`(
          SELECT row_to_json(cb_last)
          FROM "counsellor_break_logs" cb_last
          WHERE cb_last.counsellor_id = "counsellorBreak".counsellor_id
            AND cb_last.break_start BETWEEN '${startDate.toISOString()}' AND '${endDate.toISOString()}'
          ORDER BY cb_last.break_start DESC
          LIMIT 1
        )`),
        'last_break'
      ]
    ],
    where: {
      break_start: {
        [Op.between]: [startDate, endDate],
      },
    },
    include: [
      {
        model: Counsellor,
        as: 'counsellor_details',
        attributes: ['counsellor_name', 'counsellor_email', 'counsellor_id', 'role', 'assigned_to'],
        where: counsellorWhere, // Apply the filter here
        required: true,
      }
    ],
    group: [
      '"counsellorBreak".counsellor_id',
      'counsellor_details.counsellor_id',
      'counsellor_details.counsellor_name',
      'counsellor_details.counsellor_email',
      'counsellor_details.role',
      'counsellor_details.assigned_to'
    ],
    order: [['counsellor_details', 'counsellor_name', 'ASC']],
  });

  return {
    data: stats,
    dateRange: {
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0]
    },
    totalRecords: stats.length,
    filteredByTeamOwner: userRole === 'to' && userId ? true : false
  };
}

export async function getCounsellor_break_stats(req, res) {
  try {
    const user = req.user;
    console.log('User accessing break stats:', user.id, 'Role:', user.role);
    
    // Pass user role and ID to the stats function
    const data = await getCounsellorBreakStats(req.query, user.role, user.id);
    
    // Add user info to response
    const response = {
      data: data,
      success: true,
      userInfo: {
        id: user.id,
        role: user.role,
        name: user.name
      },
      ...(user.role === 'to' && {
        note: 'Showing break stats for counsellors assigned to this Team Owner'
      })
    };
    
    res.status(200).send(response);
  } catch (e) {
    console.log('Error in getCounsellor_break_stats:', e.message);
    res.status(200).send({ 
      success: false, 
      message: e.message,
      userInfo: req.user ? {
        id: req.user.id,
        role: req.user.role,
        name: req.user.name
      } : null
    });
  }
}

export const changeSupervisor = async (req, res) => {
  const { counsellor_id, supervisor_id } = req.body;

  try {
    if (supervisor_id) {
      const supervisor = await Counsellor.findOne({
        where: {
          counsellor_id: supervisor_id,
          role: 'to'
        }
      });

      if (!supervisor) {
        return res.status(404).json({
          message: 'Supervisor not found or not a valid supervisor (role must be "to")'
        });
      }
    }

    const [updated] = await Counsellor.update(
      {
        assigned_to: supervisor_id || null,
        updated_at: new Date()
      },
      {
        where: { counsellor_id: counsellor_id }
      }
    );

    if (updated === 0) {
      return res.status(404).json({ message: 'Counsellor not found' });
    }

    const updatedCounsellor = await Counsellor.findOne({
      where: { counsellor_id: counsellor_id },
      attributes: { exclude: ['counsellor_password'] },
      include: [
        {
          model: Counsellor,
          as: 'supervisor',
          foreignKey: 'assigned_to',
          attributes: ['counsellor_id', 'counsellor_name', 'role']
        }
      ]
    });

    const formattedCounsellor = updatedCounsellor.toJSON();
    formattedCounsellor.supervisor_name = formattedCounsellor.supervisor?.counsellor_name || null;

    res.status(200).json({
      message: 'Supervisor updated successfully',
      counsellor: formattedCounsellor
    });
  } catch (error) {
    console.error('Error changing supervisor:', error.message);
    res.status(500).json({ message: 'Error changing supervisor', error: error.message });
  }
};