import StudentAssignmentLogic from '../models/Student_Reassignment_Logic.js';
import dayjs from 'dayjs';

const cleanOldLogs = (activityLogs) => {
    if (!Array.isArray(activityLogs)) return [];
    
    const sevenDaysAgo = dayjs().subtract(7, 'day');
    return activityLogs.filter(log => {
        return dayjs(log.timestamp).isAfter(sevenDaysAgo);
    });
};

const createLogEntry = (action, user, oldData = null, newData = null) => {
    return {
        action,
        user_id: user.id,
        user_name: user.name || user.email || 'Unknown',
        timestamp: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        old_data: oldData,
        new_data: newData,
        changes: oldData && newData ? findChanges(oldData, newData) : null
    };
};

const findChanges = (oldData, newData) => {
    const changes = {};
    
    Object.keys(newData).forEach(key => {
        if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
            changes[key] = {
                from: oldData[key],
                to: newData[key]
            };
        }
    });
    
    return Object.keys(changes).length > 0 ? changes : null;
};

export const getStudentReassignmentLogic = async (req, res) => {
  try {
    const rule = await StudentAssignmentLogic.findOne({
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      data: rule
    });

  } catch (error) {
    console.error('Get reassignment logic error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createOrUpdateStudentReassignmentLogic = async (req, res) => {
  try {
    const {
      assignment_logic,
      student_created_from = 'NI', 
      student_created_to,
      status = 'active'
    } = req.body;
    
    const created_by = req.user.id;
    const user = req.user;

    if (!Array.isArray(assignment_logic) || assignment_logic.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'assignment_logic must be a non-empty array'
      });
    }

    if (!student_created_to) {
      return res.status(400).json({
        success: false,
        message: 'student_created_to is required'
      });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(student_created_to)) {
      return res.status(400).json({
        success: false,
        message: 'student_created_to must be in YYYY-MM-DD format'
      });
    }

    const existingRule = await StudentAssignmentLogic.findOne();
    
    let result;
    let activityLogs = [];
    
    if (existingRule) {
        activityLogs = cleanOldLogs(existingRule.activity_logs || []);
        
        const oldData = {
            assignment_logic: existingRule.assignment_logic,
            student_created_from: existingRule.student_created_from,
            student_created_to: existingRule.student_created_to,
            status: existingRule.status
        };
        
        existingRule.assignment_logic = assignment_logic;
        existingRule.student_created_from = student_created_from;
        existingRule.student_created_to = student_created_to;
        existingRule.status = status;
        existingRule.created_by = created_by;
        
        const newData = {
            assignment_logic,
            student_created_from,
            student_created_to,
            status
        };
        
        activityLogs.push(createLogEntry('UPDATE', user, oldData, newData));
        
        if (activityLogs.length > 50) {
            activityLogs = activityLogs.slice(-50);
        }
        
        existingRule.activity_logs = activityLogs;
        result = await existingRule.save();
        
        return res.status(200).json({
            success: true,
            message: 'Assignment rule updated successfully',
            data: result
        });
    } else {
        activityLogs.push(createLogEntry('CREATE', user, null, {
            assignment_logic,
            student_created_from,
            student_created_to,
            status
        }));
        
        result = await StudentAssignmentLogic.create({
            assignment_logic,
            created_by,
            student_created_from,
            student_created_to,
            status,
            activity_logs: activityLogs
        });

        return res.status(201).json({
            success: true,
            message: 'Assignment rule created successfully',
            data: result
        });
    }

  } catch (error) {
    console.error('Create/Update reassignment logic error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const toggleRuleStatus = async (req, res) => {
  try {
    const user = req.user;
    const rule = await StudentAssignmentLogic.findOne();
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'No assignment rule found'
      });
    }

    let activityLogs = cleanOldLogs(rule.activity_logs || []);
    
    const oldStatus = rule.status;
    const newStatus = rule.status === 'active' ? 'inactive' : 'active';
    
    rule.status = newStatus;
    
    activityLogs.push(createLogEntry('STATUS_CHANGE', user, 
        { status: oldStatus }, 
        { status: newStatus }
    ));
    
    if (activityLogs.length > 50) {
        activityLogs = activityLogs.slice(-50);
    }
    
    rule.activity_logs = activityLogs;
    await rule.save();

    return res.status(200).json({
      success: true,
      message: `Rule ${rule.status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: rule
    });

  } catch (error) {
    console.error('Toggle rule status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteStudentReassignmentLogic = async (req, res) => {
  try {
    const user = req.user;
    const rule = await StudentAssignmentLogic.findOne();
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'No assignment rule found'
      });
    }

    const activityLogs = cleanOldLogs(rule.activity_logs || []);
    activityLogs.push(createLogEntry('DELETE', user, {
        assignment_logic: rule.assignment_logic,
        student_created_from: rule.student_created_from,
        student_created_to: rule.student_created_to,
        status: rule.status
    }, null));
    
    
    await rule.destroy();

    return res.status(200).json({
      success: true,
      message: 'Assignment rule deleted successfully'
    });

  } catch (error) {
    console.error('Delete reassignment logic error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getActivityLogs = async (req, res) => {
  try {
    const rule = await StudentAssignmentLogic.findOne();
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        message: 'No assignment rule found'
      });
    }

    const activityLogs = cleanOldLogs(rule.activity_logs || []);
    
    return res.status(200).json({
      success: true,
      data: activityLogs.reverse() 
    });

  } catch (error) {
    console.error('Get activity logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};