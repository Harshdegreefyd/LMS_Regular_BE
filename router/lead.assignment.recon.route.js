import express from 'express';
import { createLeadAssignmentforRecon, deleteLeadAssignmentforRecon, getAllLeadAssignmentforRecon, getLeadAssignmentforReconById, toggleLeadAssignmentforReconStatus, updateLeadAssignmentforRecon } from "../controllers/leadassignmentrecon.controller.js"
const router = express.Router();


router.post('/', createLeadAssignmentforRecon);

router.get('/', getAllLeadAssignmentforRecon);

router.get('/:id', getLeadAssignmentforReconById);

router.put('/:id', updateLeadAssignmentforRecon);

router.delete('/:id', deleteLeadAssignmentforRecon);

router.patch('/:id/toggle', toggleLeadAssignmentforReconStatus);

export default router;
