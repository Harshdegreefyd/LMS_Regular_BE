import express from 'express';
import { createTemplates, deleteTemplate, getAllTemplates, getTemplateById, updateTemplate } from '../controllers/template.controller.js';

const router = express.Router();

router.post('/', createTemplates);
router.get('/', getAllTemplates);
router.get('/:id', getTemplateById);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

export default router;
