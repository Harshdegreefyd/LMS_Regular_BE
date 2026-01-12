import express from 'express';
import {
  getAllUniversities,
  getUniversityCourseMappings,
  getCourseHeaderValues,
  saveCourseHeaderValues,
  deleteCourseHeaderValues,
  deleteUniversityAllCourses,
  bulkUploadCourseHeaderValues,
  updateSpecificField,
  updateCampusToLucknow,
} from '../controllers/universityheadervalues.controller.js';
import { authorize } from '../middlewares/authMiddleware.js';

const   router = express.Router();

// GET all universities (distinct)
router.get('/universities/list', getAllUniversities);

// GET all course mappings for a university
router.get('/university/:universityName/courses', getUniversityCourseMappings);

// GET header values for a specific course
router.get('/:courseId', getCourseHeaderValues);

// CREATE or UPDATE header values for a course
router.post('/', saveCourseHeaderValues);

// DELETE header values for a course
router.delete('/:courseId', deleteCourseHeaderValues);

// DELETE all courses for a university
router.delete('/university/:universityName/all', deleteUniversityAllCourses);

// BULK UPLOAD header values
router.post('/bulkUpload', bulkUploadCourseHeaderValues);

// UPDATE specific field for a university
router.put('/updateField', updateSpecificField);

// Update example (backward compatibility)
router.put('/updateCampus', updateCampusToLucknow);

export default router;
