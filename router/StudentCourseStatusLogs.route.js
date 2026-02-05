import express from "express";
import { authorize } from "../middlewares/authMiddleware.js";
import {
  createStatusLog,
  getCollegeStatusReports,
} from "../controllers/StudentCourseStatusLogs.controller.js";
import { sentStatustoCollege } from "../controllers/Colleges_sending_logic.js";
const router = express.Router();

router.post("/sentStatustoCollege", sentStatustoCollege);

router.post(
  "/:courseId",
  authorize(["l2", "l3", "Supervisor", "to"]),
  createStatusLog,
);
router.get("/reports", getCollegeStatusReports);
export default router;
