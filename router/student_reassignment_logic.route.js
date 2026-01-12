import express from 'express';
import {
  getStudentReassignmentLogic,
  createOrUpdateStudentReassignmentLogic,
  toggleRuleStatus,
  deleteStudentReassignmentLogic
} from '../controllers/student_reassignment_logic.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authorize(["Supervisor"]), getStudentReassignmentLogic);
router.post('/', authorize(["Supervisor"]), createOrUpdateStudentReassignmentLogic);
router.patch('/toggle-status', authorize(["Supervisor"]), toggleRuleStatus);
router.delete('/', authorize(["Supervisor"]), deleteStudentReassignmentLogic);

export default router;