import WishListStudent from "../models/WhishList.js";
import {mapFiltersForGetStudentsHelper} from './students.table.js'
import {getWhishListStudentHelper} from './whishlist-table.js'
export const addToWishlist = async (req, res) => {
  try {
    const counsellorId = req.user.id || req.user.counsellorId ;
    const { studentId } = req.body;
    console.log(studentId,req.body,req.user)
    const existing = await WishListStudent.findOne({where:{ student_id:studentId, counsellor_id: counsellorId} });
    if (existing) {
      return res.status(400).json({ message: 'Student already in wishlist' });
    }

    const newEntry = await WishListStudent.create({ student_id:studentId, counsellor_id: counsellorId} );
    

    res.status(201).json({ message: 'Student added to wishlist', data: newEntry });
  } catch (err) {
        console.log(err.message)

    res.status(500).json({ message: 'Failed to add to wishlist', error: err.message });
  }
};


export const removeFromWishlist = async (req, res) => {
  try {
    const counsellorId =req.user.id|| req.user.counsellorId;
    const { studentId } = req.body;

    const deleted = await WishListStudent.destroy({
      where: {
        student_id: studentId,
        counsellor_id: counsellorId
      }
    });

    if (deleted === 0) {
      return res.status(404).json({ message: 'Student not found in wishlist' });
    }

    return res.status(200).json({ message: 'Student removed from wishlist' });
  } catch (err) {
    console.error("Error removing student from wishlist:", err);
    return res.status(500).json({ message: 'Failed to remove from wishlist', error: err.message });
  }
};

export const checkShortListById = async (req, res) => {
  try {
    const { studentId } = req.params;
    const counsellorId =   req.user.id || req.user.counsellorId;
   
    const shortList = await WishListStudent.findOne({
      where: {
        student_id: studentId,
        counsellor_id: counsellorId
      }
    });

    const isShortList = !!shortList;

    return res.status(200).json({
      message: isShortList ? 'Student is in shortlist' : 'Student is not in shortlist',
      isShortList
    });
  } catch (error) {
    console.error('Error checking shortlist:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

export const exportWishlistStudents = async (req, res) => {
  try {
   
       const filters = mapFiltersForGetStudentsHelper(req.query);
       const result = await getWhishListStudentHelper(filters);
       const students = result.data;
    if (students.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No wishlist students found for export'
      });
    }

    const csvHeader = [
      'Student ID',
      'Name',
      'Email',
      'Phone Number',
      'Parents Number',
      'WhatsApp',
      'Lead Status',
      'Lead Sub Status',
      'Mode',
      'Calling Status',
      'Sub Calling Status',
      'Remark',
      'Preferred Stream',
      'Preferred Budget',
      'Preferred Degree',
      'Preferred Level',
      'Preferred Specialization',
      'Preferred City',
      'Preferred State',
      'Current City',
      'Current State',
      'Source',
      'UTM Source',
      'UTM Medium',
      'UTM Campaign',
      'Assigned Counsellor',
      'Counsellor Name',
      'Assigned Counsellor L3',
      'Counsellor Name L3',
      'Next Call Date',
      'Last Call Date',
      'Next Call Time',
      'Is Connected Yet',
      'Total Remarks',
      'Number of Unread Messages',
      'Wishlist By',
      'Wishlist Date',
      'Created At'
    ].join(',');

    const csvRows = students.map(student => {
      const remark = student?.student_remarks?.[0] || {};
      const activity = student?.lead_activities?.[0] || {};
      const wishlistDate = student?.wishlisted_at
        ? new Date(student.wishlisted_at).toISOString().split('T')[0]
        : '';
      const createdAt = student?.created_at
        ? new Date(student.created_at).toISOString().split('T')[0]
        : '';

      return [
        student.student_id || '',
        `"${student.student_name || ''}"`,
        student.student_email || '',
        student.student_phone || '',
        student.parents_number || '',
        student.whatsapp || '',
        remark.lead_status || '',
        remark.lead_sub_status || '',
        student.mode || '',
        remark.calling_status || '',
        remark.sub_calling_status || '',
        remark.remarks || '',
        Array.isArray(student.preferred_stream) ? student.preferred_stream.join(';') : '',
        student.preferred_budget || '',
        Array.isArray(student.preferred_degree) ? student.preferred_degree.join(';') : '',
        Array.isArray(student.preferred_level) ? student.preferred_level.join(';') : '',
        Array.isArray(student.preferred_specialization) ? student.preferred_specialization.join(';') : '',
        Array.isArray(student.preferred_city) ? student.preferred_city.join(';') : '',
        Array.isArray(student.preferred_state) ? student.preferred_state.join(';') : '',
        student.student_current_city || '',
        student.student_current_state || '',
        remark.lead_sub_status || '',
        activity.utm_source || '',
        activity.utm_medium || '',
        activity.student?.utm_campaign || '',
        student.assignedCounsellor?.counsellor_id || '',
        student.assignedCounsellor?.counsellor_name || '',
        student.assignedCounsellorL3?.counsellor_id || '',
        student.assignedCounsellorL3?.counsellor_name || '',
        remark.callback_date || '',
        remark.created_at || '',
        remark.callback_time || '',
        student.is_connected_yet ? 'Yes' : 'No',
        student.totalRemark || 0,
        student.number_of_unread_messages || 0,
        student.wishlist_by || student.counsellor_id || '',
        wishlistDate,
        createdAt
      ].join(',');
    });

    const csvContent = [csvHeader, ...csvRows].join('\n');

    const fileName = `wishlist_students_export_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    res.status(200).send(csvContent);
  } catch (error) {
    console.error('Error exporting wishlist students:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

