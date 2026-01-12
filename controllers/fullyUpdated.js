
import { Sequelize,Op,literal,fn,col } from 'sequelize';
import Student from '../models/Student.js';
import Counsellor from '../models/Counsellor.js';
import StudentRemark from '../models/StudentRemark.js';
import StudentLeadActivity from '../models/StudentLeadActivity.js';
import sequelize from '../config/database-config.js';

export const getOverallStats = async (data, selectedAgent) => {
  try {
    // Build base where conditions for agent filtering
    const agentConditions = {};
    
    if (selectedAgent) {
      if (data === 'l2') {
        agentConditions.assigned_counsellor_id = selectedAgent;
      } else if (data === 'l3') {
        agentConditions.assigned_counsellor_l3_id = selectedAgent;
      } else {
        // If no specific data type, match agent in either L2 or L3 assignment
        agentConditions[Op.or] = [
          { assigned_counsellor_id: selectedAgent },
          { assigned_counsellor_l3_id: selectedAgent }
        ];
      }
    } else {
     
      // Filter based on data type for all agents
      if (data === 'l2') {
        agentConditions.assigned_counsellor_id = { [Op.ne]: null };
      } else if (data === 'l3') {
        agentConditions.assigned_counsellor_l3_id = { [Op.ne]: null };
      }
    }

    // Get today's date for callback filtering
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 1. Total students count
    const total = await Student.count({
      where: agentConditions
    });

    // 2. Fresh leads (students with no remarks)
  const freshLeads = await Student.count({
  where: {
    ...agentConditions,
  },
  include: [
    {
      model: StudentRemark,
      as: 'student_remarks',
      required: false,
    },
  ],
  distinct: true,
  col: 'student_id',
  where: {
    ...agentConditions,
    '$student_remarks.remark_id$': null, 
  },
});

  const whereConditions = {
  callback_date: {
    [Op.gte]: today,
    [Op.lt]: tomorrow,
  },
};

if (selectedAgent) {
  whereConditions.counsellor_id = selectedAgent;
}

const todayCallbacks = await StudentRemark.count({
  where: whereConditions,
});
    // 4. Intent-based stats (Hot, Warm, Cold leads)
  
   const intentStats = await getIntentStats(agentConditions);
// const { hot_leads: hotLeads, warm_leads: warmLeads, cold_leads: coldLeads, not_connected: notConnectedYet } = intentStats;
    
    // 6. Total unread messages count
    const unreadMessagesResult = await Student.findAll({
      where: agentConditions,
      attributes: [
        [fn('SUM', col('number_of_unread_messages')), 'totalUnreadMessages']
      ],
      raw: true
    });

    const allUnreadMessagesCount = parseInt(unreadMessagesResult[0]?.totalUnreadMessages) || 0;

    return {
      total,
      freshLeads,
      todayCallbacks,
      intentHot: intentStats?.hot_leads,
      intentWarm: intentStats?.warm_leads,
      intentCold: intentStats?.cold_leads,
      notConnectedYet:intentStats?.not_connected,
      allUnreadMessagesCount
    };

  } catch (error) {
    console.error('Error in getOverallStats:', error);
    throw new Error('Failed to fetch overall stats');
  }
};
const getIntentStats = async (agentConditions = {}) => {
  let agentConditionSQL = '';
  const replacements = {};

  // Handle different agent conditions safely
  if (
    agentConditions.assigned_counsellor_id &&
    typeof agentConditions.assigned_counsellor_id === 'object' &&
    Op.ne in agentConditions.assigned_counsellor_id
  ) {
    agentConditionSQL = `AND s.assigned_counsellor_id IS NOT NULL`;
  } else if (typeof agentConditions.assigned_counsellor_id === 'string') {
    agentConditionSQL = `AND s.assigned_counsellor_id = :assigned_counsellor_id`;
    replacements.assigned_counsellor_id = agentConditions.assigned_counsellor_id;
  } else if (typeof agentConditions.assigned_counsellor_l3_id === 'object' &&
             Op.ne in agentConditions.assigned_counsellor_l3_id) {
    agentConditionSQL = `AND s.assigned_counsellor_l3_id IS NOT NULL`;
  } else if (typeof agentConditions.assigned_counsellor_l3_id === 'string') {
    agentConditionSQL = `AND s.assigned_counsellor_l3_id = :assigned_counsellor_l3_id`;
    replacements.assigned_counsellor_l3_id = agentConditions.assigned_counsellor_l3_id;
  } else if (agentConditions[Op.or]) {
    const [cond1, cond2] = agentConditions[Op.or];
    const key1 = Object.keys(cond1)[0];
    const key2 = Object.keys(cond2)[0];
    replacements.value1 = cond1[key1];
    replacements.value2 = cond2[key2];

    agentConditionSQL = `
      AND (
        s.${key1} = :value1 OR
        s.${key2} = :value2
      )
    `;
  } else {
    // Default fallback
    agentConditionSQL = `
      AND (
        s.assigned_counsellor_id IS NOT NULL OR 
        s.assigned_counsellor_l3_id IS NOT NULL
      )
    `;
  }

  const query = `
    WITH latest_remarks AS (
      SELECT DISTINCT ON (student_id) 
        student_id,
        calling_status,
        sub_calling_status,
        created_at
      FROM student_remarks 
      ORDER BY student_id, created_at DESC
    )
    SELECT 
      COUNT(CASE WHEN LOWER(lr.sub_calling_status) = 'hot' THEN 1 END) as hot_leads,
      COUNT(CASE WHEN LOWER(lr.sub_calling_status) = 'warm' THEN 1 END) as warm_leads,
      COUNT(CASE WHEN LOWER(lr.sub_calling_status) = 'cold' THEN 1 END) as cold_leads,
      COUNT(CASE WHEN lr.calling_status = 'Not Connected' THEN 1 END) as not_connected
    FROM students s
    INNER JOIN latest_remarks lr ON s.student_id = lr.student_id
    WHERE 1=1 ${agentConditionSQL}
  `;

  const [results] = await sequelize.query(query, { replacements });
  return results[0];
};



export const getStudentshelper = async (filters) => {
  try {
    const {
      page = 1,
      limit = 10,
      data,
      selectedagent,
      mode,
      source,
      leadStatus,
      leadSubStatus,
      utmCampaign,
      utmSource,
      utmMedium,
      utmKeyword,
      utmCampaignId,
      utmAdgroupId,
      utmCreativeId,
      callingStatus,
      subCallingStatus,
      callingStatusL3,
      subCallingStatusL3,
      isConnectedYet,
      isConnectedYetL3,
      searchTerm,
      numberOfUnreadMessages: hasUnreadMessages,
      createdAt_start,
      createdAt_end,
      nextCallDate_start,
      nextCallDate_end,
      lastCallDate_start,
      lastCallDate_end,
      nextCallDateL3_start,
      nextCallDateL3_end,
      lastCallDateL3_start,
      lastCallDateL3_end,
      preferredCity,
      preferredState,
      currentCity,
      currentState,
      preferredStream,
      preferredDegree,
      preferredLevel,
      preferredSpecialization,
      preferredBudget_min,
      preferredBudget_max,
      // New remark-related filters
     
      remarks,
      callbackDate_start,
      callbackDate_end,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = filters;

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Helper functions (keeping existing ones)
    const handleMultiSelectFilter = (value) => {
      if (!value) return null;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        return value.split(',').map(v => v.trim()).filter(v => v);
      }
      return [value];
    };

    const handleTextFilter = (value, exact = false) => {
      if (!value) return null;
      return exact ? value : { [Op.iLike]: `%${value}%` };
    };

    const handleBooleanFilter = (value) => {
      
      if (value === undefined || value === null || value === '') return null;
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1';
    };

   
 function handleDateRange(start, end) {
  if (start && end) {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0); 

    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);

    return { [Op.between]: [startDate, endDate] };
  } else if (start) {
    const startDate = new Date(start);
    startDate.setHours(0, 0, 0, 0);
    return { [Op.gte]: startDate };
  } else if (end) {
    const endDate = new Date(end);
    endDate.setHours(23, 59, 59, 999);
    return { [Op.lte]: endDate };
  }
  return null;
}

 function handleSingleDateRange(start) {
  if (start) {
    return { [Op.eq]: [new Date(start), new Date(end)] };
  
  }
  return null; 
}    
const handleNumberRange = (minValue, maxValue) => {
      const numberRange = {};
      if (minValue !== undefined && minValue !== null && minValue !== '') {
        numberRange[Op.gte] = parseInt(minValue, 10);
      }
      if (maxValue !== undefined && maxValue !== null && maxValue !== '') {
        numberRange[Op.lte] = parseInt(maxValue, 10);
      }
      return Object.keys(numberRange).length > 0 ? numberRange : null;
    };

    const handleArrayFilter = (values) => {
      if (!values) return null;
      const filterValues = handleMultiSelectFilter(values);
      if (!filterValues || filterValues.length === 0) return null;
      return { [Op.overlap]: filterValues };
    };

    // Build where conditions for Student table (keeping existing logic)
    const whereConditions = {};
    
    // Core filters - Data type and agent assignment
    if (data === 'l2') {
      whereConditions.assigned_counsellor_id = { [Op.ne]: null };
    } else if (data === 'l3') {
      whereConditions.assigned_counsellor_l3_id = { [Op.ne]: null };
    }

    // Selected agent filtering
    if (selectedagent) {
      if (data === 'l3') {
        whereConditions.assigned_counsellor_l3_id = selectedagent;
      } else if (data === 'l2') {
        whereConditions.assigned_counsellor_id = selectedagent;
      } else {
        whereConditions[Op.or] = [
          { assigned_counsellor_id: selectedagent },
          { assigned_counsellor_l3_id: selectedagent }
        ];
      }
    }

    // Mode filter
    if (mode) {
      const modeFilter = handleMultiSelectFilter(mode);
      if (modeFilter) {
        const validModes = ['Regular', 'Online'];
        const filteredModes = modeFilter.filter(m => validModes.includes(m));
        if (filteredModes.length > 0) {
          whereConditions.mode = filteredModes.length === 1 ? filteredModes[0] : { [Op.in]: filteredModes };
        }
      }
    }

    // Source filter
    if (source) {
      const sourceFilter = handleMultiSelectFilter(source);
      if (sourceFilter) {
        whereConditions.source = sourceFilter.length === 1
          ? handleTextFilter(sourceFilter[0])
          : { [Op.or]: sourceFilter.map(s => ({ [Op.iLike]: `%${s}%` })) };
      }
    }

  
    // Boolean filters (keeping existing)
    
    if (isConnectedYet) {
      whereConditions.is_connected_yet = isConnectedYet;

    }

    const isConnectedYetL3Filter = handleBooleanFilter(isConnectedYetL3);
    if (isConnectedYetL3Filter !== null) {
      whereConditions.is_connected_yet_l3 = isConnectedYetL3Filter;
    }

    // Unread messages filter (keeping existing)
    if (hasUnreadMessages === 'true') {
      whereConditions.number_of_unread_messages = { [Op.gt]: 0 };
    } else if (hasUnreadMessages === 'false') {
      whereConditions.number_of_unread_messages = { [Op.eq]: 0 };
    }

    // Search term filter (keeping existing)
    if (searchTerm) {
      const searchCondition = {
        [Op.or]: [
          { student_name: { [Op.iLike]: `%${searchTerm}%` } },
          { student_email: { [Op.iLike]: `%${searchTerm}%` } },
          { student_phone: { [Op.iLike]: `%${searchTerm}%` } },
          { student_id: { [Op.iLike]: `%${searchTerm}%` } },
          { student_secondary_email: { [Op.iLike]: `%${searchTerm}%` } }
        ]
      };
      whereConditions[Op.and] = whereConditions[Op.and] ? 
        [...(Array.isArray(whereConditions[Op.and]) ? whereConditions[Op.and] : [whereConditions[Op.and]]), searchCondition] :
        [searchCondition];
    }

    // Date range filters (keeping existing)
    const createdAtRange = handleDateRange(createdAt_start, createdAt_end);
    if (createdAtRange) {
      whereConditions.created_at = createdAtRange;
    }

  

   

    const nextCallDateL3Range = handleDateRange(nextCallDateL3_start, nextCallDateL3_end);
    if (nextCallDateL3Range) {
      whereConditions.next_call_date_l3 = nextCallDateL3Range;
    }

    const lastCallDateL3Range = handleDateRange(lastCallDateL3_start, lastCallDateL3_end);
    if (lastCallDateL3Range) {
      whereConditions.last_call_date_l3 = lastCallDateL3Range;
    }

    // Location and preference filters (keeping existing)
    const preferredCityFilter = handleArrayFilter(preferredCity);
    if (preferredCityFilter) {
      whereConditions.preferred_city = preferredCityFilter;
    }

    const preferredStateFilter = handleArrayFilter(preferredState);
    if (preferredStateFilter) {
      whereConditions.preferred_state = preferredStateFilter;
    }

    if (currentCity) {
      const currentCityFilter = handleTextFilter(currentCity);
      if (currentCityFilter) {
        whereConditions.student_current_city = currentCityFilter;
      }
    }

    if (currentState) {
      const currentStateFilter = handleTextFilter(currentState);
      if (currentStateFilter) {
        whereConditions.student_current_state = currentStateFilter;
      }
    }

    if(preferredStream)
    {
      const preferredStreamFilter = handleArrayFilter(preferredStream);
    if (preferredStreamFilter) {
      whereConditions.preferred_stream = preferredStreamFilter;
    }
    }
     if(preferredDegree)
     {
       const preferredDegreeFilter = handleArrayFilter(preferredDegree);
    if (preferredDegreeFilter) {
      whereConditions.preferred_degree = preferredDegreeFilter;
    }
     }

   if(preferredLevel)
   {
      const preferredLevelFilter = handleArrayFilter(preferredLevel);
    if (preferredLevelFilter) {
      whereConditions.preferred_level = preferredLevelFilter;
    }
   }

    if(preferredSpecialization)
    {
      const preferredSpecializationFilter = handleArrayFilter(preferredSpecialization);
    if (preferredSpecializationFilter) {
      whereConditions.preferred_specialization = preferredSpecializationFilter;
    }

    }
    // Budget range filter (keeping existing)
     if(preferredBudget_min || preferredBudget_max)
     {
          const budgetRange = handleNumberRange(preferredBudget_min, preferredBudget_max);
        if (budgetRange) {
          whereConditions.preferred_budget = budgetRange;
        }
     }
    
     const lead_entry_date = handleDateRange(createdAt_start,createdAt_end);
    if (lead_entry_date) {
       whereConditions.created_at = lead_entry_date;
    }

    if (callingStatusL3) {
      const callingStatusL3Filter = handleMultiSelectFilter(callingStatusL3);
      if (callingStatusL3Filter) {
        whereConditions.calling_status_l3 = callingStatusL3Filter.length === 1 ? callingStatusL3Filter[0] : { [Op.in]: callingStatusL3Filter };
      }
    }

    if (subCallingStatusL3) {
      const subCallingStatusL3Filter = handleMultiSelectFilter(subCallingStatusL3);
      if (subCallingStatusL3Filter) {
        whereConditions.sub_calling_status_l3 = subCallingStatusL3Filter.length === 1 ? subCallingStatusL3Filter[0] : { [Op.in]: subCallingStatusL3Filter };
      }
    }

    // NEW: Build StudentRemark where conditions
    const remarkWhereConditions = {};
      // Lead status filters (keeping existing)
    if (leadStatus) {
       remarkWhereConditions.lead_status = leadStatus;
     
    }

    if (leadSubStatus) {
      remarkWhereConditions.lead_sub_status =leadSubStatus;
      
    }

    // Calling status filters (keeping existing)
    if (callingStatus) {
     remarkWhereConditions.calling_status = callingStatus
    }

    if (subCallingStatus) {
        remarkWhereConditions.sub_calling_status = subCallingStatus

    }
    if(nextCallDate_start)
    {
       remarkWhereConditions.callback_date = nextCallDate_start
    }


    if (remarks) {
      remarkWhereConditions.remarks = remarks;
    }

    const callbackDateRange = handleDateRange(callbackDate_start, callbackDate_end);
    if (callbackDateRange) {
      remarkWhereConditions.callback_date = callbackDateRange;
    }

    // UTM filters for StudentLeadActivity (keeping existing logic)
    const utmWhereConditions = {};
    
    if (utmCampaign) {
    
      utmWhereConditions.utm_campaign = utmCampaign
    }
    if (utmSource) {
     utmWhereConditions.utm_sourceutmSource;
      
    }

    if (utmMedium) {
       utmWhereConditions.utm_medium = utmMedium;
     
    }

    if (utmKeyword) {
      utmWhereConditions.utm_keyword = utmKeyword;
     
    }

    // UTM ID filters (exact match)
    if (utmCampaignId) {
      utmWhereConditions.utm_campaign_id  = utmCampaignId
      
    }

    if (utmAdgroupId) {
       utmWhereConditions.utm_adgroup_id=utmAdgroupId;
     
    }

    if (utmCreativeId) {
      utmWhereConditions.utm_creative_id=utmCreativeId;
     
    }

    // Build sort order
    const orderClause = [[sortBy, sortOrder.toUpperCase()]];
   
// Alternative approach using subqueries to get latest records


let combinedQuery = '';
let finalStudentIds = null;
let replacements = {};

const hasRemarks = Object.keys(remarkWhereConditions).length > 0;
const hasUTM = Object.keys(utmWhereConditions).length > 0;

if (hasRemarks && hasUTM) {
  const { whereSQL: remarkSQL, replacements: r1 } = buildWhereSQL(remarkWhereConditions);
  const { whereSQL: utmSQL, replacements: r2 } = buildWhereSQL(utmWhereConditions);
  replacements = { ...r1, ...r2 };

  // ✅ OPTIMIZATION 1: Use window functions instead of self-joins for better performance
  combinedQuery = `
    WITH latest_remarks AS (
      SELECT student_id, 
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC) as rn
      FROM student_remarks 
      WHERE ${remarkSQL}
    ),
    first_activities AS (
      SELECT student_id,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at ASC) as rn
      FROM student_lead_activities 
      WHERE ${utmSQL}
    )
    SELECT student_id FROM (
      SELECT student_id FROM latest_remarks WHERE rn = 1
      INTERSECT
      SELECT student_id FROM first_activities WHERE rn = 1
    ) combined
  `;
} else if (hasRemarks) {
  const { whereSQL: remarkSQL, replacements: r1 } = buildWhereSQL(remarkWhereConditions);
  replacements = { ...r1 };
  
  // ✅ OPTIMIZATION 2: Window function for single table queries
  combinedQuery = `
    WITH latest_remarks AS (
      SELECT student_id, 
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC) as rn
      FROM student_remarks 
      WHERE ${remarkSQL}
    )
    SELECT student_id FROM latest_remarks WHERE rn = 1
  `;
} else if (hasUTM) {
  const { whereSQL: utmSQL, replacements: r2 } = buildWhereSQL(utmWhereConditions);
  replacements = { ...r2 };

  combinedQuery = `
    WITH first_activities AS (
      SELECT student_id,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at ASC) as rn
      FROM student_lead_activities 
      WHERE ${utmSQL}
    )
    SELECT student_id FROM first_activities WHERE rn = 1
  `;
}

// Apply limit/offset for filtering queries
if (combinedQuery) {
  combinedQuery += `\nLIMIT :limit OFFSET :offset`;
  replacements.limit = limit;
  replacements.offset = offset;

  const result = await sequelize.query(combinedQuery, {
    replacements,
    type: Sequelize.QueryTypes.SELECT
  });

  finalStudentIds = result.map(r => r.student_id);

  // Early return for empty results
  if (result.length === 0) {
    const totalPages = 0;
    const overallStats = await getOverallStats(data, selectedagent);
    
    return {
      success: true,
      data: [],
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: 0,
        limit: limitNum,
        hasNextPage: false,
        hasPrevPage: false
      },
      overallStats,
      filters: { /* ... your existing filters ... */ },
      appliedFilters: {
        student: whereConditions,
        remarks: remarkWhereConditions,
        utm: utmWhereConditions
      }
    };
  }

  // Apply student_id filter
  whereConditions.student_id = {
    [Op.in]: finalStudentIds
  };
}

// ✅ OPTIMIZATION 3: Simplified include array - removed duplicate StudentRemark
const includeArray = [
  {
    model: Counsellor,
    as: 'assignedCounsellor',
    attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'counsellor_phone_number', 'role'],
    required: false
  },
  {
    model: Counsellor,
    as: 'assignedCounsellorL3',
    attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'counsellor_phone_number', 'role'],
    required: false
  },
  {
    model: StudentRemark,
    as: 'student_remarks',
    attributes: [
      'remark_id', 'lead_status', 'lead_sub_status', 'calling_status',
      'sub_calling_status', 'remarks', 'callback_date', 'callback_time', 'created_at'
    ],
    // ✅ OPTIMIZATION 4: Move order to main query level for better performance
    required: false,
    separate: true, // This creates a separate query for better performance
    limit: 1,
    order: [['created_at', 'DESC']]
  },
  {
    model: StudentLeadActivity,
    as: 'lead_activities',
    attributes: [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
      'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at'
    ],
    required: false,
    separate: true, // This creates a separate query for better performance
    limit: 1,
    order: [['created_at', 'ASC']]
  }
];

// ✅ OPTIMIZATION 5: Use transaction for consistency and potential performance gain
const transaction = await sequelize.transaction();


  // Parallel execution of count and data queries
  const [{ count: totalCount, rows: students }, overallStats] = await Promise.all([
    Student.findAndCountAll({
      where: whereConditions,
      include: includeArray,
      attributes: {
        include: [
         
          [Sequelize.literal(`(
            SELECT COUNT(*) 
            FROM student_remarks AS sr 
            WHERE sr.student_id = students.student_id
          )`), 'remark_count']
        ]
      },
      limit: limitNum,
      offset: offset,
      order: orderClause,
      distinct: true,
      subQuery: false,
      transaction
    }),
    getOverallStats(data, selectedagent) 
  ]);

  await transaction.commit();

  const totalPages = Math.ceil(totalCount / limitNum);

  const response = {
    success: true,
    data: students,
    pagination: {
      currentPage: pageNum,
      totalPages,
      totalRecords: totalCount,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    },
    overallStats,
    filters: {
      data, selectedagent, mode, source, leadStatus, leadSubStatus,
      utmCampaign, utmSource, utmMedium, utmKeyword, utmCampaignId,
      utmAdgroupId, utmCreativeId, callingStatus, subCallingStatus,
      callingStatusL3, subCallingStatusL3, isConnectedYet, isConnectedYetL3,
      searchTerm, hasUnreadMessages, createdAt_start, createdAt_end,
      nextCallDate_start, nextCallDate_end, lastCallDate_start, lastCallDate_end,
      nextCallDateL3_start, nextCallDateL3_end, lastCallDateL3_start, lastCallDateL3_end,
      preferredCity, preferredState, currentCity, currentState,
      preferredStream, preferredDegree, preferredLevel, preferredSpecialization,
      preferredBudget_min, preferredBudget_max, remarks,
      callbackDate_start, callbackDate_end, sortBy, sortOrder
    },
    appliedFilters: {
      student: whereConditions,
      remarks: remarkWhereConditions,
      utm: utmWhereConditions
    }
  };

  return response;


} catch (error) {
  await transaction.rollback();
 throw error;
}
};
function buildWhereSQL(whereObj) {
  const conditions = [];
  const replacements = {};
  let paramIndex = 0;

  for (const [key, value] of Object.entries(whereObj)) {
    const paramKey = `param_${paramIndex++}`;

    if (typeof value === 'string') {
      if(key!='callback_date')
      {
      conditions.push(`LOWER(${key}) = LOWER(:${paramKey})`);
      replacements[paramKey] = value;
      }
      else{
        conditions.push(`${key} = :${paramKey}`)
        replacements[paramKey] = value;
      }
    } else if (typeof value === 'number') {
      conditions.push(`${key} = :${paramKey}`);
      replacements[paramKey] = value;
    } else if (Array.isArray(value)) {
      
      conditions.push(`LOWER(${key}) = ANY(:${paramKey})`);
      replacements[paramKey] = value.map(v => v.toLowerCase?.() || v);
    }
  }

  return {
    whereSQL: conditions.length ? conditions.join(' AND ') : '1=1',
    replacements,
  };
}



export const getStudents = async (req, res) => {
  try{
    
      console.time('timeExcuring')
      const filters=mapFiltersForGetStudentsHelper(req.query)
      const data=await getStudentshelper(filters)
       console.timeEnd('timeExcuring')
      res.status(200).json(data);
  }
   catch(error)
   {
    console.error('Error in getStudents:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
   }
}
const mapFiltersForGetStudentsHelper = (params) => {

  return {
    page: params.page ?? 1,
    limit: params.limit ?? 10,
    data: params.data,
    selectedagent: params.selectedagent,
    mode: params.mode,
    source: params.source,
    leadStatus: params.leadStatus,
    leadSubStatus: params.sub_lead_status,
    utmCampaign: params.campaign_name,
    utmSource: params.utmSource,
    utmMedium: params.utmMedium,
    utmKeyword: params.utmKeyword,
    utmCampaignId: params.utmCampaignId,
    utmAdgroupId: params.utmAdgroupId,
    utmCreativeId: params.utmCreativeId,
    callingStatus: params.callingStatus,
    subCallingStatus: params.subCallingStatus,
    callingStatusL3: params.callingStatusL3,
    subCallingStatusL3: params.subCallingStatusL3,
    isConnectedYet: params.isconnectedyet && params.isconnectedyet=='Connected' ?  true : false,
    isConnectedYetL3: params.isConnectedYetL3,
    searchTerm: params.searchTerm ?? '',
    numberOfUnreadMessages: params.number_of_unread_messages, 
    createdAt_start: params.createdAt_start,
    createdAt_end: params.createdAt_end,
    nextCallDate_start: params.nextCallDate_start,
    nextCallDate_end: params.nextCallDate_end,
    lastCallDate_start: params.lastCallDate_start,
    lastCallDate_end: params.lastCallDate_end,
    nextCallDateL3_start: params.nextCallDateL3_start,
    nextCallDateL3_end: params.nextCallDateL3_end,
    lastCallDateL3_start: params.lastCallDateL3_start,
    lastCallDateL3_end: params.lastCallDateL3_end,
    preferredCity: params.preferredCity,
    preferredState: params.preferredState,
    currentCity: params.currentCity,
    currentState: params.currentState,
    preferredStream: params.preferredStream,
    preferredDegree: params.preferredDegree,
    preferredLevel: params.preferredLevel,
    preferredSpecialization: params.preferredSpecialization,
    preferredBudget_min: params.preferredBudget_min,
    preferredBudget_max: params.preferredBudget_max,
    remarkLeadStatus: params.remarkLeadStatus,
    remarkLeadSubStatus: params.sub_lead_status,
    remarkCallingStatus: params.remarkCallingStatus,
    remarkSubCallingStatus: params.subCallingStatus,
    remarks: params.remarks,
    callbackDate_start: params.callbackDate_start,
    callbackDate_end: params.callbackDate_end,
    sortBy: params.sortBy ?? 'created_at', 
    sortOrder: params.sortOrder ?? 'desc'
  };
};
