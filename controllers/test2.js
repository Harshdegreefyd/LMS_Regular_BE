// import Sequelize,{ Op } from 'sequelize';
// import { Student, Counsellor, StudentRemark } from '../models/index.js';

// export const getStudents = async (req, res) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       data, 
//       selectedagent, 
//       mode,
//       source,
//       leadStatus,
//       leadSubStatus,
//       utmCampaign,
//       utmSource,
//       utmMedium,
//       utmKeyword,
//       utmCampaignId,
//       utmAdgroupId,  
//       utmCreativeId,
//       callingStatus,
//       subCallingStatus,
//       callingStatusL3,
//       subCallingStatusL3,
//       isConnectedYet,
//       isConnectedYetL3,
//       searchTerm='chandu',
//       numberOfUnreadMessages: hasUnreadMessages,
//       createdAt_start,
//       createdAt_end,
//       nextCallDate_start,
//       nextCallDate_end,
//       lastCallDate_start,
//       lastCallDate_end,
//       nextCallDateL3_start,
//       nextCallDateL3_end,
//       lastCallDateL3_start,
//       lastCallDateL3_end,
//       preferredCity,
//       preferredState,
//       currentCity,
//       currentState,
//       preferredStream,
//       preferredDegree,
//       preferredLevel,
//       preferredSpecialization,
//       preferredBudget_min,
//       preferredBudget_max,
//       sortBy = 'createdAt',
//       sortOrder = 'desc'
//     } = req.query;

//     // Convert page and limit to numbers
//     const pageNum = parseInt(page, 10);
//     const limitNum = parseInt(limit, 10);
//     const offset = (pageNum - 1) * limitNum;

//     // Helper function to handle array/string conversion for multiselect
//     const handleMultiSelectFilter = (value) => {
//       if (!value) return null;
//       if (Array.isArray(value)) return value;
//       if (typeof value === 'string') {
//         return value.split(',').map(v => v.trim()).filter(v => v);
//       }
//       return [value];
//     };

//     // Helper function to handle boolean filters
//     const handleBooleanFilter = (value) => {
//       if (value === undefined || value === null || value === '') return null;
//       if (typeof value === 'boolean') return value;
//       return value === 'true' || value === '1';
//     };

//     // Helper function to handle date range
//     const handleDateRange = (startDate, endDate) => {
//       const dateRange = {};
//       if (startDate) {
//         dateRange[Op.gte] = new Date(startDate);
//       }
//       if (endDate) {
//         const endOfDay = new Date(endDate);
//         endOfDay.setHours(23, 59, 59, 999);
//         dateRange[Op.lte] = endOfDay;
//       }
//       return Object.keys(dateRange).length > 0 ? dateRange : null;
//     };

//     // Helper function to handle number range
//     const handleNumberRange = (minValue, maxValue) => {
//       const numberRange = {};
//       if (minValue !== undefined && minValue !== null && minValue !== '') {
//         numberRange[Op.gte] = parseInt(minValue, 10);
//       }
//       if (maxValue !== undefined && maxValue !== null && maxValue !== '') {
//         numberRange[Op.lte] = parseInt(maxValue, 10);
//       }
//       return Object.keys(numberRange).length > 0 ? numberRange : null;
//     };

//     // Build where conditions
//     const whereConditions = {};
//     const includeConditions = [];
//     // Core filters - Data type and agent assignment
//     if (data === 'l2') {
//       whereConditions.assigned_counsellor_id = { [Op.not]: null };
//     } else if (data === 'l3') {
//       whereConditions.assigned_counsellor_l3_id = { [Op.not]: null };
//     }

//     // Selected agent filtering
//     if (selectedagent) {
//       if (data === 'l3') {
//         whereConditions.assigned_counsellor_l3_id = selectedagent;
//       } else {
//         whereConditions.assigned_counsellor_id = selectedagent;
//       }
//     }

//     // Mode filter
//     if (mode) {
//       const modeFilter = handleMultiSelectFilter(mode);
//       if (modeFilter) {
//         const validModes = ['Regular', 'Online'];
//         const filteredModes = modeFilter.filter(m => validModes.includes(m));
//         if (filteredModes.length > 0) {
//           whereConditions.mode = filteredModes.length === 1 ? filteredModes[0] : { [Op.in]: filteredModes };
//         }
//       }
//     }

//     // Source filter
//     if (source) {
//       const sourceFilter = handleMultiSelectFilter(source);
//       if (sourceFilter) {
//         whereConditions.source = sourceFilter.length === 1
//           ? { [Op.iLike]: `%${sourceFilter[0]}%` }
//           : { [Op.or]: sourceFilter.map(s => ({ [Op.iLike]: `%${s}%` })) };
//       }
//     }

//     // UTM filters
//     if (utmCampaign) {
//       const utmCampaignFilter = handleMultiSelectFilter(utmCampaign);
//       if (utmCampaignFilter) {
//         whereConditions.utm_campaign = utmCampaignFilter.length === 1
//           ? { [Op.iLike]: `%${utmCampaignFilter[0]}%` }
//           : { [Op.or]: utmCampaignFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     if (utmSource) {
//       const utmSourceFilter = handleMultiSelectFilter(utmSource);
//       if (utmSourceFilter) {
//         whereConditions.utm_source = utmSourceFilter.length === 1
//           ? { [Op.iLike]: `%${utmSourceFilter[0]}%` }
//           : { [Op.or]: utmSourceFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     if (utmMedium) {
//       const utmMediumFilter = handleMultiSelectFilter(utmMedium);
//       if (utmMediumFilter) {
//         whereConditions.utm_medium = utmMediumFilter.length === 1
//           ? { [Op.iLike]: `%${utmMediumFilter[0]}%` }
//           : { [Op.or]: utmMediumFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     if (utmKeyword) {
//       const utmKeywordFilter = handleMultiSelectFilter(utmKeyword);
//       if (utmKeywordFilter) {
//         whereConditions.utm_keyword = utmKeywordFilter.length === 1
//           ? { [Op.iLike]: `%${utmKeywordFilter[0]}%` }
//           : { [Op.or]: utmKeywordFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     // UTM ID filters (exact match)
//     if (utmCampaignId) {
//       const utmCampaignIdFilter = handleMultiSelectFilter(utmCampaignId);
//       if (utmCampaignIdFilter) {
//         whereConditions.utm_campaign_id = utmCampaignIdFilter.length === 1 
//           ? utmCampaignIdFilter[0] 
//           : { [Op.in]: utmCampaignIdFilter };
//       }
//     }

//     if (utmAdgroupId) {
//       const utmAdgroupIdFilter = handleMultiSelectFilter(utmAdgroupId);
//       if (utmAdgroupIdFilter) {
//         whereConditions.utm_adgroup_id = utmAdgroupIdFilter.length === 1 
//           ? utmAdgroupIdFilter[0] 
//           : { [Op.in]: utmAdgroupIdFilter };
//       }
//     }

//     if (utmCreativeId) {
//       const utmCreativeIdFilter = handleMultiSelectFilter(utmCreativeId);
//       if (utmCreativeIdFilter) {
//         whereConditions.utm_creative_id = utmCreativeIdFilter.length === 1 
//           ? utmCreativeIdFilter[0] 
//           : { [Op.in]: utmCreativeIdFilter };
//       }
//     }

//     // Boolean filters
//     const isConnectedYetFilter = handleBooleanFilter(isConnectedYet);
//     if (isConnectedYetFilter !== null) {
//       whereConditions.is_connected_yet = isConnectedYetFilter;
//     }

//     const isConnectedYetL3Filter = handleBooleanFilter(isConnectedYetL3);
//     if (isConnectedYetL3Filter !== null) {
//       whereConditions.is_connected_yet_l3 = isConnectedYetL3Filter;
//     }

//     // Unread messages filter
//     if (hasUnreadMessages === 'true') {
//       whereConditions.number_of_unread_messages = { [Op.gt]: 0 };
//     } else if (hasUnreadMessages === 'false') {
//       whereConditions.number_of_unread_messages = 0;
//     }

    // // Search term filter (searches across multiple fields)
    // if (searchTerm) {
    //   whereConditions[Op.or] = [
    //     { student_name: { [Op.iLike]: `%${searchTerm}%` } },
    //     { student_email: { [Op.iLike]: `%${searchTerm}%` } },
    //     { student_phone: { [Op.iLike]: `%${searchTerm}%` } },
    //     { student_id: { [Op.iLike]: `%${searchTerm}%` } },
    //     { student_secondary_email: { [Op.iLike]: `%${searchTerm}%` } }
    //   ];
    // }

//     // Date range filters
//     const createdAtRange = handleDateRange(createdAt_start, createdAt_end);
//     if (createdAtRange) {
//       whereConditions.createdAt = createdAtRange;
//     }

//     const nextCallDateL3Range = handleDateRange(nextCallDateL3_start, nextCallDateL3_end);
//     if (nextCallDateL3Range) {
//       whereConditions.next_call_date_l3 = nextCallDateL3Range;
//     }

//     const lastCallDateL3Range = handleDateRange(lastCallDateL3_start, lastCallDateL3_end);
//     if (lastCallDateL3Range) {
//       whereConditions.last_call_date_l3 = lastCallDateL3Range;
//     }

//     // Location filters - PostgreSQL array contains
//     if (preferredCity) {
//       const preferredCityFilter = handleMultiSelectFilter(preferredCity);
//       if (preferredCityFilter) {
//         whereConditions.preferred_city = { [Op.overlap]: preferredCityFilter };
//       }
//     }

//     if (preferredState) {
//       const preferredStateFilter = handleMultiSelectFilter(preferredState);
//       if (preferredStateFilter) {
//         whereConditions.preferred_state = { [Op.overlap]: preferredStateFilter };
//       }
//     }

//     if (currentCity) {
//       whereConditions.student_current_city = { [Op.iLike]: `%${currentCity}%` };
//     }

//     if (currentState) {
//       whereConditions.student_current_state = { [Op.iLike]: `%${currentState}%` };
//     }

//     // Preference filters - all are arrays in schema
//     if (preferredStream) {
//       const preferredStreamFilter = handleMultiSelectFilter(preferredStream);
//       if (preferredStreamFilter) {
//         whereConditions.preferred_stream = { [Op.overlap]: preferredStreamFilter };
//       }
//     }

//     if (preferredDegree) {
//       const preferredDegreeFilter = handleMultiSelectFilter(preferredDegree);
//       if (preferredDegreeFilter) {
//         whereConditions.preferred_degree = { [Op.overlap]: preferredDegreeFilter };
//       }
//     }

//     if (preferredLevel) {
//       const preferredLevelFilter = handleMultiSelectFilter(preferredLevel);
//       if (preferredLevelFilter) {
//         whereConditions.preferred_level = { [Op.overlap]: preferredLevelFilter };
//       }
//     }

//     if (preferredSpecialization) {
//       const preferredSpecializationFilter = handleMultiSelectFilter(preferredSpecialization);
//       if (preferredSpecializationFilter) {
//         whereConditions.preferred_specialization = { [Op.overlap]: preferredSpecializationFilter };
//       }
//     }

//     // Budget range filter
//     const budgetRange = handleNumberRange(preferredBudget_min, preferredBudget_max);
//     if (budgetRange) {
//       whereConditions.preferred_budget = budgetRange;
//     }

//     // Build include array for associations
//     includeConditions.push({
//       model: Counsellor,
//       as: 'assignedCounsellor',
//       attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email'],
//       required: false
//     });

//     includeConditions.push({
//       model: Counsellor,
//       as: 'assignedCounsellorL3', 
//       attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email'],
//       required: false
//     });

//     // Handle lead status and sub status filters through StudentRemark
//     const remarkWhereConditions = {};
//     let includeRemarks = false;

//     if (leadStatus) {
//       const statusFilter = handleMultiSelectFilter(leadStatus);
//       if (statusFilter) {
//         const validStatuses = ['Pre Application', 'Application', 'Admission', 'NotInterested', 'Fresh'];
//         const filteredStatuses = statusFilter.filter(s => validStatuses.includes(s));
//         if (filteredStatuses.length > 0) {
//           remarkWhereConditions.lead_status = filteredStatuses.length === 1 
//             ? filteredStatuses[0] 
//             : { [Op.in]: filteredStatuses };
//           includeRemarks = true;
//         }
//       }
//     }

//     if (leadSubStatus) {
//       const subStatusFilter = handleMultiSelectFilter(leadSubStatus);
//       if (subStatusFilter) {
//         const validSubStatuses = [
//           'Untouched Lead', 'Counselling Yet to be Done', 'Initial Counseling Completed',
//           'Ready to Pay', 'Form Filled_Degreefyd', 'Form Filled_Partner website',
//           'Walkin Completed', 'Registration Done', 'Semester Paid', 'Multiple Attempts made',
//           'Invalid number / Wrong Number', 'Language Barrier', 'Not Enquired',
//           'Already Enrolled_Partner', 'First call Not Interested', 'Not Eligible',
//           'Dublicate_Same student exists', 'Only_Regular course', 'Next Year',
//           'Budget issue', 'Already Enrolled_NP', 'Reason not shared', 'Location issue'
//         ];
//         const filteredSubStatuses = subStatusFilter.filter(s => validSubStatuses.includes(s));
//         if (filteredSubStatuses.length > 0) {
//           remarkWhereConditions.lead_sub_status = filteredSubStatuses.length === 1 
//             ? filteredSubStatuses[0] 
//             : { [Op.in]: filteredSubStatuses };
//           includeRemarks = true;
//         }
//       }
//     }

//     // Calling status filters through StudentRemark
//     if (callingStatus) {
//       const callingStatusFilter = handleMultiSelectFilter(callingStatus);
//       if (callingStatusFilter) {
//         remarkWhereConditions.calling_status = callingStatusFilter.length === 1 
//           ? callingStatusFilter[0] 
//           : { [Op.in]: callingStatusFilter };
//         includeRemarks = true;
//       }
//     }

//     if (subCallingStatus) {
//       const subCallingStatusFilter = handleMultiSelectFilter(subCallingStatus);
//       if (subCallingStatusFilter) {
//         remarkWhereConditions.sub_calling_status = subCallingStatusFilter.length === 1 
//           ? subCallingStatusFilter[0] 
//           : { [Op.in]: subCallingStatusFilter };
//         includeRemarks = true;
//       }
//     }

//     // Date range filters for remarks
//     const nextCallDateRange = handleDateRange(nextCallDate_start, nextCallDate_end);
//     if (nextCallDateRange) {
//       remarkWhereConditions.callback_date = nextCallDateRange;
//       includeRemarks = true;
//     }

//     // Add StudentRemark include if needed
//     if (includeRemarks) {
//       includeConditions.push({
//         model: StudentRemark,
//         as:'student_remarks',
//         where: remarkWhereConditions,
//         attributes: ['lead_status', 'lead_sub_status', 'calling_status', 'sub_calling_status', 'callback_date', 'callback_time', 'remarks'],
//         required: true, // Inner join to filter students
//         order: [['created_at', 'DESC']],
//         limit: 1 // Get latest remark
//       });
//     } else {
//       // Include latest remark even if not filtering
//       includeConditions.push({
//         model: StudentRemark,
//         as:'student_remarks',
//         attributes: ['lead_status', 'lead_sub_status', 'calling_status', 'sub_calling_status', 'callback_date', 'callback_time', 'remarks'],
//         required: false,
//         order: [['created_at', 'DESC']],
//         limit: 1
//       });
//     }

//     // L3 calling status filters - these are directly on Student model
//     if (callingStatusL3) {
//       const callingStatusL3Filter = handleMultiSelectFilter(callingStatusL3);
//       if (callingStatusL3Filter) {
//         whereConditions.calling_status_l3 = callingStatusL3Filter.length === 1 
//           ? callingStatusL3Filter[0] 
//           : { [Op.in]: callingStatusL3Filter };
//       }
//     }

//     if (subCallingStatusL3) {
//       const subCallingStatusL3Filter = handleMultiSelectFilter(subCallingStatusL3);
//       if (subCallingStatusL3Filter) {
//         whereConditions.sub_calling_status_l3 = subCallingStatusL3Filter.length === 1 
//           ? subCallingStatusL3Filter[0] 
//           : { [Op.in]: subCallingStatusL3Filter };
//       }
//     }

//     // Build sort order
//     const orderBy = [];
    
//     // Map MongoDB field names to PostgreSQL field names
//     const fieldMapping = {
//       'createdAt': 'created_at',
//       'student_name': 'student_name',
//       'student_email': 'student_email',
//       'nextCallDateL3': 'next_call_date_l3',
//       'lastCallDateL3': 'last_call_date_l3'
//     };

//     const mappedSortBy = fieldMapping[sortBy] || sortBy;
//     orderBy.push([mappedSortBy, sortOrder.toUpperCase()]);


//     // Execute query with count
//     const { count, rows: students } = await Student.findAndCountAll({
//       where: whereConditions,
//       include: includeConditions,
//       order: orderBy,
//       limit: limitNum,
//       offset: offset,
//       distinct: true // Important for accurate count with joins
//     });

//     const totalPages = Math.ceil(count / limitNum);

//     // Get overall stats (you'll need to implement this based on your requirements)
//     const overallStats = await getOverallStats(data, selectedagent);

//     // Build response
//     const response = {
//       success: true,
//       data: students,
//       pagination: {
//         currentPage: pageNum,
//         totalPages,
//         totalRecords: count,
//         limit: limitNum,
//         hasNextPage: pageNum < totalPages,
//         hasPrevPage: pageNum > 1
//       },
//       overallStats,
//       filters: {
//         data, selectedagent, mode, source, leadStatus, leadSubStatus,
//         utmCampaign, utmSource, utmMedium, utmKeyword, callingStatus,
//         subCallingStatus, callingStatusL3, subCallingStatusL3,
//         isConnectedYet, isConnectedYetL3, searchTerm, hasUnreadMessages,
//         createdAt_start, createdAt_end, nextCallDate_start, nextCallDate_end,
//         lastCallDate_start, lastCallDate_end, nextCallDateL3_start, nextCallDateL3_end,
//         lastCallDateL3_start, lastCallDateL3_end, preferredCity, preferredState,
//         currentCity, currentState, preferredStream, preferredDegree,
//         preferredLevel, preferredSpecialization, preferredBudget_min,
//         preferredBudget_max, sortBy, sortOrder
//       },
//       appliedFilters: whereConditions
//     };

//     res.status(200).json(response);

//   } catch (error) {
//     console.error('Error in getStudents:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message
//     });
//   }
// };

// const getOverallStats = async (dataType, selectedAgent) => {
//   try {
//     const today = new Date();
//     const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
//     const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

//     // Build where conditions based on context
//     const buildWhereConditions = () => {
//       const conditions = {};

//       // If a specific agent is selected, filter by that agent
//       if (selectedAgent) {
//         if (dataType === 'l2') {
//           conditions.assigned_counsellor_id = selectedAgent;
//         } else if (dataType === 'l3') {
//           conditions.assigned_counsellor_l3_id = selectedAgent;
//         } else {
//           // If no specific dataType, get all data for this agent (both L2 and L3)
//           conditions[Op.or] = [
//             { assigned_counsellor_id: selectedAgent },
//             { assigned_counsellor_l3_id: selectedAgent }
//           ];
//         }
//       } else {
//         // No specific agent selected, filter by data type
//         if (dataType === 'l2') {
//           conditions.assigned_counsellor_id = { [Op.ne]: null };
//         } else if (dataType === 'l3') {
//           conditions.assigned_counsellor_l3_id = { [Op.ne]: null };
//         }
//         // If no dataType specified, no additional conditions (get all data)
//       }

//       return conditions;
//     };

//     const whereConditions = buildWhereConditions();
//     const rawStats = await calculateStats(whereConditions, startOfToday, endOfToday);

//     // Transform the stats to the flattened format expected by the frontend
//     const flattenedStats = transformStatsToFlatFormat(rawStats, dataType, selectedAgent);

//     return flattenedStats;

//   } catch (error) {
//     console.error('Error in getOverallStats:', error);
//     return null;
//   }
// };

// // Function to calculate stats for given where conditions
// const calculateStats = async (whereConditions, startOfToday, endOfToday) => {
//   try {
//     // Total leads count
//     const totalLeads = await Student.count({
//       where: whereConditions
//     });

//     // Fresh leads count - students with no remarks
//     const studentsWithRemarks = await StudentRemark.findAll({
//       attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('student_id')), 'student_id']],
//       raw: true
//     });
    
//     const studentIdsWithRemarks = studentsWithRemarks.map(r => r.student_id);
    
//     const freshLeadsConditions = {
//       ...whereConditions,
//       student_id: {
//         [Op.notIn]: studentIdsWithRemarks.length > 0 ? studentIdsWithRemarks : ['']
//       }
//     };
    
//     const freshLeads = await Student.count({
//       where: freshLeadsConditions
//     });

//     // Today's callback pending (L2)
//     const todayCallbackPendingL2 = await Student.count({
//       where: {
//         ...whereConditions,
//         next_call_date_l3: null, // Only L2 students
//         // Assuming you have a next_call_date field for L2
//         // If not, you might need to join with StudentRemark to get the latest callback_date
//       }
//     });

//     // Today's callback pending (L3)
//     const todayCallbackPendingL3 = await Student.count({
//       where: {
//         ...whereConditions,
//         next_call_date_l3: {
//           [Op.gte]: startOfToday,
//           [Op.lt]: endOfToday
//         }
//       }
//     });

//     // Last Intent stats for L2 (from latest remarks)
//     const lastIntentL2Query = `
//       SELECT sr.sub_calling_status, COUNT(*) as count
//       FROM students s
//       INNER JOIN (
//         SELECT student_id, sub_calling_status,
//                ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at DESC) as rn
//         FROM student_remarks
//         WHERE sub_calling_status IN ('Hot', 'Warm', 'Cold')
//       ) sr ON s.student_id = sr.student_id AND sr.rn = 1
//       WHERE ${buildSQLWhereClause(whereConditions, 's')}
//       AND s.assigned_counsellor_l3_id IS NULL
//       GROUP BY sr.sub_calling_status
//     `;

//     // Last Intent stats for L3
//     const lastIntentL3 = await Student.findAll({
//       attributes: [
//         'sub_calling_status_l3',
//         [Sequelize.fn('COUNT', '*'), 'count']
//       ],
//       where: {
//         ...whereConditions,
//         sub_calling_status_l3: {
//           [Op.in]: ['Hot', 'Warm', 'Cold']
//         }
//       },
//       group: ['sub_calling_status_l3'],
//       raw: true
//     });

//     // Execute the raw query for L2 intents
//     const lastIntentL2 = await Student.sequelize.query(lastIntentL2Query, {
//       type: Sequelize.QueryTypes.SELECT
//     });

//     // Not connected yet L2
//     const notConnectedL2 = await Student.count({
//       where: {
//         ...whereConditions,
//         is_connected_yet: false,
//         assigned_counsellor_l3_id: null // Only L2 students
//       }
//     });

//     // Not connected yet L3
//     const notConnectedL3 = await Student.count({
//       where: {
//         ...whereConditions,
//         is_connected_yet_l3: false,
//         assigned_counsellor_l3_id: { [Op.ne]: null } // Only L3 students
//       }
//     });

//     // Students with unread messages
//     const studentsWithUnreadMessages = await Student.count({
//       where: {
//         ...whereConditions,
//         number_of_unread_messages: { [Op.gt]: 0 }
//       }
//     });

//     // Total unread messages sum
//     const totalUnreadMessagesResult = await Student.findOne({
//       attributes: [[Sequelize.fn('SUM', Sequelize.col('number_of_unread_messages')), 'total']],
//       where: whereConditions,
//       raw: true
//     });

//     // Process last intent data
//     const processLastIntent = (intentData) => {
//       const intentStats = { Hot: 0, Warm: 0, Cold: 0 };
//       if (intentData && intentData.length > 0) {
//         intentData.forEach(item => {
//           const status = item.sub_calling_status || item.sub_calling_status_l3;
//           if (status && intentStats.hasOwnProperty(status)) {
//             intentStats[status] = parseInt(item.count);
//           }
//         });
//       }
//       return intentStats;
//     };

//     return {
//       totalLeads,
//       freshLeads,
//       todayCallbackPending: {
//         l2: todayCallbackPendingL2,
//         l3: todayCallbackPendingL3,
//         total: todayCallbackPendingL2 + todayCallbackPendingL3
//       },
//       lastIntent: {
//         l2: processLastIntent(lastIntentL2),
//         l3: processLastIntent(lastIntentL3)
//       },
//       notConnected: {
//         l2: notConnectedL2,
//         l3: notConnectedL3,
//         total: notConnectedL2 + notConnectedL3
//       },
//       unreadMessages: {
//         studentsWithUnreadMessages,
//         totalUnreadMessages: parseInt(totalUnreadMessagesResult?.total || 0)
//       }
//     };

//   } catch (error) {
//     console.error('Error in calculateStats:', error);
//     return null;
//   }
// };

// // Helper function to build SQL WHERE clause from Sequelize conditions
// const buildSQLWhereClause = (conditions, tableAlias = '') => {
//   const clauses = [];
//   const prefix = tableAlias ? `${tableAlias}.` : '';

//   Object.keys(conditions).forEach(key => {
//     const value = conditions[key];
    
//     if (key === Op.or) {
//       const orClauses = value.map(orCondition => {
//         return Object.keys(orCondition).map(orKey => {
//           const orValue = orCondition[orKey];
//           if (orValue === null || (typeof orValue === 'object' && orValue[Op.ne] === null)) {
//             return `${prefix}${orKey} IS NOT NULL`;
//           }
//           return `${prefix}${orKey} = '${orValue}'`;
//         }).join(' AND ');
//       });
//       clauses.push(`(${orClauses.join(' OR ')})`);
//     } else if (typeof value === 'object' && value[Op.ne] === null) {
//       clauses.push(`${prefix}${key} IS NOT NULL`);
//     } else if (value !== null) {
//       clauses.push(`${prefix}${key} = '${value}'`);
//     }
//   });

//   return clauses.length > 0 ? clauses.join(' AND ') : '1=1';
// };

// // Function to transform nested stats to flat format (keeping this the same as original)
// const transformStatsToFlatFormat = (stats, dataType, selectedAgent) => {
//   if (!stats) return null;

//   // Helper function to get the appropriate intent data based on dataType
//   const getIntentData = () => {
//     if (dataType === 'l2') {
//       return stats.lastIntent?.l2 || { Hot: 0, Warm: 0, Cold: 0 };
//     } else if (dataType === 'l3') {
//       return stats.lastIntent?.l3 || { Hot: 0, Warm: 0, Cold: 0 };
//     } else {
//       // If no dataType specified, combine both L2 and L3
//       const l2Intent = stats.lastIntent?.l2 || { Hot: 0, Warm: 0, Cold: 0 };
//       const l3Intent = stats.lastIntent?.l3 || { Hot: 0, Warm: 0, Cold: 0 };

//       return {
//         Hot: l2Intent.Hot + l3Intent.Hot,
//         Warm: l2Intent.Warm + l3Intent.Warm,
//         Cold: l2Intent.Cold + l3Intent.Cold
//       };
//     }
//   };

//   // Helper function to get callback data based on dataType
//   const getCallbackData = () => {
//     if (dataType === 'l2') {
//       return stats.todayCallbackPending?.l2 || 0;
//     } else if (dataType === 'l3') {
//       return stats.todayCallbackPending?.l3 || 0;
//     } else {
//       return stats.todayCallbackPending?.total || 0;
//     }
//   };

//   // Helper function to get not connected data based on dataType
//   const getNotConnectedData = () => {
//     if (dataType === 'l2') {
//       return stats.notConnected?.l2 || 0;
//     } else if (dataType === 'l3') {
//       return stats.notConnected?.l3 || 0;
//     } else {
//       return stats.notConnected?.total || 0;
//     }
//   };

//   const intentData = getIntentData();

//   return {
//     total: stats.totalLeads || 0,
//     freshLeads: stats.freshLeads || 0,
//     todayCallbacks: getCallbackData(),
//     intentHot: intentData.Hot,
//     intentWarm: intentData.Warm,
//     intentCold: intentData.Cold,
//     notConnectedYet: getNotConnectedData(),
//     allUnreadMessagesCount: stats.unreadMessages?.totalUnreadMessages || 0,
//     unreadMessages: {
//       leadsWithUnread: stats.unreadMessages?.studentsWithUnreadMessages || 0,
//       totalUnreadCount: stats.unreadMessages?.totalUnreadMessages || 0
//     },
//     // Add breakdown data for compatibility
//     callingStatusBreakdown: {
//       connected: stats.totalLeads - getNotConnectedData(),
//       notConnected: getNotConnectedData(),
//       withCallBackTime: getCallbackData()
//     },
//     funnelBreakdown: {
//       fresh: stats.freshLeads || 0,
//       attempted: 0, // This would need to be calculated if you have this data
//       preApplication: 0, // This would need to be calculated if you have this data
//       application: 0, // This would need to be calculated if you have this data
//       notInterested: 0 // This would need to be calculated if you have this data
//     }
//   };
// };

// export default getOverallStats;
// import { Op, fn, col, literal,where, Sequelize } from 'sequelize';
// import { Student, Counsellor, StudentRemark,sequelize } from '../models/index.js';

// // /**
// //  * Get comprehensive stats based on selected agent or all agents
// //  * @param {string} data - 'l2', 'l3', or undefined for all
// //  * @param {string} selectedAgent - Agent ID or undefined for all agents
// //  * @returns {Object} Stats object with counts and metrics
// //  */
// export const getOverallStats = async (data, selectedAgent) => {
//   try {
//     // Build base where conditions for agent filtering
//     const agentConditions = {};
    
//     if (selectedAgent) {
//       if (data === 'l2') {
//         agentConditions.assigned_counsellor_id = selectedAgent;
//       } else if (data === 'l3') {
//         agentConditions.assigned_counsellor_l3_id = selectedAgent;
//       } else {
//         // If no specific data type, match agent in either L2 or L3 assignment
//         agentConditions[Op.or] = [
//           { assigned_counsellor_id: selectedAgent },
//           { assigned_counsellor_l3_id: selectedAgent }
//         ];
//       }
//     } else {
     
//       // Filter based on data type for all agents
//       if (data === 'l2') {
//         agentConditions.assigned_counsellor_id = { [Op.ne]: null };
//         console.log(agentConditions)
//       } else if (data === 'l3') {
//         agentConditions.assigned_counsellor_l3_id = { [Op.ne]: null };
//       }
//     }

//     // Get today's date for callback filtering
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);
//     const tomorrow = new Date(today);
//     tomorrow.setDate(tomorrow.getDate() + 1);

//     // 1. Total students count
//     const total = await Student.count({
//       where: agentConditions
//     });

//     // 2. Fresh leads (students with no remarks)
//    const freshLeads = await Student.count({
//   where: {
//     ...agentConditions
//   },
//   include: [{
//     model: StudentRemark,
//     as: 'student_remarks',
//     required: false,
//     where: {
//       student_id: { [Op.col]: 'students.student_id' }
//     }
//   }],
//   having: literal('COUNT("student_remarks"."remark_id") = 0')
// });


//     // 3. Today's callbacks (next_call_date_l3 = today)
//     const todayCallbacks = await Student.count({
//       where: {
//         ...agentConditions,
//         next_call_date_l3: {
//           [Op.gte]: today,
//           [Op.lt]: tomorrow
//         }
//       }
//     });

//     // 4. Intent-based stats (Hot, Warm, Cold leads)
  
//    const intentStats = await getIntentStats(agentConditions);
//   console.log(intentStats)
// // const { hot_leads: hotLeads, warm_leads: warmLeads, cold_leads: coldLeads, not_connected: notConnectedYet } = intentStats;
    
//     // 6. Total unread messages count
//     const unreadMessagesResult = await Student.findAll({
//       where: agentConditions,
//       attributes: [
//         [fn('SUM', col('number_of_unread_messages')), 'totalUnreadMessages']
//       ],
//       raw: true
//     });

//     const allUnreadMessagesCount = parseInt(unreadMessagesResult[0]?.totalUnreadMessages) || 0;

//     return {
//       total,
//       freshLeads,
//       todayCallbacks,
//       intentHot: intentStats?.hot_leads,
//       intentWarm: intentStats?.warm_leads,
//       intentCold: intentStats?.cold_leads,
//       notConnectedYet:intentStats?.not_connected,
//       allUnreadMessagesCount
//     };

//   } catch (error) {
//     console.error('Error in getOverallStats:', error);
//     throw new Error('Failed to fetch overall stats');
//   }
// };
// export const getStudentsWithRemarks = async (filters) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       data,
//       selectedagent,
//       mode ,
//       source ,
//       leadStatus,
//       leadSubStatus,
//       utmCampaign,
//       utmSource,
//       utmMedium,
//       utmKeyword,
//       utmCampaignId,
//       utmAdgroupId,
//       utmCreativeId,
//       callingStatus,
//       subCallingStatus,
//       callingStatusL3,
//       subCallingStatusL3,
//       isConnectedYet,
//       isConnectedYetL3,
//       searchTerm ,
//       numberOfUnreadMessages: hasUnreadMessages,
//       createdAt_start,
//       createdAt_end,
//       nextCallDate_start,
//       nextCallDate_end,
//       lastCallDate_start,
//       lastCallDate_end,
//       nextCallDateL3_start,
//       nextCallDateL3_end,
//       lastCallDateL3_start,
//       lastCallDateL3_end,
//       preferredCity,
//       preferredState,
//       currentCity,
//       currentState,
//       preferredStream,
//       preferredDegree,
//       preferredLevel,
//       preferredSpecialization,
//       preferredBudget_min,
//       preferredBudget_max,
//       sortBy = 'created_at',
//       sortOrder = 'desc'
//     } = filters;

//     // Convert page and limit to numbers
//     const pageNum = parseInt(page, 10);
//     const limitNum = parseInt(limit, 10);
//     const offset = (pageNum - 1) * limitNum;

//     // Build where conditions
//     const whereConditions = {};
//     const andConditions = [];

//     // Helper functions
//     const handleMultiSelectFilter = (value) => {
//       if (!value) return null;
//       if (Array.isArray(value)) return value;
//       if (typeof value === 'string') {
//         return value.split(',').map(v => v.trim()).filter(v => v);
//       }
//       return [value];
//     };

//     const handleBooleanFilter = (value) => {
//       if (value === undefined || value === null || value === '') return null;
//       if (typeof value === 'boolean') return value;
//       return value === 'true' || value === '1';
//     };

//     const handleDateRange = (startDate, endDate) => {
//       const dateRange = {};
//       if (startDate) {
//         dateRange[Op.gte] = new Date(startDate);
//       }
//       if (endDate) {
//         const endOfDay = new Date(endDate);
//         endOfDay.setHours(23, 59, 59, 999);
//         dateRange[Op.lte] = endOfDay;
//       }
//       return Object.keys(dateRange).length > 0 ? dateRange : null;
//     };

//     // Core filters - Data type and agent assignment
//     if (data === 'l2') {
//       whereConditions.assigned_counsellor_id = { [Op.ne]: null };
//     } else if (data === 'l3') {
//       whereConditions.assigned_counsellor_l3_id = { [Op.ne]: null };
//     }

//     // Selected agent filtering
//     if (selectedagent) {
//       if (data === 'l3') {
//         whereConditions.assigned_counsellor_l3_id = selectedagent;
//       } else if (data === 'l2') {
//         whereConditions.assigned_counsellor_id = selectedagent;
//       }
//        else {
//         andConditions.push({
//           [Op.or]: [
//             { assigned_counsellor_id: selectedagent },
//             { assigned_counsellor_l3_id: selectedagent }
//           ]
//         });
//       }
//     }

//     // FIXED: Search term filter - Use the actual searchTerm variable
//     if (searchTerm && searchTerm.trim()) {
//    andConditions.push({
//     [Op.or]: [
//       { student_name: { [Op.iLike]: `%${searchTerm}%` } },
//       { student_email: { [Op.iLike]: `%${searchTerm}%` } },
//       { student_phone: { [Op.iLike]: `%${searchTerm}%` } },
//       { student_id: { [Op.iLike]: `%${searchTerm}%` } },
//       { student_secondary_email: { [Op.iLike]: `%${searchTerm}%` } }
//     ]
//   });
// }


//     // FIXED: Mode filter - Handle string values properly
//     if (mode) {
//       const modeFilter = handleMultiSelectFilter(mode);
//       if (modeFilter && modeFilter.length > 0) {
//         const validModes = ['Regular', 'Online'];
//         const filteredModes = modeFilter.filter(m => validModes.includes(m));
//         if (filteredModes.length > 0) {
//           whereConditions.mode = filteredModes.length === 1 
//             ? filteredModes[0] 
//             : { [Op.in]: filteredModes };
//         }
//       }
//     }

//     // FIXED: Source filter - Proper handling
//     if (source) {
//       const sourceFilter = handleMultiSelectFilter(source);
//       console.log('Source filter processed:', sourceFilter); // Debug log
//       if (sourceFilter && sourceFilter.length > 0) {
//         if (sourceFilter.length === 1) {
//           whereConditions.source = { [Op.iLike]: `%${sourceFilter[0]}%` };
//         } else {
//           whereConditions.source = {
//             [Op.or]: sourceFilter.map(s => ({ [Op.iLike]: `%${s}%` }))
//           };
//         }
//       }
//     }

//     // UTM filters - Fixed similar pattern
//     if (utmCampaign) {
//       const utmCampaignFilter = handleMultiSelectFilter(utmCampaign);
//       if (utmCampaignFilter && utmCampaignFilter.length > 0) {
//         whereConditions.utm_campaign = utmCampaignFilter.length === 1
//           ? { [Op.iLike]: `%${utmCampaignFilter[0]}%` }
//           : { [Op.or]: utmCampaignFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     if (utmSource) {
//       const utmSourceFilter = handleMultiSelectFilter(utmSource);
//       if (utmSourceFilter && utmSourceFilter.length > 0) {
//         whereConditions.utm_source = utmSourceFilter.length === 1
//           ? { [Op.iLike]: `%${utmSourceFilter[0]}%` }
//           : { [Op.or]: utmSourceFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     if (utmMedium) {
//       const utmMediumFilter = handleMultiSelectFilter(utmMedium);
//       if (utmMediumFilter && utmMediumFilter.length > 0) {
//         whereConditions.utm_medium = utmMediumFilter.length === 1
//           ? { [Op.iLike]: `%${utmMediumFilter[0]}%` }
//           : { [Op.or]: utmMediumFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     if (utmKeyword) {
//       const utmKeywordFilter = handleMultiSelectFilter(utmKeyword);
//       if (utmKeywordFilter && utmKeywordFilter.length > 0) {
//         whereConditions.utm_keyword = utmKeywordFilter.length === 1
//           ? { [Op.iLike]: `%${utmKeywordFilter[0]}%` }
//           : { [Op.or]: utmKeywordFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
//       }
//     }

//     // UTM ID filters (exact match)
//     if (utmCampaignId) {
//       const utmCampaignIdFilter = handleMultiSelectFilter(utmCampaignId);
//       if (utmCampaignIdFilter && utmCampaignIdFilter.length > 0) {
//         whereConditions.utm_campaign_id = utmCampaignIdFilter.length === 1 
//           ? utmCampaignIdFilter[0] 
//           : { [Op.in]: utmCampaignIdFilter };
//       }
//     }

//     if (utmAdgroupId) {
//       const utmAdgroupIdFilter = handleMultiSelectFilter(utmAdgroupId);
//       if (utmAdgroupIdFilter && utmAdgroupIdFilter.length > 0) {
//         whereConditions.utm_adgroup_id = utmAdgroupIdFilter.length === 1 
//           ? utmAdgroupIdFilter[0] 
//           : { [Op.in]: utmAdgroupIdFilter };
//       }
//     }

//     if (utmCreativeId) {
//       const utmCreativeIdFilter = handleMultiSelectFilter(utmCreativeId);
//       if (utmCreativeIdFilter && utmCreativeIdFilter.length > 0) {
//         whereConditions.utm_creative_id = utmCreativeIdFilter.length === 1 
//           ? utmCreativeIdFilter[0] 
//           : { [Op.in]: utmCreativeIdFilter };
//       }
//     }

//     // Boolean filters
//     const isConnectedYetFilter = handleBooleanFilter(isConnectedYet);
//     if (isConnectedYetFilter !== null) {
//       whereConditions.is_connected_yet = isConnectedYetFilter;
//     }

//     const isConnectedYetL3Filter = handleBooleanFilter(isConnectedYetL3);
//     if (isConnectedYetL3Filter !== null) {
//       whereConditions.is_connected_yet_l3 = isConnectedYetL3Filter;
//     }

//     // Unread messages filter
//     if (hasUnreadMessages === 'true') {
//       whereConditions.number_of_unread_messages = { [Op.gt]: 0 };
//     } else if (hasUnreadMessages === 'false') {
//       whereConditions.number_of_unread_messages = { [Op.eq]: 0 };
//     }

//     // Date range filters
//     const createdAtRange = handleDateRange(createdAt_start, createdAt_end);
//     if (createdAtRange) {
//       whereConditions.created_at = createdAtRange;
//     }

//     const nextCallDateRange = handleDateRange(nextCallDate_start, nextCallDate_end);
//     if (nextCallDateRange) {
//       whereConditions.next_call_date = nextCallDateRange;
//     }

//     const lastCallDateRange = handleDateRange(lastCallDate_start, lastCallDate_end);
//     if (lastCallDateRange) {
//       whereConditions.last_call_date = lastCallDateRange;
//     }

//     const nextCallDateL3Range = handleDateRange(nextCallDateL3_start, nextCallDateL3_end);
//     if (nextCallDateL3Range) {
//       whereConditions.next_call_date_l3 = nextCallDateL3Range;
//     }

//     const lastCallDateL3Range = handleDateRange(lastCallDateL3_start, lastCallDateL3_end);
//     if (lastCallDateL3Range) {
//       whereConditions.last_call_date_l3 = lastCallDateL3Range;
//     }

//     // Location filters
//     if (preferredCity) {
//       const preferredCityFilter = handleMultiSelectFilter(preferredCity);
//       if (preferredCityFilter && preferredCityFilter.length > 0) {
//         whereConditions.preferred_city = { [Op.overlap]: preferredCityFilter };
//       }
//     }

//     if (preferredState) {
//       const preferredStateFilter = handleMultiSelectFilter(preferredState);
//       if (preferredStateFilter && preferredStateFilter.length > 0) {
//         whereConditions.preferred_state = { [Op.overlap]: preferredStateFilter };
//       }
//     }

//     if (currentCity) {
//       whereConditions.student_current_city = { [Op.iLike]: `%${currentCity}%` };
//     }

//     if (currentState) {
//       whereConditions.student_current_state = { [Op.iLike]: `%${currentState}%` };
//     }

//     // Preference filters
//     if (preferredStream) {
//       const preferredStreamFilter = handleMultiSelectFilter(preferredStream);
//       if (preferredStreamFilter && preferredStreamFilter.length > 0) {
//         whereConditions.preferred_stream = { [Op.overlap]: preferredStreamFilter };
//       }
//     }

//     if (preferredDegree) {
//       const preferredDegreeFilter = handleMultiSelectFilter(preferredDegree);
//       if (preferredDegreeFilter && preferredDegreeFilter.length > 0) {
//         whereConditions.preferred_degree = { [Op.overlap]: preferredDegreeFilter };
//       }
//     }

//     if (preferredLevel) {
//       const preferredLevelFilter = handleMultiSelectFilter(preferredLevel);
//       if (preferredLevelFilter && preferredLevelFilter.length > 0) {
//         whereConditions.preferred_level = { [Op.overlap]: preferredLevelFilter };
//       }
//     }

//     if (preferredSpecialization) {
//       const preferredSpecializationFilter = handleMultiSelectFilter(preferredSpecialization);
//       if (preferredSpecializationFilter && preferredSpecializationFilter.length > 0) {
//         whereConditions.preferred_specialization = { [Op.overlap]: preferredSpecializationFilter };
//       }
//     }

//     // Budget range filter
//     if (preferredBudget_min !== undefined && preferredBudget_min !== null && preferredBudget_min !== '') {
//       whereConditions.preferred_budget = whereConditions.preferred_budget || {};
//       whereConditions.preferred_budget[Op.gte] = parseInt(preferredBudget_min, 10);
//     }

//     if (preferredBudget_max !== undefined && preferredBudget_max !== null && preferredBudget_max !== '') {
//       whereConditions.preferred_budget = whereConditions.preferred_budget || {};
//       whereConditions.preferred_budget[Op.lte] = parseInt(preferredBudget_max, 10);
//     }

//     // Add calling status filters based on latest remarks
//    if (callingStatus || subCallingStatus) {
//   const filters = [];

//   if (callingStatus) {
//     const callingStatusArray = handleMultiSelectFilter(callingStatus);
//     console.log('callingStatusArray',callingStatusArray)
//     if (callingStatusArray.length > 0) {
//       filters.push(
//         `sr.calling_status IN (${callingStatusArray.map(s => `'${s}'`).join(',')})`
//       );
//     }
//   }

//   if (subCallingStatus) {
    
//     const subCallingStatusArray = handleMultiSelectFilter(subCallingStatus);
//     console.log('subCallingStatus',subCallingStatusArray)
//     if (subCallingStatusArray.length > 0) {
//       filters.push(
//         `sr.sub_calling_status IN (${subCallingStatusArray.map(s => `'${s}'`).join(',')})`
//       );
//     }
//   }

//   // Only create subquery if at least one filter was added
//   if (filters.length > 0) {
//     const remarkSubquery = `
//       EXISTS (
//         SELECT 1 FROM student_remarks sr 
//         WHERE sr.student_id = "students"."student_id" 
//         AND sr.created_at = (
//           SELECT MAX(created_at) 
//           FROM student_remarks sr2 
//           WHERE sr2.student_id = "students"."student_id"
//         )
//         ${filters.map(f => `AND ${f}`).join('\n')}
//       )
//     `;
//     andConditions.push(sequelize.literal(remarkSubquery));
//   }
// }


  
//     if (andConditions.length > 0) {
//       if (Object.keys(whereConditions).length > 0) {
//         // If we already have conditions, combine them
//         whereConditions[Op.and] = [...andConditions];
//       } else {
//         // If no other conditions, just use the AND conditions
//         whereConditions[Op.and] = andConditions;
//       }
//     }
//   console.log(whereConditions)
//     // Enhanced debug logging
//     // console.log('=== FILTER DEBUG INFO ===');
//     // console.log('Raw filters received:', filters);
//     // console.log('Search term:', searchTerm);
//     // console.log('Mode:', mode);
//     // console.log('Source:', source);
//     // console.log('Data type:', data);
//     // console.log('Selected agent:', selectedagent);
    
//     // console.log('Final whereConditions:', JSON.stringify(whereConditions, null, 2));
//     // console.log('=========================');

//     // Build include array for associations
//     const include = [
//       {
//         model: Counsellor,
//         as: 'assignedCounsellor',
//         attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email'],
//         required: false,
//         where: data === 'l2' ? {} : undefined
//       },
//       {
//         model: Counsellor,
//         as: 'assignedCounsellorL3',
//         attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email'],
//         required: false,
//         where: data === 'l3' ? {} : undefined
//       },
//       {
//         model: StudentRemark,
//         as: 'student_remarks',
//         required: false,
//         separate: true,
//         order: [['created_at', 'DESC']],
//         limit: 2,
//         attributes: [
//           'remark_id',
//           'calling_status',
//           'sub_calling_status',
//           'lead_status',
//           'lead_sub_status',
//           'remarks',
//           'callback_date',
//           'callback_time',
//           'created_at',
//           'updated_at'
//         ]
//       },
//       {
//         model: StudentRemark,
//         as: 'remark_count',
//         attributes: [],
//         required: false
//       }
//     ];

//     // Get total count for pagination
//     const totalCount = await Student.count({
//       where: whereConditions,
//       include: include.filter(inc => inc.required !== false || inc.as === 'assignedCounsellor' || inc.as === 'assignedCounsellorL3'),
//       distinct: true
//     });

//     const students = await Student.findAll({
//       where: whereConditions,
//       attributes: {
//         include: [
//           [sequelize.fn('COUNT', sequelize.col('remark_count.remark_id')), 'noOfRemarks']
//         ]
//       },
//       include,
//       limit: limitNum,
//       offset,
//       order: [[sortBy, sortOrder.toUpperCase()]],
//       group: ['students.student_id', 'assignedCounsellor.counsellor_id', 'assignedCounsellorL3.counsellor_id'],
//       subQuery: false
//     });

//     console.log('Students found:', students.length);

//     // Calculate pagination info
//     const totalPages = Math.ceil(totalCount / limitNum);

//     // Get overall stats
//     // const overallStats = await getOverallStats(data, selectedagent);

//     return {
//       success: true,
//       data: students,
//       pagination: {
//         currentPage: pageNum,
//         totalPages,
//         totalRecords: totalCount,
//         limit: limitNum,
//         hasNextPage: pageNum < totalPages,
//         hasPrevPage: pageNum > 1
//       },
//       // overallStats,
//       filters: filters,
//       appliedFilters: whereConditions
//     };

//   } catch (error) {
//     console.error('Error in getStudentsWithRemarks:', error.message);
//     throw new Error('Failed to fetch students with remarks');
//   }
// };
// export const getStudents = async (req, res) => {
//   try{
//      console.log(req.query)
//       const data=await getStudentsWithRemarks(req.query)

//       res.status(200).json(data);
//   }
//    catch(error)
//    {
//     console.error('Error in getStudents:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Internal server error',
//       error: error.message
//     });
//    }
// }

// const getIntentStats = async (agentConditions = {}) => {
//   let agentConditionSQL = '';
//   const replacements = {};

//   // Handle different agent conditions safely
//   if (
//     agentConditions.assigned_counsellor_id &&
//     typeof agentConditions.assigned_counsellor_id === 'object' &&
//     Op.ne in agentConditions.assigned_counsellor_id
//   ) {
//     agentConditionSQL = `AND s.assigned_counsellor_id IS NOT NULL`;
//   } else if (typeof agentConditions.assigned_counsellor_id === 'string') {
//     agentConditionSQL = `AND s.assigned_counsellor_id = :assigned_counsellor_id`;
//     replacements.assigned_counsellor_id = agentConditions.assigned_counsellor_id;
//   } else if (typeof agentConditions.assigned_counsellor_l3_id === 'object' &&
//              Op.ne in agentConditions.assigned_counsellor_l3_id) {
//     agentConditionSQL = `AND s.assigned_counsellor_l3_id IS NOT NULL`;
//   } else if (typeof agentConditions.assigned_counsellor_l3_id === 'string') {
//     agentConditionSQL = `AND s.assigned_counsellor_l3_id = :assigned_counsellor_l3_id`;
//     replacements.assigned_counsellor_l3_id = agentConditions.assigned_counsellor_l3_id;
//   } else if (agentConditions[Op.or]) {
//     const [cond1, cond2] = agentConditions[Op.or];
//     const key1 = Object.keys(cond1)[0];
//     const key2 = Object.keys(cond2)[0];
//     replacements.value1 = cond1[key1];
//     replacements.value2 = cond2[key2];

//     agentConditionSQL = `
//       AND (
//         s.${key1} = :value1 OR
//         s.${key2} = :value2
//       )
//     `;
//   } else {
//     // Default fallback
//     agentConditionSQL = `
//       AND (
//         s.assigned_counsellor_id IS NOT NULL OR 
//         s.assigned_counsellor_l3_id IS NOT NULL
//       )
//     `;
//   }

//   const query = `
//     WITH latest_remarks AS (
//       SELECT DISTINCT ON (student_id) 
//         student_id,
//         calling_status,
//         sub_calling_status,
//         created_at
//       FROM student_remarks 
//       ORDER BY student_id, created_at DESC
//     )
//     SELECT 
//       COUNT(CASE WHEN LOWER(lr.sub_calling_status) = 'hot' THEN 1 END) as hot_leads,
//       COUNT(CASE WHEN LOWER(lr.sub_calling_status) = 'warm' THEN 1 END) as warm_leads,
//       COUNT(CASE WHEN LOWER(lr.sub_calling_status) = 'cold' THEN 1 END) as cold_leads,
//       COUNT(CASE WHEN lr.calling_status = 'Not Connected' THEN 1 END) as not_connected
//     FROM students s
//     INNER JOIN latest_remarks lr ON s.student_id = lr.student_id
//     WHERE 1=1 ${agentConditionSQL}
//   `;

//   const [results] = await sequelize.query(query, { replacements });
//   return results[0];
// };


import { Sequelize,Op } from 'sequelize';
import Student from '../models/Student.js';
import Counsellor from '../models/Counsellor.js';
import StudentRemark from '../models/StudentRemark.js';
import StudentLeadActivity from '../models/StudentLeadActivity.js';
import sequelize from '../config/database-config.js';

export const getStudents = async (req, res) => {
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
      remarkLeadStatus,
      remarkLeadSubStatus,
      remarkCallingStatus,
      remarkSubCallingStatus,
      remarks,
      callbackDate_start,
      callbackDate_end,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

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

    const handleDateRange = (startDate, endDate) => {
      const dateRange = {};
      if (startDate) {
        dateRange[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        dateRange[Op.lte] = endOfDay;
      }
      return Object.keys(dateRange).length > 0 ? dateRange : null;
    };

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

    // Lead status filters (keeping existing)
    if (leadStatus) {
      const statusFilter = handleMultiSelectFilter(leadStatus);
      if (statusFilter) {
        const validStatuses = ['Pre Application', 'Application', 'Admission', 'NotInterested', 'Fresh'];
        const filteredStatuses = statusFilter.filter(s => validStatuses.includes(s));
        if (filteredStatuses.length > 0) {
          whereConditions.lead_status = filteredStatuses.length === 1 ? filteredStatuses[0] : { [Op.in]: filteredStatuses };
        }
      }
    }

    if (leadSubStatus) {
      const subStatusFilter = handleMultiSelectFilter(leadSubStatus);
      if (subStatusFilter) {
        const validSubStatuses = [
          'Untouched Lead', 'Counselling Yet to be Done', 'Initial Counseling Completed',
          'Ready to Pay', 'Form Filled_Degreefyd', 'Form Filled_Partner website',
          'Walkin Completed', 'Registration Done', 'Semester Paid', 'Multiple Attempts made',
          'Invalid number / Wrong Number', 'Language Barrier', 'Not Enquired',
          'Already Enrolled_Partner', 'First call Not Interested', 'Not Eligible',
          'Dublicate_Same student exists', 'Only_Regular course', 'Next Year',
          'Budget issue', 'Already Enrolled_NP', 'Reason not shared', 'Location issue'
        ];
        const filteredSubStatuses = subStatusFilter.filter(s => validSubStatuses.includes(s));
        if (filteredSubStatuses.length > 0) {
          whereConditions.lead_sub_status = filteredSubStatuses.length === 1 ? filteredSubStatuses[0] : { [Op.in]: filteredSubStatuses };
        }
      }
    }

    // Boolean filters (keeping existing)
    const isConnectedYetFilter = handleBooleanFilter(isConnectedYet);
    if (isConnectedYetFilter !== null) {
      whereConditions.is_connected_yet = isConnectedYetFilter;
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

    const preferredStreamFilter = handleArrayFilter(preferredStream);
    if (preferredStreamFilter) {
      whereConditions.preferred_stream = preferredStreamFilter;
    }

    const preferredDegreeFilter = handleArrayFilter(preferredDegree);
    if (preferredDegreeFilter) {
      whereConditions.preferred_degree = preferredDegreeFilter;
    }

    const preferredLevelFilter = handleArrayFilter(preferredLevel);
    if (preferredLevelFilter) {
      whereConditions.preferred_level = preferredLevelFilter;
    }

    const preferredSpecializationFilter = handleArrayFilter(preferredSpecialization);
    if (preferredSpecializationFilter) {
      whereConditions.preferred_specialization = preferredSpecializationFilter;
    }

    // Budget range filter (keeping existing)
    const budgetRange = handleNumberRange(preferredBudget_min, preferredBudget_max);
    if (budgetRange) {
      whereConditions.preferred_budget = budgetRange;
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
    // Calling status filters (keeping existing)
    if (callingStatus) {
      const callingStatusFilter = handleMultiSelectFilter(callingStatus);
      if (callingStatusFilter) {
        remarkWhereConditions.calling_status = callingStatusFilter.length === 1 ? callingStatusFilter[0] : { [Op.in]: callingStatusFilter };
      }
    }

    if (subCallingStatus) {
      const subCallingStatusFilter = handleMultiSelectFilter(subCallingStatus);
      if (subCallingStatusFilter) {
        remarkWhereConditions.sub_calling_status = subCallingStatusFilter.length === 1 ? subCallingStatusFilter[0] : { [Op.in]: subCallingStatusFilter };
      }
    }
      const nextCallDateRange = handleDateRange(nextCallDate_start, nextCallDate_end);
    if (nextCallDateRange) {
      remarkWhereConditions.next_call_date = nextCallDateRange;
    }
    if (remarkLeadStatus) {
      const remarkLeadStatusFilter = handleMultiSelectFilter(remarkLeadStatus);
      if (remarkLeadStatusFilter) {
        remarkWhereConditions.lead_status = remarkLeadStatusFilter.length === 1 ? remarkLeadStatusFilter[0] : { [Op.in]: remarkLeadStatusFilter };
      }
    }

    if (remarkLeadSubStatus) {
      const remarkLeadSubStatusFilter = handleMultiSelectFilter(remarkLeadSubStatus);
      if (remarkLeadSubStatusFilter) {
        remarkWhereConditions.lead_sub_status = remarkLeadSubStatusFilter.length === 1 ? remarkLeadSubStatusFilter[0] : { [Op.in]: remarkLeadSubStatusFilter };
      }
    }

    if (remarkCallingStatus) {
      const remarkCallingStatusFilter = handleMultiSelectFilter(remarkCallingStatus);
      if (remarkCallingStatusFilter) {
        remarkWhereConditions.calling_status = remarkCallingStatusFilter.length === 1 ? remarkCallingStatusFilter[0] : { [Op.in]: remarkCallingStatusFilter };
      }
    }

    if (remarkSubCallingStatus) {
      const remarkSubCallingStatusFilter = handleMultiSelectFilter(remarkSubCallingStatus);
      if (remarkSubCallingStatusFilter) {
        remarkWhereConditions.sub_calling_status = remarkSubCallingStatusFilter.length === 1 ? remarkSubCallingStatusFilter[0] : { [Op.in]: remarkSubCallingStatusFilter };
      }
    }

    if (remarks) {
      remarkWhereConditions.remarks = handleTextFilter(remarks);
    }

    const callbackDateRange = handleDateRange(callbackDate_start, callbackDate_end);
    if (callbackDateRange) {
      remarkWhereConditions.callback_date = callbackDateRange;
    }

    // UTM filters for StudentLeadActivity (keeping existing logic)
    const utmWhereConditions = {};
    
    if (utmCampaign) {
      const utmCampaignFilter = handleMultiSelectFilter(utmCampaign);
      console.log('utm',utmCampaignFilter)
      if (utmCampaignFilter) {
        utmWhereConditions.utm_campaign = utmCampaignFilter.length === 1
          ? handleTextFilter(utmCampaignFilter[0])
          : { [Op.or]: utmCampaignFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
      }
      console.log(utmWhereConditions)
    }
    if (utmSource) {
      const utmSourceFilter = handleMultiSelectFilter(utmSource);
      if (utmSourceFilter) {
        utmWhereConditions.utm_source = utmSourceFilter.length === 1
          ? handleTextFilter(utmSourceFilter[0])
          : { [Op.or]: utmSourceFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
      }
    }

    if (utmMedium) {
      const utmMediumFilter = handleMultiSelectFilter(utmMedium);
      if (utmMediumFilter) {
        utmWhereConditions.utm_medium = utmMediumFilter.length === 1
          ? handleTextFilter(utmMediumFilter[0])
          : { [Op.or]: utmMediumFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
      }
    }

    if (utmKeyword) {
      const utmKeywordFilter = handleMultiSelectFilter(utmKeyword);
      if (utmKeywordFilter) {
        utmWhereConditions.utm_keyword = utmKeywordFilter.length === 1
          ? handleTextFilter(utmKeywordFilter[0])
          : { [Op.or]: utmKeywordFilter.map(u => ({ [Op.iLike]: `%${u}%` })) };
      }
    }

    // UTM ID filters (exact match)
    if (utmCampaignId) {
      const utmCampaignIdFilter = handleMultiSelectFilter(utmCampaignId);
      if (utmCampaignIdFilter) {
        utmWhereConditions.utm_campaign_id = utmCampaignIdFilter.length === 1 ? utmCampaignIdFilter[0] : { [Op.in]: utmCampaignIdFilter };
      }
    }

    if (utmAdgroupId) {
      const utmAdgroupIdFilter = handleMultiSelectFilter(utmAdgroupId);
      if (utmAdgroupIdFilter) {
        utmWhereConditions.utm_adgroup_id = utmAdgroupIdFilter.length === 1 ? utmAdgroupIdFilter[0] : { [Op.in]: utmAdgroupIdFilter };
      }
    }

    if (utmCreativeId) {
      const utmCreativeIdFilter = handleMultiSelectFilter(utmCreativeId);
      if (utmCreativeIdFilter) {
        utmWhereConditions.utm_creative_id = utmCreativeIdFilter.length === 1 ? utmCreativeIdFilter[0] : { [Op.in]: utmCreativeIdFilter };
      }
    }

    // Build sort order
    const orderClause = [[sortBy, sortOrder.toUpperCase()]];
     console.log('utmWhereConditions',utmWhereConditions)

    console.log('Where Conditions:', JSON.stringify(whereConditions, null, 2));
    console.log('Remark Where Conditions:', JSON.stringify(remarkWhereConditions, null, 2));
    console.log('UTM Where Conditions:', JSON.stringify(utmWhereConditions, null, 2));

// Alternative approach using subqueries to get latest records


// Step 1: Get student IDs from latest student_remarks
let remarkStudentIdsSet = null;
if (Object.keys(remarkWhereConditions).length > 0) {
 const remarkResult = await sequelize.query(`
  SELECT sr.student_id
  FROM (
    SELECT DISTINCT ON (student_id) *
    FROM student_remarks
    ORDER BY student_id, created_at DESC
  ) sr
  WHERE ${buildWhereSQL(remarkWhereConditions)}
  LIMIT ${limit}
`, { type: Sequelize.QueryTypes.SELECT });

console.log(remarkWhereConditions)
  // Apply limit in JS (if needed)
  const limitedRemarkIds = remarkResult.slice(0, limit).map(r => r.student_id);
  remarkStudentIdsSet = new Set(limitedRemarkIds);
}

let activityStudentIdsSet = null;
if (Object.keys(utmWhereConditions).length > 0) {
 const activityResult = await sequelize.query(`
  SELECT sa.student_id
  FROM (
    SELECT DISTINCT ON (student_id) *
    FROM student_lead_activities
    ORDER BY student_id, created_at ASC
  ) sa
  WHERE ${buildWhereSQL(utmWhereConditions)}
  LIMIT ${limit}
`, { type: Sequelize.QueryTypes.SELECT });

  // Apply limit in JS (if needed)
  const limitedActivityIds = activityResult.slice(0, limit).map(r => r.student_id);
  activityStudentIdsSet = new Set(limitedActivityIds);
}


// Step 3: Intersect both sets if both exist, or use the single one
let finalStudentIds = null;

if (remarkStudentIdsSet && activityStudentIdsSet) {
  finalStudentIds = [...remarkStudentIdsSet].filter(id => activityStudentIdsSet.has(id));
} else if (remarkStudentIdsSet) {
  finalStudentIds = [...remarkStudentIdsSet];
} else if (activityStudentIdsSet) {
  finalStudentIds = [...activityStudentIdsSet];
}

// Step 4: Inject filtered student IDs into main where clause
if (finalStudentIds) {
  whereConditions.student_id = {
    [Op.in]: finalStudentIds
  };
}

// Step 5: Include array (no `where`, just limit/order to get first/last rows)
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
    order: [['created_at', 'DESC']],
    limit: 1,
    required: false
  },
  {
    model: StudentLeadActivity,
    as: 'lead_activities',
    attributes: [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_keyword',
      'utm_campaign_id', 'utm_adgroup_id', 'utm_creative_id', 'created_at'
    ],
    order: [['created_at', 'ASC']],
    limit: 1,
    required: false
  }
];

// Step 6: Final query
const { count: totalCount, rows: students } = await Student.findAndCountAll({
  where: whereConditions,
  include: includeArray,
  limit: limitNum,
  offset: offset,
  order: orderClause,
  distinct: true,
  subQuery: false,
  
});

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
      filters: {
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
        hasUnreadMessages,
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
        // New remark filters
        remarkLeadStatus,
        remarkLeadSubStatus,
        remarkCallingStatus,
        remarkSubCallingStatus,
        remarks,
        callbackDate_start,
        callbackDate_end,
        sortBy,
        sortOrder
      },
      appliedFilters: {
        student: whereConditions,
        remarks: remarkWhereConditions,
        utm: utmWhereConditions
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error in getStudents:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};
function buildWhereSQL(whereObj) {
  return Object.entries(whereObj).map(([key, value]) => {
    if (typeof value === 'string') return `${key} = '${value}'`;
    if (typeof value === 'number') return `${key} = ${value}`;
    if (Array.isArray(value)) return `${key} IN (${value.map(v => `'${v}'`).join(',')})`;
    return '1=1'; // fallback
  }).join(' AND ');
}
