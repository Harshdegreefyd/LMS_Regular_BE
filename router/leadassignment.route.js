import express from 'express';
import { createLeadAssignmentforL2, deleteLeadAssignmentforL2, getAllLeadAssignmentforL2, getLeadAssignmentforL2ById, toggleLeadAssignmentforL2Status, updateLeadAssignmentforL2 } from "../controllers/leadassignmentl2.controller.js"
const router = express.Router();


router.post('/', createLeadAssignmentforL2);

router.get('/', getAllLeadAssignmentforL2);

router.get('/:id', getLeadAssignmentforL2ById);

router.put('/:id', updateLeadAssignmentforL2);

router.delete('/:id', deleteLeadAssignmentforL2);

router.patch('/:id/toggle', toggleLeadAssignmentforL2Status);

export default router;
