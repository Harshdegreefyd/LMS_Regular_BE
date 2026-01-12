import express from 'express';
import { authorize } from '../middlewares/authMiddleware.js';
import { getCollegeStatus, getShortlistedColleges, updateStudentCourseStatus } from '../controllers/studentcoursestatus.controller.js';
const router = express.Router();


router.post('/update', authorize(["l2", "l3", "Supervisor", 'to']), updateStudentCourseStatus);
router.get('/:courseId/:studentId', authorize(["l2", "l3", "Supervisor", 'to']), getCollegeStatus);
router.get('/shortlisted/:studentId/full', authorize(["l2", "l3", "Supervisor", 'to']), getShortlistedColleges);


export default router;
