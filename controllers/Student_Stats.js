


import sequelize from '../config/database-config.js';

const escape = (val) =>
  typeof val === 'string'
    ? "'" + val.replace(/'/g, "''") + "'"
    : val === null || val === undefined
      ? 'NULL'
      : val;

export const getOptimizedOverallStatsFromHelper = async ({
  studentWhere = '1=1',
  utmWhere = '1=1',
  selectedagent,
  callback,
  role = 'l2'
}) => {
  try {
    const freshLeadsRemarkAgentFilter = selectedagent
      ? `AND sr.counsellor_id = ${escape(selectedagent)}`
      : '';
    const freshLeadsL3Condition = !selectedagent && role === 'l3'
      ? `or bs.total_remarks_l3 = 0`
      : '';

    const wishlistAgentFilter = selectedagent
      ? `AND sw.counsellor_id = ${escape(selectedagent)}`
      : '';

    const todaycallbacks = selectedagent
      ? `AND lr.counsellor_id = ${escape(selectedagent)}`
      : '';
    
    const query = `
      WITH base_students AS (
        SELECT DISTINCT s.student_id,
               s.number_of_unread_messages,
               s.created_at as student_created_at,
               s.is_connected_yet,
               s.is_connected_yet_l3,
               s.total_remarks_l3,
               s.source,
               s.is_reactivity
        FROM students s
        ${utmWhere !== '1=1' ? `
          INNER JOIN student_lead_activities la ON s.student_id = la.student_id
          AND (${utmWhere})
        ` : ''}
        WHERE (${studentWhere})
      ),
     fresh_leads AS (
        SELECT bs.student_id
        FROM base_students bs
        WHERE NOT EXISTS (
          SELECT 1 FROM student_remarks sr
          WHERE sr.student_id = bs.student_id
          ${freshLeadsRemarkAgentFilter}
        )
        ${freshLeadsL3Condition}
      ),
              
      latest_remarks AS (
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.calling_status,
          sr.sub_calling_status,
          sr.created_at,
          sr.callback_date,
          sr.counsellor_id,
          sr.lead_status
        FROM student_remarks sr
        INNER JOIN base_students bs ON sr.student_id = bs.student_id
        ORDER BY sr.student_id, sr.created_at DESC
      ),
        
      today_callbacks AS (
        SELECT lr.student_id
        FROM latest_remarks lr
        WHERE lr.student_id IS NOT NULL
          AND lr.callback_date >=current_date 
          AND lr.callback_date < current_date+1
          AND lr.lead_status in ('Admission','Application','Pre Application','Pre_Application')
        ${todaycallbacks}
      ),
      
      wishlist_students AS (
        SELECT DISTINCT bs.student_id
        FROM base_students bs
        INNER JOIN student_whishlist sw ON bs.student_id = sw.student_id
        WHERE 1=1 ${wishlistAgentFilter}
      ),
      intent_stats AS (
        SELECT 
          COUNT(CASE 
            WHEN :role = 'l2' AND bs.is_connected_yet = false THEN 1
            WHEN :role = 'l3' AND bs.is_connected_yet_l3 = false THEN 1
            ELSE NULL
          END) as not_connected
        FROM base_students bs
      ),
      unread_messages AS (
        -- FIXED: Count students with unread messages, not sum of messages
        SELECT 
          COUNT(CASE WHEN bs.number_of_unread_messages > 0 THEN 1 END) as students_with_unread_messages,
          COALESCE(SUM(COALESCE(bs.number_of_unread_messages, 0)), 0) as total_unread_messages_sum
        FROM base_students bs
      ),
      reactivity_stats AS (
        SELECT COUNT(DISTINCT bs.student_id) as reactivity_count
        FROM base_students bs
        WHERE bs.is_reactivity = true
      )
      SELECT 
        (SELECT COUNT(*) FROM fresh_leads) as fresh_leads,
        (SELECT COUNT(*) FROM today_callbacks) as today_callbacks,
        (SELECT COUNT(*) FROM wishlist_students) as wishlist_count,
        COALESCE(ints.not_connected, 0) as not_connected_yet,
        -- FIXED: Use students_with_unread_messages instead of total sum
        COALESCE(um.students_with_unread_messages, 0) as all_unread_messages_count,
        COALESCE(rs.reactivity_count, 0) as reactivity_count
      FROM intent_stats ints
      CROSS JOIN unread_messages um
      CROSS JOIN reactivity_stats rs;
    `;
    
    const replacements = {
      role
    };
    
    const results = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });

    const result = results[0] || {};

    return {
      total: 0,
      freshLeads: callback ? 0 : parseInt(result.fresh_leads) || 0,
      todayCallbacks: parseInt(result.today_callbacks) || 0,
      wishlistCount: parseInt(result.wishlist_count) || 0,
      intentHot: parseInt(result.intent_hot) || 0,
      intentWarm: parseInt(result.intent_warm) || 0,
      intentCold: parseInt(result.intent_cold) || 0,
      notConnectedYet: parseInt(result.not_connected_yet) || 0,
      allUnreadMessagesCount: parseInt(result.all_unread_messages_count) || 0,  
      reactivityCount: parseInt(result.reactivity_count) || 0
    };

  } catch (error) {
    console.error('Failed to fetch optimized overall stats:', error);
    throw new Error(`Failed to fetch optimized overall stats: ${error.message}`);
  }
};