import { LeadAssignmentRuleL2, Counsellor } from '../models/index.js';
import { Op } from 'sequelize';

// Helper function to clean conditions
const cleanConditions = (conditions) => {
  try {
    if (!conditions || typeof conditions !== 'object') return {};

    const cleaned = {};

    // Only process the 11 allowed priority fields
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
      'preferred_state'
    ];

    for (const [key, value] of Object.entries(conditions)) {
      // Only process if it's in our priority fields
      if (!priorityFields.includes(key)) {
        continue;
      }

      if (Array.isArray(value)) {
        const cleanedArray = value
          .map(item => {
            if (typeof item === 'object' && item !== null) {
              return item._id || item.value || null;
            }
            return item;
          })
          .filter(item =>
            item !== null &&
            item !== undefined &&
            String(item).trim() !== ''
          );

        if (cleanedArray.length > 0) {
          cleaned[key] = cleanedArray;
        }
      } else if (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ''
      ) {
        cleaned[key] = value;
      }
    }

    return cleaned;
  } catch (e) {
    console.error('Error in cleanConditions:', e.message);
    return {};
  }
};

// Only validate the 11 priority fields
const validateConditionKeys = (conditions) => {
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
    'preferred_state'
  ];
  
  const providedKeys = Object.keys(conditions);
  const invalidKeys = providedKeys.filter(key => !priorityFields.includes(key));
  
  if (invalidKeys.length > 0) {
    throw new Error(`Invalid condition keys: ${invalidKeys.join(', ')}. Only these 11 fields are allowed: ${priorityFields.join(', ')}`);
  }
};

export const createLeadAssignmentforL2 = async (req, res) => {
  try {
    const { conditions, assigned_counsellor_ids, is_active = true, priority = 0, custom_rule_name } = req.body;
    
    if (!assigned_counsellor_ids || !Array.isArray(assigned_counsellor_ids) || assigned_counsellor_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one counsellor must be assigned' });
    }

    const cleanedConditions = cleanConditions(conditions);
    
    // Check if at least one condition is provided (not required, but good practice)
    if (Object.keys(cleanedConditions).length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one valid condition must be provided from the allowed fields' 
      });
    }
    
    validateConditionKeys(cleanedConditions);
    
    const counsellors = await Counsellor.findAll({
      where: {
        [Op.or]: [
          { counsellor_id: { [Op.in]: assigned_counsellor_ids } },
        ]
      }
    });

    if (counsellors.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid counsellors found with the provided identifiers' });
    }

    const name = await LeadAssignmentRuleL2.generateRuleName();
    const newRule = await LeadAssignmentRuleL2.create({
      name,
      conditions: cleanedConditions,
      assigned_counsellor_ids: counsellors.map(c => c.counsellor_id),
      is_active,
      priority,
      custom_rule_name
    });

    const fetchedCounsellors = await Counsellor.findAll({
      where: { counsellor_id: { [Op.in]: newRule.assigned_counsellor_ids } },
      attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
    });

    newRule.dataValues.counsellors = fetchedCounsellors;

    res.status(201).json({
      success: true,
      message: 'Rule created successfully',
      data: newRule
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateLeadAssignmentforL2 = async (req, res) => {
  try {
    const { id } = req.params;
    const { conditions, round_robin_index, assigned_counsellor_ids, is_active, priority, custom_rule_name } = req.body;
    
    const updateData = {};

    if (conditions !== undefined) {
      const cleanedConditions = cleanConditions(conditions);
      if (Object.keys(cleanedConditions).length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'At least one valid condition must be provided from the allowed fields' 
        });
      }
      validateConditionKeys(cleanedConditions);
      updateData.conditions = cleanedConditions;
    }
    
    if (is_active !== undefined) updateData.is_active = is_active;
    if (priority !== undefined) updateData.priority = priority;
    if (assigned_counsellor_ids !== undefined) updateData.assigned_counsellor_ids = assigned_counsellor_ids;
    if (round_robin_index !== undefined) updateData.round_robin_index = round_robin_index;
    if (custom_rule_name !== undefined) updateData.custom_rule_name = custom_rule_name;

    const [updatedRowsCount] = await LeadAssignmentRuleL2.update(updateData, {
      where: { lead_assignment_rule_l2_id: id }
    });

    if (updatedRowsCount === 0) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    const updatedRule = await LeadAssignmentRuleL2.findByPk(id);
    const counsellors = await Counsellor.findAll({
      where: { counsellor_id: { [Op.in]: updatedRule.assigned_counsellor_ids || [] } },
      attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
    });
    updatedRule.dataValues.counsellors = counsellors;

    res.json({ 
      success: true, 
      message: 'Rule updated successfully',
      data: updatedRule
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllLeadAssignmentforL2 = async (req, res) => {
  try {
    const { page = 1, is_active, limit = 10, priority } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    const filter = {};
    if (is_active !== undefined) filter.is_active = is_active === 'true';
    if (priority !== undefined) filter.priority = parseInt(priority);

    const { count, rows } = await LeadAssignmentRuleL2.findAndCountAll({
      where: filter,
      order: [['priority', 'DESC'], ['created_at', 'DESC']]
    });

    for (let rule of rows) {
      const counsellors = await Counsellor.findAll({
        where: { counsellor_id: { [Op.in]: rule.assigned_counsellor_ids } },
        attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
      });
      rule.dataValues.counsellors = counsellors;
    }
    
    res.json({
      success: true,
      data: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getLeadAssignmentforL2ById = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await LeadAssignmentRuleL2.findByPk(id);

    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    const counsellors = await Counsellor.findAll({
      where: { counsellor_id: { [Op.in]: rule.assigned_counsellor_ids || [] } },
      attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email']
    });

    rule.dataValues.counsellors = counsellors;

    res.json({ 
      success: true, 
      data: rule 
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteLeadAssignmentforL2 = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await LeadAssignmentRuleL2.findByPk(id);
    
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    const ruleName = rule.name;
    await rule.destroy();

    res.json({ 
      success: true, 
      message: 'Rule deleted successfully', 
      data: { deletedRule: ruleName } 
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleLeadAssignmentforL2Status = async (req, res) => {
  try {
    const { id } = req.params;
    const rule = await LeadAssignmentRuleL2.findByPk(id);
    
    if (!rule) {
      return res.status(404).json({ success: false, message: 'Rule not found' });
    }

    rule.is_active = !rule.is_active;
    await rule.save();

    res.json({
      success: true,
      message: `Rule ${rule.is_active ? 'activated' : 'deactivated'} successfully`,
      data: { 
        is_active: rule.is_active, 
        ruleName: rule.name,
        custom_rule_name: rule.custom_rule_name
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to be used in assignLeadHelper
export const incrementRuleMatchCount = async (ruleId) => {
  try {
    const rule = await LeadAssignmentRuleL2.findByPk(ruleId);
    
    if (!rule) {
      return { success: false, message: 'Rule not found' };
    }

    // Increment match count and update timestamp
    rule.total_matched_leads = (rule.total_matched_leads || 0) + 1;
    rule.last_matched_at = new Date();
    await rule.save();

    return {
      success: true,
      total_matched_leads: rule.total_matched_leads,
      last_matched_at: rule.last_matched_at
    };

  } catch (error) {
    console.error('Error incrementing rule match count:', error);
    return { success: false, message: error.message };
  }
};