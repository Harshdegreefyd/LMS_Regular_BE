import express from 'express';
import { authorize } from '../middlewares/authMiddleware.js';
import { getWeeklyLeaderboard } from '../controllers/scoreboard.controller.js';

const router = express.Router();

router.get('/weekly', authorize(["Supervisor"]), getWeeklyLeaderboard);
export default router;
