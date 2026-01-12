import { sequelize } from "../models/index.js";
function buildFilters(filters = {}) {
  const where = [];
  const joinRemarks = [];
  const joinActivities = [];
  const params = [];
  let paramIdx = 1;

  // Helper for multi-value IN/ANY
  const addMulti = (col, value, tableAlias = 's') => {
    if (value) {
      const arr = Array.isArray(value) ? value : value.toString().split(',').map(v => v.trim()).filter(v => v);
      if (arr.length) {
        where.push(`${tableAlias}.${col} = ANY($${paramIdx})`);
        params.push(arr);
        paramIdx++;
      }
    }
  };
  const addLike = (col, value, tableAlias = 's') => {
    if (value) {
      where.push(`${tableAlias}.${col} ILIKE $${paramIdx}`);
      params.push(`%${value}%`);
      paramIdx++;
    }
  };
  const addExact = (col, value, tableAlias = 's') => {
    if (value !== undefined && value !== null && value !== '') {
      where.push(`${tableAlias}.${col} = $${paramIdx}`);
      params.push(value);
      paramIdx++;
    }
  };
  const addBool = (col, value, tableAlias = 's') => {
    if (value === true || value === false || value === 'true' || value === 'false' || value === '1' || value === '0') {
      where.push(`${tableAlias}.${col} = $${paramIdx}`);
      params.push(value === true || value === 'true' || value === '1');
      paramIdx++;
    }
  };
  const addRange = (col, start, end, tableAlias = 's') => {
    if (start && end) {
      where.push(`${tableAlias}.${col} BETWEEN $${paramIdx} AND $${paramIdx + 1}`);
      params.push(start, end);
      paramIdx += 2;
    } else if (start) {
      where.push(`${tableAlias}.${col} >= $${paramIdx}`);
      params.push(start);
      paramIdx++;
    } else if (end) {
      where.push(`${tableAlias}.${col} <= $${paramIdx}`);
      params.push(end);
      paramIdx++;
    }
  };
  const addNumberRange = (col, min, max, tableAlias = 's') => {
    if (min !== undefined && min !== null && min !== '') {
      where.push(`${tableAlias}.${col} >= $${paramIdx}`);
      params.push(parseInt(min, 10));
      paramIdx++;
    }
    if (max !== undefined && max !== null && max !== '') {
      where.push(`${tableAlias}.${col} <= $${paramIdx}`);
      params.push(parseInt(max, 10));
      paramIdx++;
    }
  };
  // Counsellor filters
  if (filters.data === 'l2') {
    where.push('s.assigned_counsellor_id IS NOT NULL');
  } else if (filters.data === 'l3') {
    where.push('s.assigned_counsellor_l3_id IS NOT NULL');
  }

  if (filters.selectedagent) {
    if (filters.data === 'l3') {
      where.push('s.assigned_counsellor_l3_id = $' + paramIdx);
      params.push(filters.selectedagent);
      paramIdx++;
    } else if (filters.data === 'l2') {
      where.push('s.assigned_counsellor_id = $' + paramIdx);
      params.push(filters.selectedagent);
      paramIdx++;
    } else {
      where.push('(s.assigned_counsellor_id = $' + paramIdx +
        ' OR s.assigned_counsellor_l3_id = $' + paramIdx + ')');
      params.push(filters.selectedagent);
      paramIdx++;
    }
  }

  addMulti('mode', filters.mode);
  addBool('is_connected_yet', filters.isConnectedYet);
  addBool('is_connected_yet_l3', filters.isConnectedYetL3);

  if (filters.numberOfUnreadMessages === 'true') {
    where.push(`s.number_of_unread_messages > 0`);
  } else if (filters.numberOfUnreadMessages === 'false') {
    where.push(`s.number_of_unread_messages = 0`);
  }

  if (filters.searchTerm) {
    const like = `%${filters.searchTerm}%`;
    where.push(`(
      s.student_name ILIKE $${paramIdx} OR
      s.student_email ILIKE $${paramIdx} OR
      s.student_phone ILIKE $${paramIdx} OR
      s.student_id::text ILIKE $${paramIdx} OR
      s.student_secondary_email ILIKE $${paramIdx}
    )`);
    params.push(like);
    paramIdx++;
  }

  addRange('created_at', filters.createdAt_start, filters.createdAt_end);
  addRange('next_call_date_l3', filters.nextCallDateL3_start, filters.nextCallDateL3_end);
  addRange('last_call_date_l3', filters.lastCallDateL3_start, filters.lastCallDateL3_end);

  addMulti('preferred_city', filters.preferredCity);
  addMulti('preferred_state', filters.preferredState);
  addLike('student_current_city', filters.currentCity);
  addLike('student_current_state', filters.currentState);
  addMulti('preferred_stream', filters.preferredStream);
  addMulti('preferred_degree', filters.preferredDegree);
  addMulti('preferred_level', filters.preferredLevel);
  addMulti('preferred_specialization', filters.preferredSpecialization);
  addNumberRange('preferred_budget', filters.preferredBudget_min, filters.preferredBudget_max);

  addMulti('calling_status_l3', filters.callingStatusL3);
  addMulti('sub_calling_status_l3', filters.subCallingStatusL3);

  // Remarks filters (for student_remarks JOIN)
  const remarksClauses = [];
  if (filters.leadStatus) addMulti('lead_status', filters.leadStatus, 'r');
  if (filters.leadSubStatus) addMulti('lead_sub_status', filters.leadSubStatus, 'r');
  if (filters.callingStatus) addMulti('calling_status', filters.callingStatus, 'r');
  if (filters.subCallingStatus) addMulti('sub_calling_status', filters.subCallingStatus, 'r');
  if (filters.remarks) addLike('remarks', filters.remarks, 'r');
  addRange('callback_date', filters.callbackDate_start, filters.callbackDate_end, 'r');
  if (filters.nextCallDate_start || filters.nextCallDate_end) {
    addRange('callback_date', filters.nextCallDate_start, filters.nextCallDate_end, 'r');
  }

  // Activities filters (for student_lead_activities JOIN)
  const activitiesClauses = [];
  if (filters.utmCampaign) addLike('utm_campaign', filters.utmCampaign, 'a');
  if (filters.utmSource) addLike('utm_source', filters.utmSource, 'a');
  if (filters.utmMedium) addLike('utm_medium', filters.utmMedium, 'a');
  if (filters.utmKeyword) addLike('utm_keyword', filters.utmKeyword, 'a');
  if (filters.source) addMulti('source', filters.source, 'a');
  addExact('utm_campaign_id', filters.utmCampaignId, 'a');
  addExact('utm_adgroup_id', filters.utmAdgroupId, 'a');
  addExact('utm_creative_id', filters.utmCreativeId, 'a');

  // Special case: Fresh Leads (students with *no* remarks)
  let freshLeadFilter = '';
  if (filters.freshLeads === 'Fresh') {
    // We'll LEFT JOIN remarks and only keep student's where remark is null
    freshLeadFilter = 'AND r.student_id IS NULL';
  }

  return {
    where: where.length ? 'WHERE ' + where.join('\n AND ') : '',
    remarksJoinFilter: remarksClauses.length ? 'AND ' + remarksClauses.join(' AND ') : '',
    activitiesJoinFilter: activitiesClauses.length ? 'AND ' + activitiesClauses.join(' AND ') : '',
    freshLeadFilter,
    params,
  };
}

// Main function
export async function getStudentsRaw(filters) {
  const {
    where, remarksJoinFilter, activitiesJoinFilter, freshLeadFilter, params
  } = buildFilters(filters);

  const pageNum = parseInt(filters.page, 10) || 1;
  const limitNum = filters.limit ? parseInt(filters.limit, 10) : 10;
  const offset = (pageNum - 1) * limitNum;

  // For ORDER BY safety
  const sortBy = ['created_at', 'student_name'].includes(filters.sortBy) ? filters.sortBy : 'created_at';
  const sortOrder = (filters.sortOrder || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  // RAW QUERY
  const query = `
    SELECT
      s.student_id,
      s.student_name,
      s.student_email,
      s.student_phone,
      s.created_at,
      
      jsonb_agg(DISTINCT jsonb_build_object(
        'remark_id', r.remark_id,
        'lead_status', r.lead_status,
        'lead_sub_status', r.lead_sub_status,
        'calling_status', r.calling_status,
        'sub_calling_status', r.sub_calling_status,
        'remarks', r.remarks,
        'callback_date', r.callback_date,
        'callback_time', r.callback_time,
        'created_at', r.created_at
      )) FILTER (WHERE r.remark_id IS NOT NULL) as remarks,
      jsonb_agg(DISTINCT jsonb_build_object(
        'utm_source', a.utm_source,
        'utm_medium', a.utm_medium,
        'source', a.source,
        'source_url', a.source_url
      )) FILTER (WHERE a.student_id IS NOT NULL) as lead_activities,
      COUNT(*) OVER() as total_count
    FROM students s
    LEFT JOIN student_remarks r ON r.student_id = s.student_id
      ${remarksJoinFilter}
    LEFT JOIN student_lead_activities a ON a.student_id = s.student_id
      ${activitiesJoinFilter}
    ${where}
    ${freshLeadFilter}
    GROUP BY s.student_id
    ORDER BY s.${sortBy} ${sortOrder}
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2};
  `;
  const allParams = [...params, limitNum, offset];

  const countQuery = `
    SELECT COUNT(DISTINCT s.student_id) AS total_count
    FROM students s
    LEFT JOIN student_remarks r ON r.student_id = s.student_id
      ${remarksJoinFilter}
    LEFT JOIN student_lead_activities a ON a.student_id = s.student_id
      ${activitiesJoinFilter}
    ${where}
    ${freshLeadFilter};
  `;


 try {
    // Run the queries in parallel
    const [countRes, dataRes] = await Promise.all([
      sequelize.query(countQuery, { bind: params, type: sequelize.QueryTypes.SELECT }),
      sequelize.query(query, { bind: allParams, type: sequelize.QueryTypes.SELECT })
    ]);

   
    let totalCount = 0;
    if (Array.isArray(countRes) && countRes.length > 0 && countRes[0].total_count !== undefined) {
      totalCount = parseInt(countRes[0].total_count, 10) || 0;
    }

    const totalPages = Math.ceil(totalCount / limitNum);

    // dataRes is your data list
    return {
      success: true,
      data: dataRes,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      appliedFilters: filters
    };

  } catch (e) {
    console.log('error', e);
    throw e;
  }
}

