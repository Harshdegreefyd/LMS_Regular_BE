
import { Sequelize, Op, literal, fn, col } from 'sequelize';
import Student from '../models/Student.js';
import Counsellor from '../models/Counsellor.js';
import StudentRemark from '../models/StudentRemark.js';
import StudentLeadActivity from '../models/StudentLeadActivity.js';
import { getOptimizedOverallStatsFromHelper as getOverallStats } from './Student_Stats.js';
import { getWhishListStudentHelper } from './whishlist-table.js';
import { getStudentsRawSQL as getStudentsRawQuery, getStudentsRawSQL } from './rawQuery.test.js'
import Analyser from '../models/Analyser.js';

export const getStudentshelper = async (filters) => {
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
      csv_exports = false,
      sortBy = 'created_at',
      sortOrder = 'desc',
      isreactivity,
      callback,
      remarkssort,
      createdAtsort,
      lastCallsort,
      nextCallbacksort,

    } = filters;

    // Pagination params
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    // Helper to parse multi-select filters
    const handleMultiSelectFilter = (value) => {
      if (!value) return null;
      if (Array.isArray(value)) return value.filter(v => v && v.toString().trim());
      if (typeof value === 'string') {
        return value.split(',').map(v => v.trim()).filter(v => v);
      }
      return [value.toString()];
    };

    // Helper for text condition (exact or partial)
    const handleTextFilter = (value, exact = false) => {
      if (!value) return null;
      return exact ? value : { [Op.iLike]: `%${value}%` };
    };

    // Helper for boolean filters
    const handleBooleanFilter = (value) => {
      if (value === undefined || value === null || value === '') return null;
      if (typeof value === 'boolean') return value;
      return value === 'true' || value === '1';
    };

    // Helper for date range queries
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

    // Helper for numerical range query
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

    // Helper for array overlap filter (Postgres specific)
    const handleArrayFilter = (values) => {
      if (!values) return null;
      const filterValues = handleMultiSelectFilter(values);
      if (!filterValues || filterValues.length === 0) return null;
      return { [Op.overlap]: filterValues };
    };

    // Build main WHERE conditions for Student
    const whereConditions = {};

    // Assigned counsellor filters depending on data level
    if (data === 'l2') {
      whereConditions.assigned_counsellor_id = { [Op.ne]: null };
    } else if (data === 'l3') {
      whereConditions.assigned_counsellor_l3_id = { [Op.ne]: null };
    }

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

    // Mode filter (only 'Regular' or 'Online')
    if (mode) {
      const modeFilter = handleMultiSelectFilter(mode);
      if (modeFilter) {
        const validModes = ['Regular', 'Online'];
        const filteredModes = modeFilter.filter(m => validModes.includes(m));
        if (filteredModes.length) {
          whereConditions.mode = filteredModes.length === 1 ? filteredModes[0] : { [Op.in]: filteredModes };
        }
      }
    }

    // Boolean filters
    const isConnectedYetFilter = handleBooleanFilter(isConnectedYet);
    if (isConnectedYetFilter !== null) whereConditions.is_connected_yet = isConnectedYetFilter;
    const isConnectedYetL3Filter = handleBooleanFilter(isConnectedYetL3);
    if (isConnectedYetL3Filter !== null) whereConditions.is_connected_yet_l3 = isConnectedYetL3Filter;

    // Number of unread messages filter strict
    if (hasUnreadMessages === 'true') {
      whereConditions.number_of_unread_messages = { [Op.gt]: 0 };
    } else if (hasUnreadMessages === 'false') {
      whereConditions.number_of_unread_messages = { [Op.eq]: 0 };
    }

    // Search term across multiple fields with iLike
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
      whereConditions[Op.and] = whereConditions[Op.and]
        ? [...(Array.isArray(whereConditions[Op.and]) ? whereConditions[Op.and] : [whereConditions[Op.and]]), searchCondition]
        : [searchCondition];
    }

    if (isreactivity) whereConditions.isreactivity = true;

    // Date ranges on Student model
    const createdAtRange = handleDateRange(createdAt_start, createdAt_end);
    if (createdAtRange) whereConditions.created_at = createdAtRange;

    const nextCallDateL3Range = handleDateRange(nextCallDateL3_start, nextCallDateL3_end);
    if (nextCallDateL3Range) whereConditions.next_call_date_l3 = nextCallDateL3Range;

    const lastCallDateL3Range = handleDateRange(lastCallDateL3_start, lastCallDateL3_end);
    if (lastCallDateL3Range) whereConditions.last_call_date_l3 = lastCallDateL3Range;

    // Location filters using array overlap or text filters
    const preferredCityFilter = handleArrayFilter(preferredCity);
    if (preferredCityFilter) whereConditions.preferred_city = preferredCityFilter;

    const preferredStateFilter = handleArrayFilter(preferredState);
    if (preferredStateFilter) whereConditions.preferred_state = preferredStateFilter;

    if (currentCity) {
      const currentCityFilter = handleTextFilter(currentCity);
      if (currentCityFilter) whereConditions.student_current_city = currentCityFilter;
    }
    if (currentState) {
      const currentStateFilter = handleTextFilter(currentState);
      if (currentStateFilter) whereConditions.student_current_state = currentStateFilter;
    }

    // Stream/Degree/Level/Specialization filters
    const preferredStreamFilter = handleArrayFilter(preferredStream);
    if (preferredStreamFilter) whereConditions.preferred_stream = preferredStreamFilter;

    const preferredDegreeFilter = handleArrayFilter(preferredDegree);
    if (preferredDegreeFilter) whereConditions.preferred_degree = preferredDegreeFilter;

    const preferredLevelFilter = handleArrayFilter(preferredLevel);
    if (preferredLevelFilter) whereConditions.preferred_level = preferredLevelFilter;

    const preferredSpecializationFilter = handleArrayFilter(preferredSpecialization);
    if (preferredSpecializationFilter) whereConditions.preferred_specialization = preferredSpecializationFilter;

    // Budget range
    if (preferredBudget_min || preferredBudget_max) {
      const budgetRange = handleNumberRange(preferredBudget_min, preferredBudget_max);
      if (budgetRange) whereConditions.preferred_budget = budgetRange;
    }

    // Calling status filters for L3
    if (callingStatusL3) {
      const callingStatusL3Filter = handleMultiSelectFilter(callingStatusL3);
      if (callingStatusL3Filter) {
        whereConditions.calling_status_l3 = callingStatusL3Filter.length === 1
          ? callingStatusL3Filter[0]
          : { [Op.in]: callingStatusL3Filter };
      }
    }

    if (subCallingStatusL3) {
      const subCallingStatusL3Filter = handleMultiSelectFilter(subCallingStatusL3);
      if (subCallingStatusL3Filter) {
        whereConditions.sub_calling_status_l3 = subCallingStatusL3Filter.length === 1
          ? subCallingStatusL3Filter[0]
          : { [Op.in]: subCallingStatusL3Filter };
      }
    }

    // Build WHERE for StudentRemark includes
    const remarkIncludeWhere = {};
    if (leadStatus) {
      remarkIncludeWhere.lead_status = Array.isArray(leadStatus) ? { [Op.in]: leadStatus } : leadStatus;
    }
    if (leadSubStatus) {
      remarkIncludeWhere.lead_sub_status = Array.isArray(leadSubStatus) ? { [Op.in]: leadSubStatus } : leadSubStatus;
    }
    if (callingStatus) {
      remarkIncludeWhere.calling_status = Array.isArray(callingStatus) ? { [Op.in]: callingStatus } : callingStatus;
    }
    if (subCallingStatus) {
      remarkIncludeWhere.sub_calling_status = Array.isArray(subCallingStatus) ? { [Op.in]: subCallingStatus } : subCallingStatus;
    }
    if (nextCallDate_start && nextCallDate_end) {
      remarkIncludeWhere.callback_date = handleDateRange(nextCallDate_start, nextCallDate_end);
    } else if (nextCallDate_start) {
      remarkIncludeWhere.callback_date = { [Op.gte]: new Date(nextCallDate_start) };
    }
    if (remarks) {
      remarkIncludeWhere.remarks = { [Op.iLike]: `%${remarks}%` };
    }

    // Callback date filters
    const hasCallbackDateRange = callbackDate_start || callbackDate_end;
    const hasCallbackFilter = !!callback;

    const callbackDateRange = handleDateRange(callbackDate_start, callbackDate_end);
    if (callbackDateRange) remarkIncludeWhere.callback_date = callbackDateRange;

    if (hasCallbackFilter) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      switch (callback.toLowerCase()) {
        case 'today':
          remarkIncludeWhere.callback_date = { [Op.gte]: todayStart, [Op.lte]: todayEnd };
          break;
        case 'overdue':
          remarkIncludeWhere.callback_date = { [Op.lt]: todayStart, [Op.not]: null };
          break;
        case 'all':
          remarkIncludeWhere.callback_date = { [Op.not]: null };
          break;
        case 'combined':
          remarkIncludeWhere.callback_date = { [Op.lte]: todayEnd, [Op.not]: null };
          break;
        default:
          break;
      }
    }

    // Lead status extension for callback filters
    if (hasCallbackDateRange || hasCallbackFilter) {
      if (data === 'l2') {
        if (Array.isArray(leadStatus)) {
          const extras = ['Pre Application', 'Pre_Application'];
          remarkIncludeWhere.lead_status = { [Op.in]: [...leadStatus, ...extras] };
        } else {
          remarkIncludeWhere.lead_status = 'Pre Application';
        }
      } else if (data === 'l3') {
        if (Array.isArray(leadStatus)) {
          const extras = ['Pre Application', 'Pre_Application', 'Admission', 'Application'];
          remarkIncludeWhere.lead_status = { [Op.in]: [...leadStatus, ...extras] };
        } else {
          remarkIncludeWhere.lead_status = 'Pre Application';
        }
      }
    }

    // Build WHERE for StudentLeadActivity (utm filters)
    const utmIncludeWhere = {};
    if (utmCampaign) utmIncludeWhere.utm_campaign = { [Op.iLike]: `%${utmCampaign}%` };
    if (utmSource) utmIncludeWhere.utm_source = { [Op.iLike]: `%${utmSource}%` };
    if (utmMedium) utmIncludeWhere.utm_medium = { [Op.iLike]: `%${utmMedium}%` };
    if (utmKeyword) utmIncludeWhere.utm_keyword = { [Op.iLike]: `%${utmKeyword}%` };

    if (source) {
      const sourceFilter = handleMultiSelectFilter(source);
      if (sourceFilter) {
        utmIncludeWhere.source = sourceFilter.length === 1
          ? handleTextFilter(sourceFilter[0])
          : { [Op.or]: sourceFilter.map(s => ({ [Op.iLike]: `%${s}%` })) };
      }
    }

    if (utmCampaignId) utmIncludeWhere.utm_campaign_id = utmCampaignId;
    if (utmAdgroupId) utmIncludeWhere.utm_adgroup_id = utmAdgroupId;
    if (utmCreativeId) utmIncludeWhere.utm_creative_id = utmCreativeId;

    // Build include array for Sequelize query
    const includeArray = [
      {
        model: Counsellor,
        as: 'assignedCounsellor',
        attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
        required: false,
      },
      {
        model: Counsellor,
        as: 'assignedCounsellorL3',
        attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'],
        required: false,
      },
    ];

    const hasRemarkFilters = Object.keys(remarkIncludeWhere).length > 0;

    if (freshLeads === undefined) {
      includeArray.push({
        model: StudentRemark,
        as: 'student_remarks',
        attributes: [
          'remark_id', 'lead_status', 'lead_sub_status', 'calling_status',
          'sub_calling_status', 'remarks', 'callback_date', 'callback_time', 'created_at'
        ],
        where: hasRemarkFilters ? remarkIncludeWhere : undefined,
        required: hasRemarkFilters,
        separate: true,
        limit: 1,
        order: [['created_at', 'DESC']],
      });
    } if (freshLeads === 'Fresh') {
      includeArray.push({
        model: StudentRemark,
        as: 'student_remarks',
        required: false,
        attributes: [],

      });

      whereConditions[Op.and] = [
        ...(whereConditions[Op.and] || []),
        Sequelize.literal(`"student_remarks"."student_id" IS NULL`)
      ];
    }

    // Lead activities include
    if (Object.keys(utmIncludeWhere).length > 0) {
      includeArray.push({
        model: StudentLeadActivity,
        as: 'lead_activities',
        attributes: [
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
          'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at', 'source', 'source_url'
        ],
        where: utmIncludeWhere,
        required: true,
        separate: false,
        order: [['created_at', 'ASC']],
      });
    } else {
      includeArray.push({
        model: StudentLeadActivity,
        as: 'lead_activities',
        attributes: [
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
          'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at', 'source', 'source_url'
        ],
        required: false,
        separate: false,
        limit: 1,
        order: [['created_at', 'ASC']],
      });
    }


    const orderClause = [];
    if (remarkssort) {
      orderClause.push([
        Sequelize.literal(`(
          SELECT COUNT(*) FROM student_remarks AS sr WHERE sr.student_id = students.student_id
        )`),
        remarkssort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'
      ]);
    } else if (lastCallsort) {
      orderClause.push([{ model: StudentRemark, as: 'student_remarks' }, 'created_at', lastCallsort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']);
    } else if (nextCallbacksort) {
      orderClause.push([{ model: StudentRemark, as: 'student_remarks' }, 'callback_date', nextCallbacksort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']);
    } else if (createdAtsort) {
      orderClause.push(['created_at', createdAtsort.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']);
    } else {
      orderClause.push(['created_at', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']);
    }

    const [queryResult, overallStats = {}] = await Promise.all([
      Student.findAndCountAll({
        where: whereConditions,
        include: includeArray,
        attributes: [
          'student_id',
          'student_name',
          'student_email',
          'student_phone',
          'total_remarks_l3',
          'created_at',
          'assigned_l3_date',
          'last_call_date_l3', 'next_call_time_l3', 'last_call_date_l3', 'is_reactivity',
          [Sequelize.literal(`(
            SELECT COUNT(*) FROM student_remarks AS sr WHERE sr.student_id = students.student_id
          )`), 'remark_count']
        ],
        limit: limitNum,
        offset: offset,
        order: orderClause,
        distinct: true,
        subQuery: freshLeads === 'Fresh' ? false : undefined,
        logging: console.log,
        benchmark: true
      }),

      freshLeads ? Promise.resolve({}) : getOverallStats(filters)

    ]);
    const totalCount = queryResult?.count;
    const students = queryResult.rows;
    overallStats.total = totalCount;
    const totalPages = Math.ceil(totalCount / limitNum);

    // Build response object
    const response = {
      success: true,
      data: students,
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
        student: whereConditions,
        remarks: remarkIncludeWhere,
        utm: utmIncludeWhere,
      }
    };
    return response;

  } catch (error) {
    console.error('Error in getStudentshelper:', error.message);
    throw error;
  }
};


export const getStudents = async (req, res) => {
  try {
    const { role, id } = req.user;
    
    let analyserData = {};
    if (role === 'Analyser') {
      try {
        const analyser = await Analyser.findByPk(id, {
          attributes: ['sources', 'campaigns', 'student_creation_date', 'source_urls']
        });
        if (analyser) {
          analyserData = {
            analyserSources: analyser.sources || [],
            analyserCampaigns: analyser.campaigns || [],
            analyserDateFilter: analyser.student_creation_date || '',
            analyserSourceUrls: analyser.source_urls || []
          };
        }
      } catch (error) {
        console.error('Error fetching analyser data:', error);
      }
    }
    console.log(analyserData)
    // Pass analyser data to filter helper
    const filters = mapFiltersForGetStudentsHelper(req.query, role, analyserData);
    
    let data;
    if (filters.wishlist) {
      data = await getWhishListStudentHelper(filters);
    } else {
      // Pass the req object as second parameter
      data = await getStudentsRawSQL(filters, req,false);
    }

    // Add analyser filter info to response
    if (role === 'Analyser') {
      data.analyser_filters_applied = analyserData;
    }

    res.status(200).json(data);

  } catch (error) {
    console.error('Error in getStudents:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
export const mapFiltersForGetStudentsHelper = (params, insertrole, analyserData = {}) => {
  const leadStatusArray =
    typeof params.lead_status === 'string'
      ? params.lead_status.split(',').map(s => s.trim())
      : null;
  const limitNum = params.export ? 50000 : (params?.limit || 10);
  
  console.log('mapFiltersForGetStudentsHelper called with:');
  console.log('insertrole:', insertrole);
  console.log('typeof insertrole:', typeof insertrole);
  console.log('insertrole === "Analyser":', insertrole === 'Analyser');
  console.log('insertrole === "analyser":', insertrole === 'analyser');
  console.log('params.userrole (if exists):', params.userrole);
  
  const isAnalyser = insertrole === 'Analyser';
  console.log('isAnalyser:', isAnalyser);
  
  // Get analyser-specific filters (passed from getStudents function)
  const {
    analyserSources = [],
    analyserCampaigns = [],
    analyserDateFilter = '',
    analyserSourceUrls = []
  } = analyserData;

  // Parse analyser date filter into start/end dates
  let analyserCreatedAtStart = '';
  let analyserCreatedAtEnd = '';
  
  if (isAnalyser && analyserDateFilter) {
    // Extract dates from SQL like: created_at >= '2024-01-01' AND created_at <= '2024-12-31'
    const dateMatch = analyserDateFilter.match(/created_at\s*>=\s*'(\d{4}-\d{2}-\d{2})'.*?created_at\s*<=\s*'(\d{4}-\d{2}-\d{2})'/i);
    if (dateMatch) {
      analyserCreatedAtStart = dateMatch[1];
      analyserCreatedAtEnd = dateMatch[2];
    }
  }

  // For analysers, combine query source with analyser sources (if query source exists)
  let finalSource = params.source;
  if (isAnalyser && analyserSources.length > 0) {
    // Filter out 'Any' from analyser sources
    const validAnalyserSources = analyserSources.filter(s => s !== 'Any' && s !== '');
    
    if (params.source) {
      // Combine query source with analyser sources (intersection)
      const querySources = typeof params.source === 'string' 
        ? params.source.split(',').map(s => s.trim())
        : Array.isArray(params.source) ? params.source : [];
      
      // Find common sources between query and analyser sources
      const commonSources = querySources.filter(source => 
        validAnalyserSources.includes(source)
      );
      
      finalSource = commonSources.length > 0 ? commonSources.join(',') : null;
    } else {
      // Use only analyser sources
      finalSource = validAnalyserSources.length > 0 ? validAnalyserSources.join(',') : null;
    }
  }

  // For analysers, combine query campaign with analyser campaigns
  let finalUtmCampaign = params.campaign_name || params.utmCampaign;
  if (isAnalyser && analyserCampaigns.length > 0) {
    const validAnalyserCampaigns = analyserCampaigns.filter(c => c !== 'Any' && c !== '');
    
    if (finalUtmCampaign) {
      const queryCampaigns = typeof finalUtmCampaign === 'string'
        ? finalUtmCampaign.split(',').map(c => c.trim())
        : Array.isArray(finalUtmCampaign) ? finalUtmCampaign : [];
      
      const commonCampaigns = queryCampaigns.filter(campaign =>
        validAnalyserCampaigns.includes(campaign)
      );
      
      finalUtmCampaign = commonCampaigns.length > 0 ? commonCampaigns.join(',') : null;
    } else {
      finalUtmCampaign = validAnalyserCampaigns.length > 0 ? validAnalyserCampaigns.join(',') : null;
    }
  }

  // For analysers, combine query UTM source with analyser source URLs
  let finalUtmSource = params.utmSource;
  if (isAnalyser && analyserSourceUrls.length > 0) {
    // Extract domains from analyser source URLs
    const analyserDomains = analyserSourceUrls.map(url => {
      try {
        const urlObj = new URL(url);
        return urlObj.hostname.replace('www.', '');
      } catch {
        return url;
      }
    }).filter(domain => domain && domain !== '');
    
    if (params.utmSource && analyserDomains.length > 0) {
      // For analysers, UTM source should match analyser domains
      finalUtmSource = analyserDomains.join(',');
    } else if (analyserDomains.length > 0) {
      // Use analyser domains as UTM source filter
      finalUtmSource = analyserDomains.join(',');
    }
  }

  // For analysers, use analyser date filter or query date filter
  const finalCreatedAtStart = isAnalyser && analyserCreatedAtStart 
    ? analyserCreatedAtStart 
    : params.createdAt_start || params?.startDate;
    
  const finalCreatedAtEnd = isAnalyser && analyserCreatedAtEnd
    ? analyserCreatedAtEnd
    : params.createdAt_end || params?.endDate;

  const filters = {
    page: params.page ?? 1,
    limit: limitNum,
    data: params.data,
    selectedagent: params.selectedagent,
    mode: params.mode,
    source: finalSource,
    freshLeads: params?.freshLeads,
    leadStatus: params.lead_status && transformArray(params.lead_status) || params.leadStatus && transformArray(params.leadStatus),
    leadSubStatus: params.sub_lead_status && transformArray(params.sub_lead_status) || params.leadSubStatus && transformArray(params.leadSubStatus),
    utmCampaign: finalUtmCampaign,
    utmSource: finalUtmSource,
    utmMedium: params.utmMedium,
    utmKeyword: params.utmKeyword,
    utmCampaignId: params.utmCampaignId,
    utmAdgroupId: params.utmAdgroupId,
    utmCreativeId: params.utmCreativeId,
    callingStatus: (params.calling_status && transformArray(params?.calling_status)) || (params.callingStatus && transformArray(params.callingStatus)),
    subCallingStatus: (params.subCallingStatus && transformArray(params.subCallingStatus)) || (params?.calling_sub_status && transformArray(params.calling_sub_status)),
    callingStatusL3: params.callingStatusL3,
    subCallingStatusL3: params.subCallingStatusL3,
    isConnectedYet: params.isconnectedyet && (params.isconnectedyet == 'Connected' ? true : false),
    isConnectedYetL3: params.isConnectedYetL3 || (params?.isconnectedyetl3 && (params?.isconnectedyetl3 == 'Connected' ? true : false)),
    searchTerm: params.searchTerm ?? '',
    numberOfUnreadMessages: params.number_of_unread_messages,
    createdAt_start: finalCreatedAtStart,
    createdAt_end: finalCreatedAtEnd,
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
    csv_exports: params?.export ? params?.export : false,
    sortOrder: params.sortOrder ?? 'desc',
    isreactivity: params?.isreactivity || params.isReactivity || params.IsReactivity || params?.ISREACTIVITY || params?.is_reactivity,
    callback: params?.callback || params?.callBack,
    wishlist: params?.wishlist || params?.wishList,
    remarkssort: params?.remarkssort,
    createdAtsort: params?.createdAtsort,
    lastCallsort: params?.lastCallsort,
    nextCallbacksort: params?.nextCallbacksort,
    dashboard: params?.dashboard,
    userrole: insertrole,
    lead_reactive: params?.lead_reactive && (params?.lead_reactive == 'true' ? true : false),
    // Add analyser-specific filters for SQL function
    ...(isAnalyser && {
      analyserSources,
      analyserCampaigns,
      analyserDateFilter,
      analyserSourceUrls
    })
  };

  // Remove undefined values
  Object.keys(filters).forEach(key => {
    if (filters[key] === undefined || filters[key] === null) {
      delete filters[key];
    }
  });

  return filters;
};
function transformArray(column) {
  return typeof column === 'string'
    ? column.split(',').map(s => s.trim())
    : null;
}



