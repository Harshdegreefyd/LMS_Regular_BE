import { QueryTypes } from 'sequelize';
import sequelize from '../config/database-config.js';
import {getOptimizedOverallStatsFromHelper} from './Student_Stats.js';

// Basic escape function (for string literals) - ensure to upgrade to parameterized queries in production
const escape = (val) =>
  typeof val === 'string'
    ? "'" + val.replace(/'/g, "''") + "'"
    : val === null || val === undefined
    ? 'NULL'
    : val;

export const getStudentsRawSQL = async (filters) => {
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
    } = filters;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const offset = (pageNum - 1) * limitNum;

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
      if (start) conds.push(`${col} >= '${start} 00:00:00'::timestamp`);
      if (end) conds.push(`${col} <= '${end} 23:59:59'::timestamp`);
      return conds.length ? conds.join(' AND ') : '';
    };

    const boolSQL = (field, val) =>
      val === undefined || val === null || val === ''
        ? ''
        : `${field} = ${val === true || val === 'true' || val === '1' ? 'true' : 'false'}`;

    const where = [];

    if (data === 'l2') where.push('s.assigned_counsellor_id IS NOT NULL');
    if (data === 'l3') where.push('s.assigned_counsellor_l3_id IS NOT NULL');

    if (selectedagent) {
      if (data === 'l3') {
        where.push(`s.assigned_counsellor_l3_id = ${escape(selectedagent)}`);
      } else if (data === 'l2') {
        where.push(`s.assigned_counsellor_id = ${escape(selectedagent)}`);
      } else {
        where.push(
          `(s.assigned_counsellor_id = ${escape(selectedagent)} OR s.assigned_counsellor_l3_id = ${escape(selectedagent)})`
        );
      }
    }

    if (mode) {
      const modes = Array.isArray(mode) ? mode : mode.split(',').map((v) => v.trim());
      if (modes.length) where.push(`s.mode IN (${modes.map(escape).join(',')})`);
    }

    const isCY = boolSQL('s.is_connected_yet', isConnectedYet);
    if (isCY) where.push(isCY);

    const isCYL3 = boolSQL('s.is_connected_yet_l3', isConnectedYetL3);
    if (isCYL3) where.push(isCYL3);

    if (hasUnreadMessages === 'true') where.push('s.number_of_unread_messages > 0');
    else if (hasUnreadMessages === 'false') where.push('s.number_of_unread_messages = 0');

    if (searchTerm) {
      const t = searchTerm.replace(/'/g, "''");
      where.push(
        `(s.student_name ILIKE '%${t}%' OR s.student_email ILIKE '%${t}%' OR s.student_phone ILIKE '%${t}%' OR s.student_id ILIKE '%${t}%' OR s.student_secondary_email ILIKE '%${t}%')`
      );
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

    // REMARK FILTERS --> USE 'lr.' INSTEAD OF 'sr.' in the main query context
    const hasCallbackFilters =
      callbackDate_start || callbackDate_end ||
      nextCallDate_start || nextCallDate_end ||
      remarks || callback;
    const remarkWhere = [];
    if (leadStatus) remarkWhere.push(inSQL('lr.lead_status', leadStatus));
    if (leadSubStatus) remarkWhere.push(inSQL('lr.lead_sub_status', leadSubStatus));
    if (callingStatus) remarkWhere.push(inSQL('lr.calling_status', callingStatus));
    if (subCallingStatus) remarkWhere.push(inSQL('lr.sub_calling_status', subCallingStatus));
    if (callbackDate_start || callbackDate_end)
      remarkWhere.push(dateRangeSQL('lr.callback_date', callbackDate_start, callbackDate_end));
    if (nextCallDate_start || nextCallDate_end)
      remarkWhere.push(dateRangeSQL('lr.callback_date', nextCallDate_start, nextCallDate_end));
    if (remarks) remarkWhere.push(`lr.remarks ILIKE '%' || ${escape(remarks)} || '%'`);

    if (callback) {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const todayStart = todayStr + ' 00:00:00';
      const todayEnd = todayStr + ' 23:59:59';
      switch (callback.toLowerCase()) {
        case 'today':
          remarkWhere.push(`lr.callback_date >= '${todayStart}'::timestamp AND lr.callback_date <= '${todayEnd}'::timestamp`);
          break;
        case 'overdue':
          remarkWhere.push(`lr.callback_date < '${todayStart}'::timestamp AND lr.callback_date IS NOT NULL`);
          break;
        case 'all':
          remarkWhere.push('lr.callback_date IS NOT NULL');
          break;
        case 'combined':
          remarkWhere.push(`lr.callback_date <= '${todayEnd}'::timestamp AND lr.callback_date IS NOT NULL`);
          break;
      }
    }
    if (hasCallbackFilters) {
      remarkWhere.push(`lr.lead_status IN ('Pre Application', 'Pre_Application', 'Admission', 'Application')`);
    }

    // --- UTM filters ---
    const utmWhere = [];
    if (utmCampaign) utmWhere.push(`la.utm_campaign ILIKE '%' || ${escape(utmCampaign)} || '%'`);
    if (utmSource) utmWhere.push(`la.utm_source ILIKE '%' || ${escape(utmSource)} || '%'`);
    if (utmMedium) utmWhere.push(`la.utm_medium ILIKE '%' || ${escape(utmMedium)} || '%'`);
    if (utmKeyword) utmWhere.push(`la.utm_keyword ILIKE '%' || ${escape(utmKeyword)} || '%'`);
    if (utmCampaignId) utmWhere.push(`la.utm_campaign_id = ${escape(utmCampaignId)}`);
    if (utmAdgroupId) utmWhere.push(`la.utm_adgroup_id = ${escape(utmAdgroupId)}`);
    if (utmCreativeId) utmWhere.push(`la.utm_creative_id = ${escape(utmCreativeId)}`);
    if (source) {
      const arr = Array.isArray(source) ? source : source.split(',').map((v) => v.trim());
      if (arr.length) {
        utmWhere.push(`(${arr.map((v) => `la.source ILIKE '%' || ${escape(v)} || '%'`).join(' OR ')})`);
      }
    }

    // LATEST REMARK CTE (uses sr)
    const lRemarkSQL = `
      latest_remark AS (
        SELECT *
        FROM (
          SELECT DISTINCT ON (sr.student_id)
            sr.student_id, sr.remark_id, sr.lead_status, sr.lead_sub_status, sr.calling_status,
            sr.sub_calling_status, sr.remarks, sr.callback_date, sr.callback_time,
            sr.counsellor_id, sr.created_at as remark_created_at
          FROM student_remarks sr
          ORDER BY sr.student_id, sr.created_at DESC
        ) latest
        ${selectedagent ? `WHERE counsellor_id = ${escape(selectedagent)}` : ''}
      )
    `;
    const remarkCountSQL = `
      remark_counts AS (
        SELECT student_id, COUNT(*) as total_remarks
        FROM student_remarks
        GROUP BY student_id
      )`;
    const leadActivitySQL = `
      first_lead_activity AS (
        SELECT DISTINCT ON (la.student_id)
          la.student_id, la.utm_source, la.utm_medium, la.utm_campaign, la.utm_keyword,
          la.utm_campaign_id, la.utm_adgroup_id, la.utm_creative_id, la.source,
          la.source_url, la.created_at as activity_created_at
        FROM student_lead_activities la
        ${utmWhere.length > 0 ? 'WHERE ' + utmWhere.join(' AND ') : ''}
        ORDER BY la.student_id, la.created_at ASC
      )`;

    let orderBySQL = '';
    if (remarkssort) {
      orderBySQL = `ORDER BY remark_count ${remarkssort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
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
    } else {
      orderBySQL = `ORDER BY s.created_at ${sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'}`;
    }

    // Compose WHERE clauses
    const whereClauses = [...where];
    if (freshLeads === 'Fresh') {
      if (selectedagent) {
        whereClauses.push(
          `NOT EXISTS (
            SELECT 1 
            FROM student_remarks sr 
            WHERE sr.student_id = s.student_id AND sr.counsellor_id = ${escape(selectedagent)}
          )`
        );
      } else {
        whereClauses.push('lr.student_id IS NULL');
      }
    } else if (remarkWhere.length) {
      // If not fresh leads, but have remark filters, ensure students have remarks
      whereClauses.push('lr.student_id IS NOT NULL');
    }

    if (remarkWhere.length > 0) whereClauses.push(remarkWhere.join(' AND '));
    if (utmWhere.length) {
      whereClauses.push('fla.student_id IS NOT NULL');
    }

    const whereSQL = whereClauses.length > 0 ? 'WHERE ' + whereClauses.filter(Boolean).join(' AND ') : '';

    const ctesSQL = [lRemarkSQL, remarkCountSQL, leadActivitySQL].join(',\n');

    const mainQuery = `
      WITH
      ${ctesSQL}
      SELECT
        s.student_id,
        s.student_name,
        s.student_email,
        s.student_phone,
        s.total_remarks_l3,
        s.created_at,
        s.assigned_l3_date,
        s.last_call_date_l3,
        s.next_call_time_l3,
        s.is_reactivity,
        s.next_call_date_l3,

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
        fla.activity_created_at,

        COALESCE(rc.total_remarks, 0) as remark_count

      FROM students s
      LEFT JOIN counsellors c1 ON s.assigned_counsellor_id = c1.counsellor_id
      LEFT JOIN counsellors c2 ON s.assigned_counsellor_l3_id = c2.counsellor_id
      LEFT JOIN latest_remark lr ON s.student_id = lr.student_id
      LEFT JOIN remark_counts rc ON s.student_id = rc.student_id
      LEFT JOIN first_lead_activity fla ON s.student_id = fla.student_id
      ${whereSQL}
      ${orderBySQL}
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const countQuery = `
      WITH
      ${ctesSQL}
      SELECT COUNT(DISTINCT s.student_id) as total
      FROM students s
      LEFT JOIN counsellors c1 ON s.assigned_counsellor_id = c1.counsellor_id
      LEFT JOIN counsellors c2 ON s.assigned_counsellor_l3_id = c2.counsellor_id
      LEFT JOIN latest_remark lr ON s.student_id = lr.student_id
      LEFT JOIN remark_counts rc ON s.student_id = rc.student_id
      LEFT JOIN first_lead_activity fla ON s.student_id = fla.student_id
      ${whereSQL}
    `;

    const studentWhereStr = where.filter(Boolean).join(' AND ') || '1=1';
    const remarkWhereStr = remarkWhere.filter(Boolean).join(' AND ') || '1=1';
    const utmWhereStr = utmWhere.filter(Boolean).join(' AND ') || '1=1';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    console.time('time taken by main query')
    const [students, countResult, overallStats = {}] = await Promise.all([
      sequelize.query(mainQuery, { type: QueryTypes.SELECT }),
      sequelize.query(countQuery, { type: QueryTypes.SELECT }),
      freshLeads
        ? Promise.resolve({})
        : getOptimizedOverallStatsFromHelper({
            studentWhere: studentWhereStr,
            remarkWhere: remarkWhereStr,
            utmWhere: utmWhereStr,
            todayStart: today,
            todayEnd: tomorrow,
            selectedagent,
            callback
          }),
    ]);
        console.timeEnd('time taken by main query')

    function convertFlatArrayToNested(arr) {
      return arr.map((item) => {
        return {
          student_id: item.student_id,
          student_name: item.student_name,
          student_email: item.student_email,
          student_phone: item.student_phone,
          total_remarks_l3: item.total_remarks_l3,
          next_call_date_l3:item?.next_call_date_l3,
          last_call_date_l3:item?.last_call_date_l3,
          next_call_time_l3:item?.next_call_time_l3,
          is_connected_yet_l3:item?.is_connected_yet_l3,
          remark_count: item.remark_count,
          created_at: item.created_at,
          assigned_l3_date:item?.assigned_l3_date,
          is_reactivity:item?.is_reactivity,
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
      });
    }

    const totalCount = parseInt(countResult[0]?.total || 0);
    const totalPages = Math.ceil(totalCount / limitNum);
    overallStats.total = totalCount;
    return {
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
        student: where,
        remarks: remarkWhere,
        utm: utmWhere,
      },
    };
  } catch (error) {
    console.error('Error in getStudentsRawSQL:', error);
    throw error;
  }
};

