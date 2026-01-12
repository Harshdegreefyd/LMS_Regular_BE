// routes/collegeCrmRoutes.js (as ES Module)
import express from 'express';
import { LPUCrm, LPUCrmForLandingPage } from '../../controllers/CollegeCrm/Lpu.js';
import { CuCrm } from '../../controllers/CollegeCrm/CU.js';
import { Common } from '../../controllers/CollegeCrm/Common.js';
import { AmityCrm  } from '../../controllers/CollegeCrm/amity.js';
import { sendLeadToCgcCRM } from '../../controllers/CollegeCrm/cgc.js';

const router = express.Router();

router.post('/lpu', LPUCrm);
router.post('/cu', CuCrm);
router.post('/amity', AmityCrm );
router.post('/common', Common);
router.get('/cgc', sendLeadToCgcCRM);
router.post('/lpu-landingpage', LPUCrmForLandingPage);

export default router;
