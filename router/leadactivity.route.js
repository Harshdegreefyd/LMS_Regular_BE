import express from 'express';
import { authorize } from '../middlewares/authMiddleware.js';
import { bulkInsertStudentLeadActivities, getActivityByStudentId } from '../controllers/leadactivity.controller.js';
const router = express.Router();

router.get('/:studentId', getActivityByStudentId)
router.post('/bulk', bulkInsertStudentLeadActivities)

export default router;
