import express from 'express';
import {
    upsertStudentInfo,
    addSecondaryDetails,
    getStudentInfo,
    getStudentSecondaryContactsWithStatus,
    getContactStatusForUniversity
} from "../controllers/studentInfo.controller.js";

const router = express.Router();

router.post('/upsert', upsertStudentInfo);
router.get('/:student_id', getStudentInfo);
router.post('/:student_id/secondary-details', addSecondaryDetails);

router.get('/:student_id/secondary-contacts/with-status', getStudentSecondaryContactsWithStatus);
router.get('/:student_id/contact-status/:university_name', getContactStatusForUniversity);

export default router;