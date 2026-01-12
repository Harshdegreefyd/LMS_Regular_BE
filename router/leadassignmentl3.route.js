import express from 'express';
import {
  getRuleSets,
  createRuleSet,
  deleteRuleSet,
  updateRuleSet,
  toggleRuleSetStatus,
  getRuleSetById,
  assignedtoL3byruleSet
} from '../controllers/leadassignmentl3.controller.js';

const router = express.Router();

router.get('/', getRuleSets);
router.post('/assign', assignedtoL3byruleSet);
router.get('/:id', getRuleSetById);
router.post('/', createRuleSet);
router.delete('/:id', deleteRuleSet);
router.put('/:id', updateRuleSet);
router.patch('/:id/toggle', toggleRuleSetStatus);

export default router;
