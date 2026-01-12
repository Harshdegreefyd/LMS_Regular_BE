import express from 'express';
import {
  registerSupervisor,
  loginSupervisor,
  changePassword,
  logoutSupervisor,
  getUserDetails
} from '../controllers/supervisor.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/register', registerSupervisor);
router.post('/login', loginSupervisor);
router.put('/change-password/:userId', changePassword);
router.post('/logout', authorize(["Supervisor"]), logoutSupervisor);
router.get('/getUserDetails', authorize(["Supervisor"]), getUserDetails);

export default router;
