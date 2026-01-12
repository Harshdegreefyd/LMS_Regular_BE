import express from 'express';
import { authorize } from '../middlewares/authMiddleware.js';
import { createStudent, updateStudentStatus, findByContact, getStudentById, studentWindowOpenByCounsellor, updateStudentDetails, bulkReassignLeads, bulkCreateLeads, addLeadDirect, getAllLeadsofDatatest, bulkCreateStudents } from "../controllers/student.controller.js"
import { exportStudentsCSV } from '../controllers/exports/leads_csv_export.js'
import { getStudents } from '../controllers/students.table.js'
import { bearerAuth } from '../middlewares/bearerAuthMiddleware.js';
const router = express.Router();
router.get('/', authorize(["l2", "l3", 'supervisor', 'Supervisor', 'to', "analyser"]), getStudents);
router.get('/studentWindowOpenByCounsellor', authorize(["l2", "l3"]), studentWindowOpenByCounsellor);

router.post('/create', createStudent);
router.post('/create-student', bearerAuth, createStudent);

router.get('/export', authorize(['supervisor', 'Supervisor', "analyser"]), exportStudentsCSV);
router.get('/getDataTolooker', getAllLeadsofDatatest);
router.post('/findByContact', findByContact);

router.get('/:id', authorize(["l2", "l3", 'supervisor', 'Supervisor', 'to', "analyser"]), getStudentById);
router.put('/updateStudentStatus/:studentId', authorize(["l2", "l3", "to", 'supervisor', 'Supervisor']), updateStudentStatus);
router.put('/updateStudentDetails/:studentId', updateStudentDetails);
router.post('/bulkReassign', authorize(["Supervisor"]), bulkReassignLeads);
router.post('/bulkCreate', authorize(["Supervisor"]), bulkCreateLeads);
router.post('/addLeadDirect', authorize(["l2", "l3", "to", "Supervisor"]), addLeadDirect);
router.post('/bulk-transfer', bulkCreateStudents);

export default router;