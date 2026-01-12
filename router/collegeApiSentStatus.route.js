import { bulkInsertStudentCollegeApiStatus, downloadCollegeApiStatus, getCollegeApiStatusForReport } from "../controllers/collegeApiSentStatus.controller.js";
import express from 'express';
const router = express.Router();

router.get('/getCollegeApiResponseForReport', getCollegeApiStatusForReport);
router.get('/downloadCollegeApiResponseForReport', downloadCollegeApiStatus);
router.post('/bulk', bulkInsertStudentCollegeApiStatus);
export default router;