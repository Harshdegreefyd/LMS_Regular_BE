import { QueryTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
import { getOptimizedOverallStatsFromHelper } from './Student_Stats.js';

const escape = (val) =>
  typeof val === 'string'
    ? "'" + val.replace(/'/g, "''") + "'"
    : val === null || val === undefined
      ? 'NULL'
      : val;

export const getStudentsRawSQL = async (filters, req, isDownload = false) => {
  try {
    const {
      page = 1,
      limit = 10,
      data,
      selectedagent,
      freshLeads,
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
      remarks,
      callbackDate_start,
      callbackDate_end,
      sortBy = 'created_at',
      sortOrder = 'desc',
      isreactivity,
      callback,
      remarkssort,
      createdAtsort,
      lastCallsort,
      nextCallbacksort,
      userrole,
      lead_reactive,
      // DOWNLOAD-ONLY FILTERS - only used when isDownload=true
      firstCallDateL2_start,
      firstCallDateL2_end,
      firstCallDateL3_start,
      firstCallDateL3_end,
      firstIccDate_start,
      firstIccDate_end,
      admissionDate_start,
      admissionDate_end,
      totalConnectedCalls_min,
      totalConnectedCalls_max,
      isPreNi
    } = filters;

    const isAnalyser = userrole === 'Analyser';
    const requestingUser = req?.user;
    console.log('User role from JWT:', requestingUser?.role);
    console.log('Userrole from filters:', userrole);
    console.log('Is Analyser:', isAnalyser);

    const userRole = requestingUser?.role || userrole;
    const userId = requestingUser?.id || requestingUser?.counsellor_id;

    // For downloads: no pagination, get all records
    const pageNum = isDownload ? 1 : Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = isDownload ? 1000000 : Math.max(parseInt(limit, 10) || 10, 1);
    const offset = isDownload ? 0 : (pageNum - 1) * limitNum;

    const arrSQL = (field, values) => {
      if (!values) return '';
      const arr = Array.isArray(values)
        ? values
        : values.split(',').map((v) => v.trim());
      if (arr.length === 0) return '';
      return `${field} && ARRAY[${arr.map(escape).join(',')}]`;
    };

    const inSQL = (field, values) => {
      if (!values) return '';
      const arr = Array.isArray(values)
        ? values
        : values.split(',').map((v) => v.trim());
      if (arr.length === 0) return '';
      return `${field} IN (${arr.map(escape).join(',')})`;
    };

    const textSQL = (field, val, exact = false) =>
      !val
        ? ''
        : exact
          ? `${field} = ${escape(val)}`
          : `${field} ILIKE '%' || ${escape(val)} || '%'`;

    const dateRangeSQL = (col, start, end) => {
      const conds = [];
      if (start) conds.push(`${col} >= '${start} 00:00:00'::timestamp - interval '5 hours 30 minutes'`);
      if (end) conds.push(`${col} <= '${end} 23:59:59'::timestamp - interval '5 hours 30 minutes'`);
      return conds.length ? conds.join(' AND ') : '';
    };

    const boolSQL = (field, val) =>
      val === undefined || val === null || val === ''
        ? ''
        : `${field} = ${val === true || val === 'true' || val === '1' ? 'true' : 'false'}`;

    const where = [];

    // Role-based filtering (same for both)
    if (userRole === 'to') {
      const teamMembersQuery = `
        SELECT counsellor_id, role 
        FROM counsellors 
        WHERE assigned_to = ${escape(userId)}
        AND (role = 'l2' OR role = 'l3')
      `;
      const teamMembersResult = await sequelize.query(teamMembersQuery, { type: QueryTypes.SELECT });

      const l2TeamIds = teamMembersResult.filter(c => c.role === 'l2').map(c => c.counsellor_id);
      const l3TeamIds = teamMembersResult.filter(c => c.role === 'l3').map(c => c.counsellor_id);

      if (!data || data === 'to') {
        if (selectedagent) {
          if (selectedagent === userId) {
            where.push(`s.assigned_team_owner_id = ${escape(userId)}`);
          } else if (l2TeamIds.includes(selectedagent)) {
            where.push(`s.assigned_counsellor_id = ${escape(selectedagent)}`);
          } else if (l3TeamIds.includes(selectedagent)) {
            where.push(`s.assigned_counsellor_l3_id = ${escape(selectedagent)}`);
          } else {
            where.push('1 = 0');
          }
        } else {
          const conditions = [];
          conditions.push(`s.assigned_team_owner_id = ${escape(userId)}`);
          if (l2TeamIds.length > 0) {
            conditions.push(`s.assigned_counsellor_id IN (${l2TeamIds.map(escape).join(',')})`);
          }
          if (l3TeamIds.length > 0) {
            conditions.push(`s.assigned_counsellor_l3_id IN (${l3TeamIds.map(escape).join(',')})`);
          }
          where.push(`(${conditions.join(' OR ')})`);
        }
      } else if (data === 'l2') {
        if (selectedagent) {
          if (l2TeamIds.includes(selectedagent)) {
            where.push(`s.assigned_counsellor_id = ${escape(selectedagent)}`);
          } else {
            where.push('1 = 0');
          }
        } else {
          if (l2TeamIds.length > 0) {
            where.push(`s.assigned_counsellor_id IN (${l2TeamIds.map(escape).join(',')})`);
          } else {
            where.push('1 = 0');
          }
        }
      } else if (data === 'l3') {
        if (selectedagent) {
          if (l3TeamIds.includes(selectedagent)) {
            where.push(`s.assigned_counsellor_l3_id = ${escape(selectedagent)}`);
          } else {
            where.push('1 = 0');
          }
        } else {
          if (l3TeamIds.length > 0) {
            where.push(`s.assigned_counsellor_l3_id IN (${l3TeamIds.map(escape).join(',')})`);
          } else {
            where.push('1 = 0');
          }
        }
      }
    } else if (userRole === 'l2') {
      where.push('s.assigned_counsellor_id IS NOT NULL');
      if (selectedagent) {
        where.push(`s.assigned_counsellor_id = ${escape(selectedagent)}`);
      } else {
        where.push(`s.assigned_counsellor_id = ${escape(userId)}`);
      }
    } else if (userRole === 'l3') {
      where.push('s.assigned_counsellor_l3_id IS NOT NULL');
      if (selectedagent) {
        where.push(`s.assigned_counsellor_l3_id = ${escape(selectedagent)}`);
      } else {
        where.push(`s.assigned_counsellor_l3_id = ${escape(userId)}`);
      }
    } else if (userRole === 'Supervisor') {
      if (data === 'l2') where.push('s.assigned_counsellor_id IS NOT NULL');
      if (data === 'l3') where.push('s.assigned_counsellor_l3_id IS NOT NULL');
      if (selectedagent) {
        if (data === 'l2') {
          where.push(`s.assigned_counsellor_id = ${escape(selectedagent)}`);
        } else if (data === 'l3') {
          where.push(`s.assigned_counsellor_l3_id = ${escape(selectedagent)}`);
        }
      }
    }

    if (data && !userRole) {
      if (data === 'l2') where.push('s.assigned_counsellor_id IS NOT NULL');
      if (data === 'l3') where.push('s.assigned_counsellor_l3_id IS NOT NULL');
      if (data === 'to') where.push('s.assigned_team_owner_id IS NOT NULL');
    }

    let supervisorCounsellorIds = [];
    let isSupervisorView = false;

    if (selectedagent && data && data !== 'to') {
      const teamMembersQuery = `
        SELECT counsellor_id 
        FROM counsellors 
        WHERE assigned_to = ${escape(selectedagent)}
      `;
      const teamMembersResult = await sequelize.query(teamMembersQuery, { type: QueryTypes.SELECT });
      supervisorCounsellorIds = teamMembersResult.map(c => c.counsellor_id);
      supervisorCounsellorIds.push(selectedagent);
      if (supervisorCounsellorIds.length > 1) {
        isSupervisorView = true;
        if (data === 'l2') {
          where.push(`s.assigned_counsellor_id IN (${supervisorCounsellorIds.map(escape).join(',')})`);
        } else if (data === 'l3') {
          where.push(`s.assigned_counsellor_l3_id IN (${supervisorCounsellorIds.map(escape).join(',')})`);
        }
      }
    }

    if (source) {
      const arr = Array.isArray(source) ? source : source.split(',').map((v) => v.trim());
      if (arr.length) {
        where.push(`s.source ILIKE ANY(ARRAY[${arr.map(escape).join(',')}])`);
      }
    }

    if (mode) {
      const modes = Array.isArray(mode) ? mode : mode.split(',').map((v) => v.trim());
      if (modes.length) where.push(`s.mode IN (${modes.map(escape).join(',')})`);
    }

    const isCY = boolSQL('s.is_connected_yet', isConnectedYet);
    if (isCY) where.push(isCY);
    const leadReactive = boolSQL('s.is_reactivity', lead_reactive);
    if (leadReactive) where.push(leadReactive);
    const isCYL3 = boolSQL('s.is_connected_yet_l3', isConnectedYetL3);
    if (isCYL3) where.push(isCYL3);

    if (hasUnreadMessages === 'true') where.push('s.number_of_unread_messages > 0');
    else if (hasUnreadMessages === 'false') where.push('s.number_of_unread_messages = 0');

    if (searchTerm) {
      const t = searchTerm.replace(/'/g, "''");
      if (isAnalyser) {
        where.push(
          `(s.student_name ILIKE '%${t}%' OR s.student_id ILIKE '%${t}%')`
        );
      } else {
        where.push(
          `(s.student_name ILIKE '%${t}%' OR s.student_email ILIKE '%${t}%' OR s.student_phone ILIKE '%${t}%' OR s.student_id ILIKE '%${t}%' OR s.student_secondary_email ILIKE '%${t}%')`
        );
      }
    }
    if (isreactivity) where.push('s.is_reactivity = true');

    if (createdAt_start || createdAt_end)
      where.push(dateRangeSQL('s.created_at', createdAt_start, createdAt_end));
    if (nextCallDateL3_start || nextCallDateL3_end)
      where.push(dateRangeSQL('s.next_call_date_l3', nextCallDateL3_start, nextCallDateL3_end));
    if (lastCallDateL3_start || lastCallDateL3_end)
      where.push(dateRangeSQL('s.last_call_date_l3', lastCallDateL3_start, lastCallDateL3_end));

    if (preferredCity) where.push(arrSQL('s.preferred_city', preferredCity));
    if (preferredState) where.push(arrSQL('s.preferred_state', preferredState));
    if (currentCity) where.push(textSQL('s.student_current_city', currentCity));
    if (currentState) where.push(textSQL('s.student_current_state', currentState));

    if (preferredStream) where.push(arrSQL('s.preferred_stream', preferredStream));
    if (preferredDegree) where.push(arrSQL('s.preferred_degree', preferredDegree));
    if (preferredLevel) where.push(arrSQL('s.preferred_level', preferredLevel));
    if (preferredSpecialization) where.push(arrSQL('s.preferred_specialization', preferredSpecialization));

    if (preferredBudget_min || preferredBudget_max) {
      const b = [];
      if (preferredBudget_min) b.push(`s.preferred_budget >= ${parseInt(preferredBudget_min, 10)}`);
      if (preferredBudget_max) b.push(`s.preferred_budget <= ${parseInt(preferredBudget_max, 10)}`);
      if (b.length) where.push(b.join(' AND '));
    }

    if (callingStatusL3) where.push(inSQL('s.calling_status_l3', callingStatusL3));
    if (subCallingStatusL3) where.push(inSQL('s.sub_calling_status_l3', subCallingStatusL3));

    if (leadStatus) where.push(inSQL('lr.lead_status', leadStatus));
    if (leadSubStatus) where.push(inSQL('lr.lead_sub_status', leadSubStatus));
    if (callingStatus) where.push(inSQL('lr.calling_status', callingStatus));
    if (subCallingStatus) where.push(inSQL('lr.sub_calling_status', subCallingStatus));

    if (callbackDate_start || callbackDate_end) {
      where.push(dateRangeSQL('lr.callback_date', callbackDate_start, callbackDate_end));
    }

    if (nextCallDate_start || nextCallDate_end) {
      where.push(dateRangeSQL('lr.callback_date', nextCallDate_start, nextCallDate_end));
    }

    if (remarks) {
      where.push(`lr.remarks ILIKE '%' || ${escape(remarks)} || '%'`);
    }

    if (callback) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const todayStart = todayStr + ' 00:00:00';
      const todayEnd = todayStr + ' 23:59:59';

      switch (callback.toLowerCase()) {
        case 'today':
          where.push(`lr.callback_date >= '${todayStart}'::timestamp AND lr.callback_date <= '${todayEnd}'::timestamp`);
          break;
        case 'overdue':
          where.push(`lr.callback_date < '${todayStart}'::timestamp AND lr.callback_date IS NOT NULL`);
          break;
        case 'all':
          where.push('lr.callback_date IS NOT NULL');
          break;
        case 'combined':
          where.push(`lr.callback_date <= '${todayEnd}'::timestamp AND lr.callback_date IS NOT NULL`);
          break;
      }
    }

    // DOWNLOAD-ONLY FILTERS (only applied when isDownload=true)
    if (isDownload) {
      if (firstCallDateL2_start || firstCallDateL2_end) {
        where.push(dateRangeSQL('frl2.first_call_date_l2', firstCallDateL2_start, firstCallDateL2_end));
      }
      if (firstCallDateL3_start || firstCallDateL3_end) {
        where.push(dateRangeSQL('frl3.first_call_date_l3', firstCallDateL3_start, firstCallDateL3_end));
      }
      if (firstIccDate_start || firstIccDate_end) {
        where.push(dateRangeSQL('ficc.first_icc_date', firstIccDate_start, firstIccDate_end));
      }
      if (admissionDate_start || admissionDate_end) {
        where.push(dateRangeSQL('adm.admission_date', admissionDate_start, admissionDate_end));
      }
      if (totalConnectedCalls_min || totalConnectedCalls_max) {
        const c = [];
        if (totalConnectedCalls_min) c.push(`COALESCE(ccc.total_connected_calls, 0) >= ${parseInt(totalConnectedCalls_min, 10)}`);
        if (totalConnectedCalls_max) c.push(`COALESCE(ccc.total_connected_calls, 0) <= ${parseInt(totalConnectedCalls_max, 10)}`);
        if (c.length) where.push(c.join(' AND '));
      }
      if (isPreNi) {
        if (isPreNi === 'Yes' || isPreNi === 'true' || isPreNi === true) {
          where.push('pns.student_id IS NOT NULL');
        } else if (isPreNi === 'No' || isPreNi === 'false' || isPreNi === false) {
          where.push('hia.student_id IS NOT NULL');
        }
      }
    }

    const utmWhere = [];
    if (utmCampaign) {
      const campaigns = Array.isArray(utmCampaign) ? utmCampaign : utmCampaign.split(',').map((v) => v.trim());
      if (campaigns.length) utmWhere.push(`la.utm_campaign IN (${campaigns.map(escape).join(',')})`);
    }
    if (utmSource) utmWhere.push(`la.utm_source ILIKE '%' || ${escape(utmSource)} || '%'`);
    if (utmMedium) utmWhere.push(`la.utm_medium ILIKE '%' || ${escape(utmMedium)} || '%'`);
    if (utmKeyword) utmWhere.push(`la.utm_keyword ILIKE '%' || ${escape(utmKeyword)} || '%'`);
    if (utmCampaignId) utmWhere.push(`la.utm_campaign_id = ${escape(utmCampaignId)}`);
    if (utmAdgroupId) utmWhere.push(`la.utm_adgroup_id = ${escape(utmAdgroupId)}`);
    if (utmCreativeId) utmWhere.push(`la.utm_creative_id = ${escape(utmCreativeId)}`);

    const latestRemarkWhere = selectedagent && isSupervisorView && data && data !== 'to'
      ? `WHERE sr.counsellor_id IN (${supervisorCounsellorIds.map(escape).join(',')})`
      : selectedagent && data && data !== 'to'
        ? `WHERE sr.counsellor_id = ${escape(selectedagent)}`
        : '';

    // BASE CTEs (for both normal and download)
    const baseCTEs = `
      latest_remark AS (
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id, sr.remark_id, sr.lead_status, sr.lead_sub_status, sr.calling_status,
          sr.sub_calling_status, sr.remarks, sr.callback_date, sr.callback_time,
          sr.created_at as remark_created_at, sr.counsellor_id
        FROM student_remarks sr
        ${latestRemarkWhere}
        ORDER BY sr.student_id, sr.created_at DESC
      ),
      first_lead_activity AS (
        SELECT DISTINCT ON (la.student_id)
          la.student_id, la.utm_source, la.utm_medium, la.utm_campaign, la.utm_keyword,
          la.utm_campaign_id, la.utm_adgroup_id, la.utm_creative_id, la.source,
          la.source_url, la.created_at as activity_created_at
        FROM student_lead_activities la
        ${utmWhere.length > 0 ? 'WHERE ' + utmWhere.join(' AND ') : ''}
        ORDER BY la.student_id, la.created_at ASC
      )`;

    // DOWNLOAD-ONLY CTEs (only when isDownload=true)
    const downloadCTEs = isDownload ? `,
      first_application_remark AS (
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.created_at as first_form_filled_date
        FROM student_remarks sr
        WHERE sr.lead_status ILIKE 'Application'
        ORDER BY sr.student_id, sr.created_at ASC
      ),
      first_remark_l2 AS (
        SELECT 
          sr.student_id,
          MIN(sr.created_at) as first_call_date_l2
        FROM student_remarks sr
        INNER JOIN counsellors c ON sr.counsellor_id = c.counsellor_id
        WHERE c.role = 'l2'
        GROUP BY sr.student_id
      ),
      first_remark_l3 AS (
        SELECT 
          sr.student_id,
          MIN(sr.created_at) as first_call_date_l3
        FROM student_remarks sr
        INNER JOIN counsellors c ON sr.counsellor_id = c.counsellor_id
        WHERE c.role = 'l3'
        GROUP BY sr.student_id
      ),
      first_icc_remark AS (
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.created_at as first_icc_date
        FROM student_remarks sr
        WHERE sr.lead_sub_status ILIKE 'Initial Counseling Completed'
        ORDER BY sr.student_id, sr.created_at ASC
      ),
      connected_calls_count AS (
        SELECT 
          sr.student_id,
          COUNT(*) as total_connected_calls
        FROM student_remarks sr
        WHERE sr.calling_status ILIKE 'Connected'
        GROUP BY sr.student_id
      ),
      admission_remark AS (
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.created_at as admission_date
        FROM student_remarks sr
        WHERE sr.lead_status ILIKE 'Admission'
        ORDER BY sr.student_id, sr.created_at ASC
      ),
      has_icc_or_admission AS (
        SELECT DISTINCT
          sr.student_id
        FROM student_remarks sr
        WHERE sr.lead_sub_status ILIKE 'Initial Counseling Completed'
           OR sr.lead_status ILIKE 'Admission Application Enrolled'
      ),
      pre_ni_students AS (
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
      )` : '';

    const ctesSQL = `WITH ${baseCTEs}${downloadCTEs}`;

  let orderBySQL = '';

if (remarkssort) {
  orderBySQL = `ORDER BY s.remarks_count ${remarkssort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
} else if (lastCallsort) {
  orderBySQL = `ORDER BY latest_remark_date ${lastCallsort.toUpperCase() === 'ASC' ? 'ASC NULLS LAST' : 'DESC NULLS LAST'}`;
} else if (nextCallbacksort) {
  orderBySQL = `ORDER BY latest_callback_date ${nextCallbacksort.toUpperCase() === 'ASC' ? 'ASC NULLS LAST' : 'DESC NULLS LAST'}`;
} else if (createdAtsort) {
  if (data === 'l3') {
    orderBySQL = `ORDER BY s.assigned_l3_date ${createdAtsort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
  } else {
    orderBySQL = `ORDER BY s.created_at ${createdAtsort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
  }
} 
else if (callback) {

  orderBySQL = `ORDER BY 
    lr.callback_date ASC NULLS LAST,
    lr.callback_time ASC NULLS LAST`;
}
else {
  if (userrole == 'l3') {
    orderBySQL = `ORDER BY s.assigned_l3_date ${sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
  } else {
    orderBySQL = `ORDER BY s.created_at ${sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
  }
}

    const whereClauses = [...where];

    if (freshLeads === 'Fresh') {
      if (selectedagent && data && data !== 'to') {
        if (isSupervisorView) {
          whereClauses.push(
            `NOT EXISTS (
              SELECT 1 
              FROM student_remarks sr 
              WHERE sr.student_id = s.student_id 
              AND sr.counsellor_id IN (${supervisorCounsellorIds.map(escape).join(',')})
            )`
          );
        } else {
          whereClauses.push(
            `NOT EXISTS (
              SELECT 1 
              FROM student_remarks sr 
              WHERE sr.student_id = s.student_id AND sr.counsellor_id = ${escape(selectedagent)}
            )`
          );
        }
      } else {
        if (data == 'l3') {
          whereClauses.push(`s.total_remarks_l3='0' `);
        }
        else {
          whereClauses.push('lr.student_id IS NULL');
        }
      }
    } else {
      const hasRemarkFilters = leadStatus || leadSubStatus || callingStatus || subCallingStatus ||
        callbackDate_start || callbackDate_end || nextCallDate_start ||
        nextCallDate_end || remarks || callback;

      if (hasRemarkFilters) {
        whereClauses.push('lr.student_id IS NOT NULL');
      }
    }

    if (utmWhere.length) {
      whereClauses.push('fla.student_id IS NOT NULL');
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.filter(Boolean).join(' AND ') : '';

    // BASE SELECT FIELDS (for analyser only - masked)
    const baseSelectFields = `
      s.student_id,
      s.student_name,
      CASE 
        WHEN s.student_email IS NOT NULL AND s.student_email != '' AND POSITION('@' IN s.student_email) > 0
        THEN SUBSTRING(s.student_email, 1, LEAST(POSITION('@' IN s.student_email) - 1, 3)) || '***@xxxxxx.com'
        ELSE 'xxxxxx@xxxxxx.com'
      END as student_email,
      CASE 
        WHEN s.student_phone IS NOT NULL AND s.student_phone != '' AND LENGTH(s.student_phone) > 4
        THEN SUBSTRING(s.student_phone, 1, 4) || 'XXXXXX'
        ELSE 'XXXXXX'
      END as student_phone,
      s.total_remarks_l3,
      s.created_at,
      s.assigned_l3_date,
      s.last_call_date_l3,
      s.next_call_time_l3,
      s.is_reactivity,
      s.next_call_date_l3,
      s.remarks_count,
      s.mode,
      s.source,
      s.assigned_team_owner_date,
    `;

    // NORMAL SELECT FIELDS (for non-analyser - unmasked)
    const normalSelectFields = isAnalyser ? baseSelectFields : `
      s.student_id,
      s.student_name,
      s.number_of_unread_messages,
      s.student_email,
      s.student_phone,
      s.total_remarks_l3,
      s.created_at,
      s.assigned_l3_date,
      s.last_call_date_l3,
      s.next_call_time_l3,
      s.is_reactivity,
      s.next_call_date_l3,
      s.remarks_count,
      s.mode,
      s.source,
      s.assigned_team_owner_date,
    `;

    // DOWNLOAD-ONLY SELECT FIELDS
    const downloadSelectFields = isDownload ? `
      s.highest_degree,
      s.completion_year,
      s.current_profession,
      s.current_role,
      s.work_experience,
      s.student_age,
      s.objective,
      s.preferred_city,
      s.preferred_state,
      s.student_current_city,
      s.student_current_state,
      s.preferred_stream,
      s.preferred_degree,
      s.preferred_level,
      s.preferred_specialization,
      s.preferred_budget,
      s.first_callback_l2,
      s.first_callback_l3,
      s.first_form_filled_date,
      s.calling_status_l3,
      s.sub_calling_status_l3,
      s.is_connected_yet,
      s.is_connected_yet_l3,
      s.remarks_l3,
      s.number_of_unread_messages,
      frl2.first_call_date_l2,
      frl3.first_call_date_l3,
      ficc.first_icc_date,
      COALESCE(ccc.total_connected_calls, 0) as total_connected_calls,
      adm.admission_date,
      far.first_form_filled_date as calculated_form_filled_date,
      CASE 
        WHEN hia.student_id IS NOT NULL THEN 'No'
        WHEN pns.student_id IS NOT NULL THEN 'Yes'
        ELSE 'Unknown'
      END as is_pre_ni,
    ` : '';

    const mainQuery = `
      ${ctesSQL}
      SELECT
        ${isDownload ? downloadSelectFields : ''}
        ${normalSelectFields}
        c1.counsellor_id as counsellor_id,
        c1.counsellor_name as counsellor_name,
        c1.counsellor_email as counsellor_email,
        c1.role as counsellor_role,

        c2.counsellor_id as counsellor_l3_id,
        c2.counsellor_name as counsellor_l3_name,
        c2.counsellor_email as counsellor_l3_email,
        c2.role as counsellor_l3_role,

        lr.remark_id,
        lr.lead_status,
        lr.lead_sub_status,
        lr.calling_status,
        lr.sub_calling_status,
        lr.remarks,
        lr.callback_date as latest_callback_date,
        lr.callback_time,
        lr.remark_created_at as latest_remark_date,

        fla.utm_source,
        fla.utm_medium,
        fla.utm_campaign,
        fla.utm_keyword,
        fla.utm_campaign_id,
        fla.utm_adgroup_id,
        fla.utm_creative_id,
        fla.source,
        fla.source_url,
        fla.activity_created_at
        ${isDownload ? '' : ''}

      FROM students s
      LEFT JOIN counsellors c1 ON s.assigned_counsellor_id = c1.counsellor_id
      LEFT JOIN counsellors c2 ON s.assigned_counsellor_l3_id = c2.counsellor_id
      LEFT JOIN latest_remark lr ON s.student_id = lr.student_id
      LEFT JOIN first_lead_activity fla ON s.student_id = fla.student_id
      ${isDownload ? `
      LEFT JOIN first_remark_l2 frl2 ON s.student_id = frl2.student_id
      LEFT JOIN first_remark_l3 frl3 ON s.student_id = frl3.student_id
      LEFT JOIN first_icc_remark ficc ON s.student_id = ficc.student_id
      LEFT JOIN connected_calls_count ccc ON s.student_id = ccc.student_id
      LEFT JOIN admission_remark adm ON s.student_id = adm.student_id
      LEFT JOIN has_icc_or_admission hia ON s.student_id = hia.student_id
      LEFT JOIN pre_ni_students pns ON s.student_id = pns.student_id
      LEFT JOIN first_application_remark far ON s.student_id = far.student_id
      ` : ''}
      ${whereSQL}
      ${orderBySQL}
      ${!isDownload ? `LIMIT ${limitNum} OFFSET ${offset}` : ''}
    `;

    const countQuery = `
      ${ctesSQL}
      SELECT COUNT(DISTINCT s.student_id) as total
      FROM students s
      LEFT JOIN counsellors c1 ON s.assigned_counsellor_id = c1.counsellor_id
      LEFT JOIN counsellors c2 ON s.assigned_counsellor_l3_id = c2.counsellor_id
      LEFT JOIN latest_remark lr ON s.student_id = lr.student_id
      LEFT JOIN first_lead_activity fla ON s.student_id = fla.student_id
      ${isDownload ? `
      LEFT JOIN first_remark_l2 frl2 ON s.student_id = frl2.student_id
      LEFT JOIN first_remark_l3 frl3 ON s.student_id = frl3.student_id
      LEFT JOIN first_icc_remark ficc ON s.student_id = ficc.student_id
      LEFT JOIN connected_calls_count ccc ON s.student_id = ccc.student_id
      LEFT JOIN admission_remark adm ON s.student_id = adm.student_id
      LEFT JOIN has_icc_or_admission hia ON s.student_id = hia.student_id
      LEFT JOIN pre_ni_students pns ON s.student_id = pns.student_id
      LEFT JOIN first_application_remark far ON s.student_id = far.student_id
      ` : ''}
      ${whereSQL}
    `;

    const studentWhereStr = where.filter(w => !w.includes('lr.')).filter(Boolean).join(' AND ') || '1=1';
    const remarkWhereStr = where.filter(w => w.includes('lr.')).map(w => w.replace('lr.', 'sr.')).filter(Boolean).join(' AND ') || '1=1';
    const utmWhereStr = utmWhere.filter(Boolean).join(' AND ') || '1=1';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [students, countResult, overallStats = {}] = await Promise.all([
      sequelize.query(mainQuery, { type: QueryTypes.SELECT }),
      sequelize.query(countQuery, { type: QueryTypes.SELECT }),
      !isDownload && freshLeads !== 'Fresh'
        ? getOptimizedOverallStatsFromHelper({
          studentWhere: studentWhereStr,
          remarkWhere: remarkWhereStr,
          utmWhere: utmWhereStr,
          todayStart: today,
          todayEnd: tomorrow,
          selectedagent,
          callback,
          role: data
        })
        : Promise.resolve({}),
    ]);

    function convertFlatArrayToNested(arr) {
      return arr.map((item) => {
        // NO MASKING LOGIC HERE!
        // Data is already correctly masked/unmasked in SQL query

        const result = {
          student_id: item.student_id,
          student_name: item.student_name,
          number_of_unread_messages: item.number_of_unread_messages,
          student_email: item.student_email,  // Use as-is from SQL (already masked/unmasked)
          student_phone: item.student_phone,  // Use as-is from SQL (already masked/unmasked)
          total_remarks_l3: item.total_remarks_l3,
          next_call_date_l3: item?.next_call_date_l3,
          last_call_date_l3: item?.last_call_date_l3,
          next_call_time_l3: item?.next_call_time_l3,
          is_connected_yet_l3: item?.is_connected_yet_l3,
          remark_count: item.remarks_count,
          created_at: item.created_at,
          assigned_l3_date: item?.assigned_l3_date,
          is_reactivity: item?.is_reactivity,
          assigned_team_owner_date: item?.assigned_team_owner_date,
          mode: item.mode,
          source: item.source,
          ...(isAnalyser && {
            data_masked: true,
            mask_note: 'Phone and email information is masked for analyser role'
          }),
          assignedCounsellor: {
            counsellor_id: item.counsellor_id,
            counsellor_name: item.counsellor_name,
            counsellor_email: item.counsellor_email,
            role: item.counsellor_role,
          },
          assignedCounsellorL3: {
            counsellor_id: item.counsellor_l3_id,
            counsellor_name: item.counsellor_l3_name,
            counsellor_email: item.counsellor_l3_email,
            role: item.counsellor_l3_role,
          },
          student_remarks: [
            {
              remark_id: item.remark_id,
              lead_status: item.lead_status,
              lead_sub_status: item.lead_sub_status,
              calling_status: item.calling_status,
              sub_calling_status: item.sub_calling_status,
              remarks: item.remarks,
              callback_date: item.latest_callback_date,
              callback_time: item.callback_time,
              created_at: item.latest_remark_date,
            },
          ],
          lead_activities: [
            {
              utm_source: item.utm_source,
              utm_medium: item.utm_medium,
              utm_campaign: item.utm_campaign,
              utm_keyword: item.utm_keyword,
              utm_campaign_id: item.utm_campaign_id,
              utm_adgroup_id: item.utm_adgroup_id,
              utm_creative_id: item.utm_creative_id,
              created_at: item.activity_created_at,
              source: item.source,
              source_url: item.source_url,
            },
          ],
        };

        // DOWNLOAD-ONLY FIELDS (only when isDownload=true)
        if (isDownload) {
          Object.assign(result, {
            highest_degree: item.highest_degree,
            completion_year: item.completion_year,
            current_profession: item.current_profession,
            current_role: item.current_role,
            work_experience: item.work_experience,
            student_age: item.student_age,
            objective: item.objective,
            preferred_city: item.preferred_city,
            preferred_state: item.preferred_state,
            student_current_city: item.student_current_city,
            student_current_state: item.student_current_state,
            preferred_stream: item.preferred_stream,
            preferred_degree: item.preferred_degree,
            preferred_level: item.preferred_level,
            preferred_specialization: item.preferred_specialization,
            preferred_budget: item.preferred_budget,
            first_callback_l2: item.first_callback_l2,
            first_callback_l3: item.first_callback_l3,
            first_form_filled_date: item.calculated_form_filled_date || item.first_form_filled_date,
            calling_status_l3: item.calling_status_l3,
            sub_calling_status_l3: item.sub_calling_status_l3,
            is_connected_yet: item.is_connected_yet,
            is_connected_yet_l3: item.is_connected_yet_l3,
            remarks_l3: item.remarks_l3,
            number_of_unread_messages: item.number_of_unread_messages,
            first_call_date_l2: item.first_call_date_l2,
            first_call_date_l3: item.first_call_date_l3,
            first_icc_date: item.first_icc_date,
            total_connected_calls: item.total_connected_calls || 0,
            admission_date: item.admission_date,
            is_pre_ni: item.is_pre_ni === 'Yes',
            pre_ni_status: item.is_pre_ni,
          });
        }

        return result;
      });
    }

    const totalCount = parseInt(countResult[0]?.total || 0);

    // For downloads: return all data without pagination
    if (isDownload) {
      return {
        success: true,
        data: convertFlatArrayToNested(students),
        totalRecords: totalCount,
        isDownload: true,
      };
    }

    // Normal response with pagination
    const totalPages = Math.ceil(totalCount / limitNum);
    overallStats.total = totalCount;

    const response = {
      success: true,
      data: convertFlatArrayToNested(students),
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      overallStats,
      appliedFilters: {
        student: where.filter(w => !w.includes('lr.')),
        remarks: where.filter(w => w.includes('lr.')),
        utm: utmWhere,
      },
      viewInfo: {
        userRole: userRole,
        userId: userId,
        isSupervisorView: data === 'to' ? false : isSupervisorView,
        supervisorCounsellorIds: data === 'to' ? [] : supervisorCounsellorIds,
        selectedagent,
        dataMode: data,
        ...(userRole === 'to' && {
          note: 'Team Owner view - showing leads based on role and filters'
        })
      },
    };

    if (isAnalyser) {
      response.mask_note = 'Phone numbers and emails are masked for analyser role';
      response.mask_details = {
        phone: 'Shows first 4 digits followed by XXXXXX',
        email: 'Shows first 3 characters of username followed by ***@xxxxxx.com'
      };
    }

    return response;
  } catch (error) {
    console.error('Error in getStudentsRawSQL:', error);
    throw error;
  }
};