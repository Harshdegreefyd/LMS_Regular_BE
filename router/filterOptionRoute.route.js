import express from 'express';
import { createFilterOptions, getLeadOptions } from '../controllers/filterOption.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authorize(["l2", "l3", 'to', "supervisor", "Supervisor", "analyser"]), getLeadOptions);
router.post('/', createFilterOptions);

export default router;