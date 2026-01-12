import express from 'express';
import {
  registerCounsellor,
  loginCounsellor,
  changePassword,
  logoutCounsellor,
  getUserDetails,
  getAllCounsellors,
  deleteCounsellor,
  updateCounsellorStatus,
  changeCounsellorPassword,
  updateCounsellorPreferredMode,
  getCounsellorById, assignCounsellorsToStudents,
  makeCounsellorLogout, start_Counsellors_break, end_Counsellors_break, activeBreak, getCounsellor_break_stats,
  changeSupervisor
} from '../controllers/counsellor.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();
router.get('/getAllCounsellors', authorize(['to', "Supervisor"]), getAllCounsellors);
router.get('/getUserDetails', authorize(["l2", "l3", 'to']), getUserDetails);
router.get('/logoutCounsellor/:counsellor_id', authorize(["Supervisor"]), makeCounsellorLogout);
router.get('/getcounsellorByID/:counsellorId', getCounsellorById);
router.get('/get-latest-break/:counsellor_id', activeBreak);
router.get('/daily-counsellor-break-activities', authorize(['to', 'Supervisor']), getCounsellor_break_stats)
router.post('/register', registerCounsellor);
router.post('/login', loginCounsellor);
router.put('/change-password/:id', authorize(["Supervisor","to"]), changePassword);
router.post('/logout', authorize(["l2", "l3", "to"]), logoutCounsellor);
router.post('/break/start', start_Counsellors_break);
// -------------For Counsellor-------------------
// router.delete('/deleteCounsellor/:id', authorize(["Supervisor"]),activityLogger, deleteCounsellor);
router.put('/updateCounsellorStatus/:id', authorize(["Supervisor","to"]), updateCounsellorStatus);
router.put('/changeCounsellorPassword/:id', authorize(["Supervisor","to"]), changeCounsellorPassword);
router.put('/updateCounsellorPreferredMode/:id', authorize(["Supervisor","to"]), updateCounsellorPreferredMode);
router.put('/assignCounsellors', authorize(["Supervisor", "to"]), assignCounsellorsToStudents);
router.put('/break/end', end_Counsellors_break)
router.put('/change-supervisor', changeSupervisor);

export default router;
