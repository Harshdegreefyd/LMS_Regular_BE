import express from 'express';
import { authorize } from '../middlewares/authMiddleware.js';
import { getActivityByStudentId } from '../controllers/leadactivity.controller.js';
const router = express.Router();

router.get('/:studentId', getActivityByStudentId)

export default router;
