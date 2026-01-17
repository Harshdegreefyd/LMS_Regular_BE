import express from 'express';
import { authorize } from '../middlewares/authMiddleware.js';
import { getCollegeStatus, getShortlistedColleges, updateStudentCourseStatus, getTrackReport, getTrackerReport2, downloadRecordsForView, getThreeRecordsOfFormFilled, getRecordsForAnalysis, getRecordsForAnalysishelper, downloadRecordsForAnalysis, getLeadStatusApiReport, getLeadAttemptTimeReport, getTrackerReport2RawData, getLeadAttemptTimeReportRawData, getThreeRecordsOfFormFilledDownload, getTrackerReportAnalysis3, getNotInterestedAfterCounselingReport, bulkInsertCourseStatus } from '../controllers/studentcoursestatus.controller.js';
import { getniReports } from '../controllers/student.controller.js';
const router = express.Router();


router.post('/update', updateStudentCourseStatus);
router.get('/shortlisted/:studentId/full', authorize(["l2", "l3", "Supervisor", 'to']), getShortlistedColleges);
router.get('/download', downloadRecordsForAnalysis);
router.get('/download-shorilist', downloadRecordsForView);
router.get('/getrecords/form-filled', authorize(["Supervisor", 'to', 'analyser']), getThreeRecordsOfFormFilled);
router.get('/getRecordsForAnalysis', getRecordsForAnalysishelper)
router.get('/getrecords/form-filled/download', authorize(["Supervisor", 'to', 'analyser']), getThreeRecordsOfFormFilledDownload);
router.get('/:courseId/:studentId', authorize(["l2", "l3", "Supervisor", 'to']), getCollegeStatus);
router.get('/getRecordsForAnalysis/:type', authorize(["l2", "l3", "Supervisor", 'to']), getRecordsForAnalysis);
router.get('/lead-status-report', getLeadStatusApiReport);
router.get('/track-report', getTrackReport);
router.get('/track-report-2', authorize(["l2", "l3", "Supervisor", 'to', 'analyser']), getTrackerReport2);
router.get('/track-report-2-raw', getTrackerReport2RawData);
router.get('/report3', getTrackerReportAnalysis3);
router.get('/not-interested-after-counseling', getNotInterestedAfterCounselingReport);
router.get('/lead-attempt-report', authorize(["l2", "l3", "Supervisor", 'to', 'analyser']), getLeadAttemptTimeReport);
router.get('/lead-attempt-report-raw', getLeadAttemptTimeReportRawData);
router.get('/getnireports', getniReports)
router.post('/bulkcreate', bulkInsertCourseStatus)

export default router;
