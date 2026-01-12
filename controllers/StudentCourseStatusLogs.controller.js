import axios from 'axios';
import {UniversityCourse,CourseStatusHistory,CourseStatus, Student} from '../models/index.js';
import { assignedtoL3byruleSet } from './leadassignmentl3.controller.js';

export const createStatusLog = async (req, res) => {
  try {
    const {
      studentId,
      status,
      collegeName,
      courseName,
      notes,
      examInterviewDate,
      lastAdmissionDate,
      depositAmount = 0,
    } = req.body;
      const { courseId } = req.params;
    const userId = req.user?.counsellorId || req.user?.supervisorId || null;

    const courseDetails = await UniversityCourse.findOne({
      where: { course_id: courseId }
    });

    if (!courseDetails) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const log = await CourseStatusHistory.create({
      student_id: studentId,
      course_id: courseId,
      counsellor_id: userId,
      course_status: status,
      deposit_amount: depositAmount,
      currency: 'INR',
      exam_interview_date: examInterviewDate ? new Date(examInterviewDate) : null,
      last_admission_date: lastAdmissionDate ? new Date(lastAdmissionDate) : null,
      notes: notes,
      timestamp: new Date()
    });
     if (status == "Form Submitted – Portal Pending" || status == "Form Submitted – Completed") {
      const l3data=await axios.post('http://localhost:3001/v1/leadassignmentl3/assign',{ 
            studentId, 
            collegeName: courseDetails.university_name, 
            Course: courseDetails.course_name, 
            Degree: courseDetails.degree_name, 
            Specialization: courseDetails.specialization, 
            level: courseDetails.level, 
            source: courseDetails.level, 
            stream: courseDetails.stream 
          }) 
       await Student.update({first_form_filled_date:new Date()},{where:{student_id:studentId,first_form_filled_date:null}})   
  }
   
    
    res.status(201).json({ 
      message: 'Status log created successfully',
      logId: log.status_history_id
    });
    const updated = await CourseStatus.update({ latest_course_status: status }, { where: { course_id: courseId, student_id: studentId } })

  } catch (error) {
    console.error('Error creating status log:', error.message);
    return res.status(500).json({
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};