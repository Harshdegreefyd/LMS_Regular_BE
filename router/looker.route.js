import express from 'express';
import { getAllLeadsofDatatest} from "../controllers/student.controller.js"

const router = express.Router();
router.get('/getDataTolooker', getAllLeadsofDatatest);
export default router;
