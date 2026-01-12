import express from 'express';

import { authorize } from '../middlewares/authMiddleware.js';
import { getRemarkByStudentId, getAllRemarksofData, getAnalysisReportSQL, downloadAnalysisReport, getConnectedCallsAnalysis, bulkCreateStudentRemarks } from '../controllers/remark.controller.js';


const router = express.Router();
router.get('/getallRemarksToExcel', getAllRemarksofData);
router.get('/getAnalysisReport', authorize(['supervisor', 'Supervisor', 'to', "analyser"]), getAnalysisReportSQL);
router.get('/downloadAnalysisReport', downloadAnalysisReport);
router.get('/connected-calls', authorize(['supervisor', 'Supervisor', 'to', "analyser"]), getConnectedCallsAnalysis);

router.get('/:studentId', getRemarkByStudentId)
router.post('/bulkCreateStudentRemarks', bulkCreateStudentRemarks)

export default router;
