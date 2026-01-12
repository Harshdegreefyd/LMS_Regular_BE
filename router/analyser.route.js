import express from 'express';
import {
  getAllAnalysers,
  createAnalyser,
  updateAnalyser,
  deleteAnalyser,
  forceLogout,
  loginAnalyser,
  changeAnalyserPassword,
  getUserDetails
} from '../controllers/analyser.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/login', loginAnalyser);

router.get('/', authorize(['supervisor', 'Supervisor']), getAllAnalysers);
router.post('/', authorize(['supervisor', 'Supervisor']), createAnalyser);
router.put('/:id', authorize(['supervisor', 'Supervisor']), updateAnalyser);
router.delete('/:id', authorize(['supervisor']), deleteAnalyser);
router.post('/:id/force-logout', authorize(['supervisor', 'Supervisor']), forceLogout);

router.put('/:id/change-password',authorize(['supervisor', 'Supervisor']), changeAnalyserPassword);
router.get('/getUserDetails', authorize(['Analyser', 'Admin', 'Supervisor']), getUserDetails);

export default router;