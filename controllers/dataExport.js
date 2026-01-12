
import { Sequelize,Op,literal,fn,col } from 'sequelize';
import Student from '../models/Student.js';
import Counsellor from '../models/Counsellor.js';
import StudentRemark from '../models/StudentRemark.js';
import StudentLeadActivity from '../models/StudentLeadActivity.js';


export const getStudentshelper = async (filters) => {

  try {
    const {
      page = 1,
      limit =1000,
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
      csv_exports=false,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = filters;

    // Convert page and limit to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = (limit && parseInt(limit, 10)) || undefined;
    const offset = limitNum ? (pageNum - 1) * limitNum : undefined;

    // Improved helper functions
    const handleMultiSelectFilter = (value) => {
      if (!value) return null;
      if (Array.isArray(value)) return value.filter(v => v && v.toString().trim());
      if (typeof value === 'string') {
        return value.split(',').map(v => v.trim()).filter(v => v);
      }
      return [value.toString()];
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

    // Build where conditions for Student table
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

    // Boolean filters
    const isConnectedYetFilter = handleBooleanFilter(isConnectedYet);
    if (isConnectedYetFilter !== null) {
      whereConditions.is_connected_yet = isConnectedYetFilter;
    }

    const isConnectedYetL3Filter = handleBooleanFilter(isConnectedYetL3);
    if (isConnectedYetL3Filter !== null) {
      whereConditions.is_connected_yet_l3 = isConnectedYetL3Filter;
    }

    // Unread messages filter
    if (hasUnreadMessages === 'true') {
      whereConditions.number_of_unread_messages = { [Op.gt]: 0 };
    } else if (hasUnreadMessages === 'false') {
      whereConditions.number_of_unread_messages = { [Op.eq]: 0 };
    }

    // Search term filter
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

    // Date range filters
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

    // Location and preference filters
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

    if (preferredStream) {
      const preferredStreamFilter = handleArrayFilter(preferredStream);
      if (preferredStreamFilter) {
        whereConditions.preferred_stream = preferredStreamFilter;
      }
    }

    if (preferredDegree) {
      const preferredDegreeFilter = handleArrayFilter(preferredDegree);
      if (preferredDegreeFilter) {
        whereConditions.preferred_degree = preferredDegreeFilter;
      }
    }

    if (preferredLevel) {
      const preferredLevelFilter = handleArrayFilter(preferredLevel);
      if (preferredLevelFilter) {
        whereConditions.preferred_level = preferredLevelFilter;
      }
    }

    if (preferredSpecialization) {
      const preferredSpecializationFilter = handleArrayFilter(preferredSpecialization);
      if (preferredSpecializationFilter) {
        whereConditions.preferred_specialization = preferredSpecializationFilter;
      }
    }

    // Budget range filter
    if (preferredBudget_min || preferredBudget_max) {
      const budgetRange = handleNumberRange(preferredBudget_min, preferredBudget_max);
      if (budgetRange) {
        whereConditions.preferred_budget = budgetRange;
      }
    }

    if (callingStatusL3) {
      const callingStatusL3Filter = handleMultiSelectFilter(callingStatusL3);
      if (callingStatusL3Filter) {
        whereConditions.calling_status_l3 = callingStatusL3Filter.length === 1 ? 
          callingStatusL3Filter[0] : { [Op.in]: callingStatusL3Filter };
      }
    }

    if (subCallingStatusL3) {
      const subCallingStatusL3Filter = handleMultiSelectFilter(subCallingStatusL3);
      if (subCallingStatusL3Filter) {
        whereConditions.sub_calling_status_l3 = subCallingStatusL3Filter.length === 1 ? 
          subCallingStatusL3Filter[0] : { [Op.in]: subCallingStatusL3Filter };
      }
    }

    // Build StudentRemark include conditions
    const remarkIncludeWhere = {};
    
    // Handle leadStatus - can be string or array
    if (leadStatus) {
      if (Array.isArray(leadStatus)) {
        remarkIncludeWhere.lead_status = { [Op.in]: leadStatus };
      } else {
        remarkIncludeWhere.lead_status = leadStatus;
      }
    }

    // Handle leadSubStatus - can be string or array  
    if (leadSubStatus) {
      if (Array.isArray(leadSubStatus)) {
        remarkIncludeWhere.lead_sub_status = { [Op.in]: leadSubStatus };
      } else {
        remarkIncludeWhere.lead_sub_status = leadSubStatus;
      }
    }

    // Handle callingStatus - can be string or array
    if (callingStatus) {
      if (Array.isArray(callingStatus)) {
        remarkIncludeWhere.calling_status = { [Op.in]: callingStatus };
      } else {
        remarkIncludeWhere.calling_status = callingStatus;
      }
    }

    // Handle subCallingStatus - can be string or array
    if (subCallingStatus) {
      if (Array.isArray(subCallingStatus)) {
        remarkIncludeWhere.sub_calling_status = { [Op.in]: subCallingStatus };
      } else {
        remarkIncludeWhere.sub_calling_status = subCallingStatus;
      }
    }

    // Handle nextCallDate as callback_date
    if (nextCallDate_start && nextCallDate_end) {
      remarkIncludeWhere.callback_date = handleDateRange(nextCallDate_start, nextCallDate_end);
    } else if (nextCallDate_start) {
      remarkIncludeWhere.callback_date = { [Op.gte]: new Date(nextCallDate_start) };
    }

    if (remarks) {
      remarkIncludeWhere.remarks = { [Op.iLike]: `%${remarks}%` };
    }

    const callbackDateRange = handleDateRange(callbackDate_start, callbackDate_end);
    if (callbackDateRange) {
      remarkIncludeWhere.callback_date = callbackDateRange;
    }

    if(callbackDate_start || callbackDate_end || nextCallDate_start || nextCallDate_end) {
      if(data=='l2') {
        if (Array.isArray(leadStatus)) {
          const array=['Pre Application','Pre_Application']
          remarkIncludeWhere.lead_status = { [Op.in]: [...leadStatus,...array] };
        } else {
          remarkIncludeWhere.lead_status = 'Pre Application';
        }
      } else if(data=='l3') {
        if (Array.isArray(leadStatus)) {
          const array=['Pre Application','Pre_Application','Admission','Application']
          remarkIncludeWhere.lead_status = { [Op.in]: [...leadStatus,...array] };
        } else {
          remarkIncludeWhere.lead_status = 'Pre Application';
        }
      }
    }

    // Build StudentLeadActivity include conditions
    const utmIncludeWhere = {};
    
    if (utmCampaign) {
      utmIncludeWhere.utm_campaign = { [Op.iLike]: `%${utmCampaign}%` };
    }
    
    if (utmSource) {
      utmIncludeWhere.utm_source = { [Op.iLike]: `%${utmSource}%` };
    }

    if (utmMedium) {
      utmIncludeWhere.utm_medium = { [Op.iLike]: `%${utmMedium}%` };
    }

    if (utmKeyword) {
      utmIncludeWhere.utm_keyword = { [Op.iLike]: `%${utmKeyword}%` };
    }

    if (source) {
      const sourceFilter = handleMultiSelectFilter(source);
      if (sourceFilter) {
        utmIncludeWhere.source = sourceFilter.length === 1
          ? handleTextFilter(sourceFilter[0])
          : { [Op.or]: sourceFilter.map(s => ({ [Op.iLike]: `%${s}%` })) };
      }
    }

    // UTM ID filters (exact match)
    if (utmCampaignId) {
      utmIncludeWhere.utm_campaign_id = utmCampaignId;
    }

    if (utmAdgroupId) {
      utmIncludeWhere.utm_adgroup_id = utmAdgroupId;
    }

    if (utmCreativeId) {
      utmIncludeWhere.utm_creative_id = utmCreativeId;
    }

    const orderClause = [[sortBy, sortOrder.toUpperCase()]];

    // Build include array with proper filtering
    const includeArray = [
      {
        model: Counsellor,
        as: 'assignedCounsellor',
        attributes: ['counsellor_name'],
        required: false
      },
      
    ];

    if (freshLeads === undefined) {
      if (Object.keys(remarkIncludeWhere).length > 0) {
        includeArray.push({
          model: StudentRemark,
          as: 'student_remarks',
          attributes: [
            'remark_id', 'lead_status', 'lead_sub_status', 'calling_status',
            'sub_calling_status', 'remarks', 'callback_date', 'callback_time', 'created_at'
          ],
          where: remarkIncludeWhere,
          required: true, 
          separate: false, 
          order: [['created_at', 'DESC']]
        });
      } else {
        includeArray.push({
          model: StudentRemark,
          as: 'student_remarks',
          attributes: [
            'remark_id', 'lead_status', 'lead_sub_status', 'calling_status',
            'sub_calling_status', 'remarks', 'callback_date', 'callback_time', 'created_at'
          ],
          required: false,
          separate: true,
          limit: 1,
          order: [['created_at', 'DESC']]
        });
      }
    } else if (freshLeads === 'Fresh') {
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

    if (Object.keys(utmIncludeWhere).length > 0) {
      includeArray.push({
        model: StudentLeadActivity,
        as: 'lead_activities',
        attributes: [
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
          'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at','source','source_url'
        ],
        where: utmIncludeWhere,
        required: true, 
        separate: false, 
        order: [['created_at', 'ASC']]
      });
    } else {
      includeArray.push({
        model: StudentLeadActivity,
        as: 'lead_activities',
        attributes: [
          'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
          'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at','source','source_url'
        ],
        required: false,
        separate: true,
        limit: 1,
        order: [['created_at', 'ASC']]
      });
    }

    console.log('include query', remarkIncludeWhere);

    // DETAILED TIMING STARTS HERE
    console.time('mainQuery');
    console.time('overallStats');
    console.time('innerQuery');

    const [{ count: totalCount, rows: students }, overallStats] = await Promise.all([
      Student.findAndCountAll({
  where: whereConditions,
  include: includeArray,
  // attributes: {
  //   include: [
  //     [Sequelize.literal(`(
  //       SELECT COUNT(*) 
  //       FROM student_remarks AS sr 
  //       WHERE sr.student_id = students.student_id
  //     )`), 'remark_count']
  //   ]
  // },
  // Add basic fields here:
  attributes: [
    'student_id',
    'student_name',
    'student_email',
    'student_phone',
    'created_at',
    // [Sequelize.literal(`(
    //   SELECT COUNT(*) 
    //   FROM student_remarks AS sr 
    //   WHERE sr.student_id = students.student_id
    // )`), 'remark_count']
  ],
  limit: limitNum,
  offset: offset,
  order: orderClause,
  distinct: true,
  subQuery: false
        }).then(result => {
        console.timeEnd('mainQuery');
        return result;
        })
    ]);

    console.timeEnd('innerQuery');

   console.timeEnd('innerQuery');



console.time('responseBuilding');
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
  filters: { /* ... */ },
  appliedFilters: {
    student: whereConditions,
    remarks: remarkIncludeWhere,
    utm: utmIncludeWhere
  }
};
console.timeEnd('responseBuilding');

return response;

  } catch (error) {
    console.log(error.message);
   
    throw error;
  }
};
function buildWhereSQL(whereObj) {
  const conditions = [];
  const replacements = {};
  let paramIndex = 0;

  for (const [key, value] of Object.entries(whereObj)) {
    const lowerKey = `LOWER(${key})`;

    if (typeof value === 'string') {
      if (key !== 'callback_date') {
        const paramKey = `param_${paramIndex++}`;
        conditions.push(`${lowerKey} = LOWER(:${paramKey})`);
        replacements[paramKey] = value;
      } else {
        const paramKey = `param_${paramIndex++}`;
        conditions.push(`${key} = :${paramKey}`);
        replacements[paramKey] = value;
      }

    } else if (typeof value === 'number') {
      const paramKey = `param_${paramIndex++}`;
      conditions.push(`${key} = :${paramKey}`);
      replacements[paramKey] = value;

    } else if (Array.isArray(value)) {
      const orConditions = [];
      value.forEach(v => {
        const paramKey = `param_${paramIndex++}`;
        orConditions.push(`${lowerKey} = :${paramKey}`);
        replacements[paramKey] = v.toLowerCase?.() || v;
      });
      conditions.push(`(${orConditions.join(' OR ')})`);
    }
  }

  return {
    whereSQL: conditions.length ? conditions.join(' AND ') : '1=1',
    replacements
  };
}






export const getStudents = async (req, res) => {
  try{
      console.time('hello hi')
      const filters=mapFiltersForGetStudentsHelper(req.query)
      const data=await getStudentshelper(filters)
       console.timeEnd('hello hi')
      res.status(200).json(data);
      
  }
   catch(error)
   {
    console.error('Error in getStudents:', error.message);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
   }
}
export const mapFiltersForGetStudentsHelper = (params) => {
    const leadStatusArray =
  typeof params.lead_status === 'string'
    ? params.lead_status.split(',').map(s => s.trim())
    : null;
  const limitNum = (!params.export && (params.limit ?? 1)) || undefined;
  return {
    page: params.page ?? 1,
    limit: limitNum,
    data: params.data,
    selectedagent: params.selectedagent,
    mode: params.mode,
    source: params.source,
    freshLeads:params?.freshLeads,
    leadStatus: params.lead_status && transformArray(params.lead_status) ||  params.leadStatus && transformArray(params.leadStatus),
    leadSubStatus: params.sub_lead_status && transformArray(params.sub_lead_status) ||  params.leadSubStatus && transformArray(params.leadSubStatus),
    utmCampaign: params.campaign_name || params.utmCampaign && transformArray(params.utmCampaign),
    utmSource: params.utmSource,
    utmMedium: params.utmMedium,
    utmKeyword: params.utmKeyword,
    utmCampaignId: params.utmCampaignId,
    utmAdgroupId: params.utmAdgroupId,
    utmCreativeId: params.utmCreativeId,
    callingStatus: (params.calling_status && transformArray(params?.calling_status)) || (params.callingStatus && transformArray(params.callingStatus)),
    subCallingStatus:(params.subCallingStatus && transformArray( params.subCallingStatus))||(params?.calling_sub_status  && transformArray( params.calling_sub_status)) ,
    callingStatusL3: params.callingStatusL3,
    subCallingStatusL3: params.subCallingStatusL3,
    isConnectedYet: params.isconnectedyet && (params.isconnectedyet=='Connected' ?  true : false),
    isConnectedYetL3: params.isConnectedYetL3 || (params?.isconnectedyetl3 && (params?.isconnectedyetl3=='Connected' ?  true : false)),
    searchTerm: params.searchTerm ?? '',
    numberOfUnreadMessages: params.number_of_unread_messages, 
    createdAt_start: params.createdAt_start || params?.startDate,
    createdAt_end: params.createdAt_end || params?.endDate  ,
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
    csv_exports:params?.export ? params?.export : false, 
    sortOrder: params.sortOrder ?? 'desc'
  };
};
function transformArray(column)
{
  return typeof column === 'string'
    ? column.split(',').map(s => s.trim())
    : null;
}
