import express from 'express';
import {
  getUniversityHeaders,
  saveUniversityHeaders,
  deleteUniversityHeaders
} from '../controllers/universityheader.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get headers for a university
router.get('/:universityName',authorize(["Supervisor"]), getUniversityHeaders);

// Create or update headers for a university
router.post('/',authorize(["Supervisor"]), saveUniversityHeaders);

// Delete headers for a university
router.delete('/:universityName',authorize(["Supervisor"]), deleteUniversityHeaders);

export default router;
