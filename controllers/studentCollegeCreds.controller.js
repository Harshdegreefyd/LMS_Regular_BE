import { Op, where,fn,col ,literal} from 'sequelize';
import { StudentCollegeCred, UniversityCourse, Student, Counsellor } from '../models/index.js';
import { parse,format,isValid } from 'date-fns';

export const createStudentCollegeCreds = async (req, res) => {
  try {
    const {
      formID,
      couponCode,
      userName,
      password,
      studentId,
      courseId,
      collegeName,
      counsellorId,
      counsellorName
    } = req.body;
    if (!studentId || !courseId || !collegeName) {
      return res.status(400).json({ message: 'studentId, courseId, and collegeName are required' });
    }

    const college = collegeName.toLowerCase();

    if (college.includes("amity")) {
      if (formID) {
        const existingForm = await StudentCollegeCred.findOne({ where: { form_id: formID } });
        if (existingForm) {
          return res.status(409).json({ message: 'formID already exists' });
        }
      }
      if (couponCode) {
        const existingForm = await StudentCollegeCred.findOne({ where: { coupon_code: couponCode } });
        if (existingForm) {
          return res.status(409).json({ message: 'Coupon Code already exists' });
        }
      }

      if (!formID || !couponCode || !userName || !password) {
        return res.status(400).json({
          message: 'For Amity, all 4 fields (formID, couponCode, userName, password) are required'
        });
      }

      if (!/^\d{10}$/.test(userName)) {
        return res.status(400).json({
          message: 'For Amity, userName must be a valid 10-digit mobile number'
        });
      }
    }

    // Lovely Professional University validation
    if (college.includes("lovely")) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userName)) {
        return res.status(400).json({
          message: 'For Lovely Professional University, userName must be a valid email address'
        });
      }
    }

    // Chandigarh University validation
    if (college.includes("chandigarh")) {
      if (!/^\d{10}$/.test(userName)) {
        return res.status(400).json({
          message: 'For Chandigarh University, userName must be a valid 10-digit phone number'
        });
      }
    }

    const existing = await StudentCollegeCred.findOne({
      where: {
        student_id: studentId,
        course_id: courseId,
      }
    });

    if (existing) {
      return res.status(409).json({ message: 'Already submitted info for this course and college' });
    }

    const newEntry = await StudentCollegeCred.create({
      form_id: formID,
      coupon_code: couponCode,
      user_name: userName,
      password,
      student_id: studentId,
      course_id: courseId,
      counsellor_id: counsellorId,
    });

    res.status(201).json({ message: 'Entry created successfully', data: newEntry });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getStudentCredsByCourseAndStudent = async (req, res) => {
  try {
    console.log("hi")
    const { courseId, studentId } = req.query;

    if (!courseId || !studentId) {
      return res.status(400).json({ message: 'Both courseId and studentId are required' });
    }

    const record = await StudentCollegeCred.findOne({ where: { course_id: courseId, student_id: studentId }, include: [{ model: UniversityCourse, as: 'course' }, { model: Counsellor, as: 'counsellor' }, { model: Student, as: 'student' }] });

    if (!record) {
      return res.status(404).json({ message: 'No record found for the given courseId and studentId' });
    }

    res.status(200).json({ message: 'Record found', data: record });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getStudentCredsByStudentId = async (req, res) => {
  try {
    const { studentId } = req.params;

    const response = await StudentCollegeCred.find({ where: { student_id: studentId } });

    if (!response || response.length === 0) {
      return res.status(404).json({ message: 'No records found for this studentId' });
    }

    const responseWithCourse = await Promise.all(
      response.map(async (record) => {
        const course = await UniversityCourse.findOne({ courseId: record.courseId });
        return {
          ...record.toObject(),
          courseName: course?.courseName || 'N/A',
        };
      })
    );

    res.status(200).json({ message: 'Record found', data: responseWithCourse });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getCollegeCredsForReport = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const { from, to, roleL2, roleL3 } = req.query;

    if (roleL2 === 'true' && roleL3 === 'true') {
      return res.status(400).json({
        success: false,
        message: "Only one role filter allowed: either roleL2=true or roleL3=true, not both."
      });
    }

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date('2000-01-01');
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();

    const whereConditions = {
      created_at: { [Op.between]: [fromDate, toDate] }
    };

    // ---------- Run in parallel ----------
    const paginatedPromise = StudentCollegeCred.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['student_name', 'student_id', 'student_email', 'student_phone', 'source', 'created_at'],
          include: [
            { model: Counsellor, as: 'assignedCounsellor', attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'] },
            { model: Counsellor, as: 'assignedCounsellorL3', attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role'] }
          ]
        },
        { model: UniversityCourse, as: 'enrolledCourse', attributes: ['course_id', 'course_name', 'university_name'] }
      ],
      offset,
      limit,
      distinct: true,
      raw: true
    });

    let statsQuery;
    if (roleL2 === 'true' || roleL3 === 'true') {
      const targetPath = roleL2 === 'true'
        ? 'student->assignedCounsellor.counsellor_name'
        : 'student->assignedCounsellorL3.counsellor_name';

      statsQuery = StudentCollegeCred.findAll({
        where: whereConditions,
        include: [{
          model: Student,
          as: 'student',
          attributes: [],
          include: [{
            model: Counsellor,
            as: roleL2 === 'true' ? 'assignedCounsellor' : 'assignedCounsellorL3',
            attributes: []
          }]
        }],
        attributes: [
          [fn('COALESCE', col(targetPath), literal("'Unknown'")), 'groupName'],
          [fn('COUNT', col('*')), 'count']
        ],
        group: [col(targetPath)],
        raw: true,
        logging: true

      });
    } else {
      statsQuery = StudentCollegeCred.findAll({
        where: whereConditions,
        include: [{ model: UniversityCourse, as: 'enrolledCourse', attributes: [] }],
        attributes: [
          [fn('COALESCE', col('enrolledCourse.university_name'), literal("'Unknown'")), 'groupName'],
          [fn('COUNT', col('*')), 'count']
        ],
        group: [col('enrolledCourse.university_name')],
        raw: true
      });
    }

    const [paginatedResult, statsResult] = await Promise.all([paginatedPromise, statsQuery]);
    const { rows: creds, count: total } = paginatedResult;

    function formatCredentials(creds = []) {
      return creds.map(item => ({
        id: item.id,
        formID: item.form_id ?? '',
        couponCode: item.coupon_code ?? '',
        userName: item.user_name ?? '',
        password: item.password ?? '',
        studentId: item['student.student_id'] || '',
        studentName: item['student.student_name'] || '',
        studentEmail: item['student.student_email'] || '',
        studentPhoneNumber: item['student.student_phone'] || '',
        leadCreationDate: item['student.created_at'] || '',
        counsellorName: item['student.assignedCounsellor.counsellor_name'] || '',
        counsellorNameL3: item['student.assignedCounsellorL3.counsellor_name'] || '',
        courseId: item['enrolledCourse.course_id'] || '',
        courseName: item['enrolledCourse.course_name'] || '',
        collegeName: item['enrolledCourse.university_name'] || '',
        createdAt: item.created_at || '',
      }));
    }

    const formatted = formatCredentials(creds);

    // Convert stats
    const totalCount = statsResult.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
    const stats = statsResult.map(r => ({
      [roleL2 === 'true' || roleL3 === 'true' ? 'counsellor' : 'collegeName']: r.groupName,
      count: parseInt(r.count, 10),
      percentage: totalCount ? ((r.count / totalCount) * 100).toFixed(2) + '%' : '0.00%'
    }));

    return res.json({
      success: true,
      stats,
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      data: formatted
    });

  } catch (err) {
    console.error('❌ Error in getCollegeCredsForReport:', err);
    return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};




 export const formatDate = (d) => {
      if (!d) return '';
      try {
        return format(new Date(d), 'dd-MMM-yyyy HH:mm:ss');
      } catch {
        return d.toString();
      }
    };



export const downloadCollegeCredsForReport = async (req, res) => {
    try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { from, to, roleL2, roleL3 } = req.query;

    if (roleL2 === 'true' && roleL3 === 'true') {
      return res.status(400).json({
        success: false,
        message: "Only one role filter allowed: either roleL2=true or roleL3=true, not both."
      });
    }

    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date('2000-01-01');
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();

    const whereConditions = {
      created_at: { [Op.between]: [fromDate, toDate] }
    };

    const { rows: creds, count: total } = await StudentCollegeCred.findAndCountAll({
      where: whereConditions,
      include: [
        {
          model: Student,
          as: 'student',
          attributes: ['student_name', 'student_id', 'student_email', 'student_phone', 'source', 'created_at'],
          include: [
            { 
              model: Counsellor,
              as: 'assignedCounsellor',
              attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role']
            },
            {
              model: Counsellor,
              as: 'assignedCounsellorL3',
              attributes: ['counsellor_id', 'counsellor_name', 'counsellor_email', 'role']
            }
          ]
        },
        {
          model: UniversityCourse,
          as: 'enrolledCourse',
          attributes: ['course_id', 'course_name','university_name']
        }
      ],
      offset,
      raw:true
    });
 function formatCredentials(creds = []) {
  return creds.map(item => ({
    id: item.id,
    formID: item.form_id ?? '',
    couponCode: item.coupon_code ?? '',
    userName: item.user_name ?? '',
    password: item.password ?? '',
    studentId: item['student.student_id']  ||'',
    studentName: item['student.student_name'] ?? '',
    studentEmail: item['student.student_email'] ?? '',
    studentPhoneNumber: item['student.student_phone'] ?? '',
    leadCreationDate: formatDate(item['student.created_at']) ?? '',
    counsellorName: item['student.assignedCounsellor.counsellor_name'] ?? '',
    counsellorNameL3: item['student.assignedCounsellorL3.counsellor_name']?? '',
    courseId: item['enrolledCourse.course_id']?? '',
    courseName: item['enrolledCourse.course_name'] ?? '',
    collegeName: item['enrolledCourse.university_name'] ?? '', 
    createdAt: formatDate(item.createdAt) ?? formatDate(item.created_at) ?? '',
  }));
}
  const formatted=formatCredentials(creds)

    return res.json({
      success: true,
     totalRecords: formatted.length,
      
      data: formatted
    });
  } catch (err) {
    console.error('❌ Error in getCollegeCredsForReport:', err);
    return res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};
