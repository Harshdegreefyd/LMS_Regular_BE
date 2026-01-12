import { downloadCollegeApiStatus, getCollegeApiStatusForReport } from "../controllers/collegeApiSentStatus.controller.js";
import express from 'express';
const router = express.Router();

router.get('/getCollegeApiResponseForReport', getCollegeApiStatusForReport);
router.get('/downloadCollegeApiResponseForReport', downloadCollegeApiStatus);
export default router;