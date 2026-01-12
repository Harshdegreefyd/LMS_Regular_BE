import { mapFiltersForGetStudentsHelper } from '../students.table.js';
import { convertToCSV } from '../../helper/csv_helper.js';
import { getStudentsRawSQL } from '../rawQuery.test.js';
import { format } from 'date-fns';
import Analyser from '../../models/Analyser.js';

export const exportStudentsCSV = async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    const isAnalyser = userRole === 'Analyser';

    let analyserData = {};
    if (isAnalyser && userId) {
      try {
        const analyser = await Analyser.findByPk(userId, {
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

    const filters = mapFiltersForGetStudentsHelper(req.query, userRole, analyserData);
    const result = await getStudentsRawSQL(filters,req,true);
    const students = result.data;

    const formatDate = (d) => {
      if (!d) return '';
      try {
        return format(new Date(d), 'dd-MMM-yyyy HH:mm:ss');
      } catch {
        return d.toString();
      }
    };

    const maskStudentName = (name) => {
      if (!name || typeof name !== 'string') return '***';
      const trimmedName = name.trim();
      if (trimmedName.length <= 2) return '***';
      return trimmedName.charAt(0) + '***';
    };

    const maskEmail = (email) => {
      if (!email || typeof email !== 'string') return '***@xxxxxx.com';
      const trimmedEmail = email.trim();
      if (!trimmedEmail.includes('@')) return '***@xxxxxx.com';
      const atIndex = trimmedEmail.indexOf('@');
      const username = trimmedEmail.substring(0, Math.min(atIndex, 3));
      return username + '***@xxxxxx.com';
    };

    const maskPhone = (phone) => {
      if (!phone || typeof phone !== 'string') return 'XXXXXX';
      const trimmedPhone = phone.trim();
      if (trimmedPhone.length <= 4) return 'XXXXXX';
      return trimmedPhone.substring(0, 4) + 'XXXXXX';
    };

    const validDetails = students.map((s) => {
      const counsellorNameL2 = s?.assignedCounsellor?.counsellor_name || '';
      const counsellorNameL3 = s?.assignedCounsellorL3?.counsellor_name || '';
      const latestRemark = s?.student_remarks?.[0] || {};
      const leadActivities = s?.lead_activities?.[0] || {};

      let studentName = s?.student_name || '';
      let studentEmail = s?.student_email || '';
      let studentPhone = s?.student_phone || '';

      if (isAnalyser) {
        studentName = maskStudentName(studentName);
        studentEmail = maskEmail(studentEmail);
        studentPhone = maskPhone(studentPhone);
      }

      return {
        student_id: s?.student_id || '',
        student_name: studentName,
        student_email: studentEmail,
        student_phone: studentPhone,
        highest_degree: s?.highest_degree || '',
        completion_year: s?.completion_year || '',
        current_profession: s?.current_profession || '',
        current_role: s?.current_role || '',
        work_experience: s?.work_experience || '',
        student_age: s?.student_age || 0,
        objective: s?.objective || '',
        counsellor_name_l2: counsellorNameL2,
        counsellor_name_l3: counsellorNameL3,
        lead_status: latestRemark?.lead_status || '',
        lead_sub_status: latestRemark?.lead_sub_status || '',
        mode: s?.mode || '',
        source: s?.source || leadActivities?.source || '',
        source_url: leadActivities?.source_url || '',
        utm_campaign: leadActivities?.utm_campaign || '',
        utm_source: leadActivities?.utm_source || '',
        utm_medium: leadActivities?.utm_medium || '',
        utm_keyword: leadActivities?.utm_keyword || '',
        calling_status: latestRemark?.calling_status || '',
        sub_calling_status: latestRemark?.sub_calling_status || '',
        calling_status_l3: s?.calling_status_l3 || '',
        sub_calling_status_l3: s?.sub_calling_status_l3 || '',
        preferred_stream: Array.isArray(s?.preferred_stream) ? s.preferred_stream.join('; ') : '',
        preferred_degree: Array.isArray(s?.preferred_degree) ? s.preferred_degree.join('; ') : '',
        preferred_level: Array.isArray(s?.preferred_level) ? s.preferred_level.join('; ') : '',
        preferred_city: Array.isArray(s?.preferred_city) ? s.preferred_city.join('; ') : '',
        preferred_state: Array.isArray(s?.preferred_state) ? s.preferred_state.join('; ') : '',
        current_city: s?.student_current_city || '',
        current_state: s?.student_current_state || '',
        preferred_budget: s?.preferred_budget || 0,
        created_at: formatDate(s?.created_at),
        next_call_date: formatDate(latestRemark?.callback_date),
        last_call_date: formatDate(latestRemark?.created_at),
        next_call_date_l3: formatDate(s?.next_call_date_l3),
        last_call_date_l3: formatDate(s?.last_call_date_l3),
        first_callback_l2: formatDate(s?.first_callback_l2),
        first_form_filled_date: formatDate(s?.first_form_filled_date),
        first_callback_l3: formatDate(s?.first_callback_l3),
        assigned_l3_date: formatDate(s?.assigned_l3_date),
        assigned_team_owner_date: formatDate(s?.assigned_team_owner_date),
        next_call_time: latestRemark?.callback_time || '',
        next_call_time_l3: s?.next_call_time_l3 || '',
        remark: latestRemark?.remarks || '',
        remarks_l3: s?.remarks_l3 || '',
        total_remarks: s?.remark_count ?? '',
        total_remarks_l3: s?.total_remarks_l3 ?? '',
        is_connected_yet: typeof s?.is_connected_yet === 'boolean' ? (s.is_connected_yet ? 'Yes' : 'No') : '',
        is_connected_yet_l3: typeof s?.is_connected_yet_l3 === 'boolean' ? (s.is_connected_yet_l3 ? 'Yes' : 'No') : '',
        is_reactivity: typeof s?.is_reactivity === 'boolean' ? (s.is_reactivity ? 'Yes' : 'No') : '',
        number_of_unread_messages: s?.number_of_unread_messages || 0,
        first_call_date_l2: formatDate(s?.first_call_date_l2),
        first_call_date_l3: formatDate(s?.first_call_date_l3),
        first_icc_date: formatDate(s?.first_icc_date),
        total_connected_calls: s?.total_connected_calls || 0,
        admission_date: formatDate(s?.admission_date),
        is_pre_ni: typeof s?.is_pre_ni === 'boolean' ? (s.is_pre_ni ? 'Yes' : 'No') : '',
      };
    });

    const validFields = [
      'student_id',
      'student_name',
      'student_email',
      'student_phone',
      'highest_degree',
      'completion_year',
      'current_profession',
      'current_role',
      'work_experience',
      'student_age',
      'objective',
      'counsellor_name_l2',
      'counsellor_name_l3',
      'lead_status',
      'lead_sub_status',
      'mode',
      'source',
      'source_url',
      'utm_campaign',
      'utm_source',
      'utm_medium',
      'utm_keyword',
      'calling_status',
      'sub_calling_status',
      'calling_status_l3',
      'sub_calling_status_l3',
      'preferred_stream',
      'preferred_degree',
      'preferred_level',
      'preferred_city',
      'preferred_state',
      'current_city',
      'current_state',
      'preferred_budget',
      'created_at',
      'next_call_date',
      'last_call_date',
      'next_call_date_l3',
      'last_call_date_l3',
      'first_callback_l2',
      'first_form_filled_date',
      'first_callback_l3',
      'assigned_l3_date',
      'assigned_team_owner_date',
      'next_call_time',
      'next_call_time_l3',
      'remark',
      'remarks_l3',
      'total_remarks',
      'total_remarks_l3',
      'is_connected_yet',
      'is_connected_yet_l3',
      'is_reactivity',
      'number_of_unread_messages',
      'first_call_date_l2',
      'first_call_date_l3',
      'first_icc_date',
      'total_connected_calls',
      'admission_date',
      'is_pre_ni',
    ];

    const fieldDisplayNames = {
      student_id: 'Student ID',
      student_name: isAnalyser ? 'Student Name (Masked)' : 'Student Name',
      student_email: isAnalyser ? 'Student Email (Masked)' : 'Student Email',
      student_phone: isAnalyser ? 'Student Phone (Masked)' : 'Student Phone',
      highest_degree: 'Highest Degree',
      completion_year: 'Completion Year',
      current_profession: 'Current Profession',
      current_role: 'Current Role',
      work_experience: 'Work Experience',
      student_age: 'Student Age',
      objective: 'Objective',
      counsellor_name_l2: 'Counsellor Name (L2)',
      counsellor_name_l3: 'Counsellor Name (L3)',
      lead_status: 'Lead Status',
      lead_sub_status: 'Lead Sub Status',
      mode: 'Mode',
      source: 'Source',
      source_url: 'Source URL',
      utm_campaign: 'UTM Campaign',
      utm_source: 'UTM Source',
      utm_medium: 'UTM Medium',
      utm_keyword: 'UTM Keyword',
      calling_status: 'Calling Status (L2)',
      sub_calling_status: 'Sub Calling Status (L2)',
      calling_status_l3: 'Calling Status (L3)',
      sub_calling_status_l3: 'Sub Calling Status (L3)',
      preferred_stream: 'Preferred Stream',
      preferred_degree: 'Preferred Degree',
      preferred_level: 'Preferred Level',
      preferred_city: 'Preferred City',
      preferred_state: 'Preferred State',
      current_city: 'Current City',
      current_state: 'Current State',
      preferred_budget: 'Preferred Budget',
      created_at: 'Created At',
      next_call_date: 'Next Call Date (L2)',
      last_call_date: 'Last Call Date (L2)',
      next_call_date_l3: 'Next Call Date (L3)',
      last_call_date_l3: 'Last Call Date (L3)',
      first_callback_l2: 'First Callback (L2)',
      first_form_filled_date: 'First Form Filled Date',
      first_callback_l3: 'First Callback (L3)',
      assigned_l3_date: 'Assigned L3 Date',
      assigned_team_owner_date: 'Assigned Team Owner Date',
      next_call_time: 'Next Call Time (L2)',
      next_call_time_l3: 'Next Call Time (L3)',
      remark: 'Remark (L2)',
      remarks_l3: 'Remarks (L3)',
      total_remarks: 'Total Remarks (L2)',
      total_remarks_l3: 'Total Remarks (L3)',
      is_connected_yet: 'Is Connected Yet (L2)',
      is_connected_yet_l3: 'Is Connected Yet (L3)',
      is_reactivity: 'Is Reactivity',
      number_of_unread_messages: 'Unread Messages Count',
      first_call_date_l2: 'First Call Date (L2)',
      first_call_date_l3: 'First Call Date (L3)',
      first_icc_date: 'First ICC Date',
      total_connected_calls: 'Total Connected Calls',
      admission_date: 'Admission Date',
      is_pre_ni: 'Is Pre NI',
    };

    const csvData = convertToCSV(validDetails, validFields, fieldDisplayNames);
    const currentDate = format(new Date(), 'yyyy-MM-dd');
    const filename = isAnalyser
      ? `students_export_analyser_${currentDate}.csv`
      : `students_export_${currentDate}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    res.status(200).send(csvData);
  } catch (error) {
    console.error('Error in exportStudentsCSV:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting CSV',
      error: error.message,
    });
  }
};