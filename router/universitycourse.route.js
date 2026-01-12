import express from 'express';
import multer from 'multer';
import {
  getAllCourses,
  getDropdownData,
  insertBulkCourses,
  unifiedSearch,
  getFilterOptions,
  getCascadingFilterOptions,
  importCoursesFromJSON,
  toggleCourseStatus,
  updateCourseStatus,
  updateCourse,
  getAllCoursesWithFilter,
  isApiExist,
  disableCourses,
  getByCourseandUniversity,
  updateUniversal,
  insertUniversityCourses
} from '../controllers/universitycourse.controller.js';

const router = express.Router();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF, DOC, DOCX, and images
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPEG, PNG files are allowed.'));
    }
  }
});

// Core CRUD operations
router.get('/', getAllCourses);
router.get('/getCoursewithFilters', getAllCoursesWithFilter);
router.post('/search', unifiedSearch);
router.post('/insert-courses', insertBulkCourses);
router.post('/api-exist', isApiExist);
router.post('/getByCourseandUniversity', getByCourseandUniversity);

// Filter endpoints
router.get('/dropdown', getDropdownData);
router.get('/filter-data', getFilterOptions);
router.get('/cascading-filters', getCascadingFilterOptions);

// Import from JSON file
router.get('/import-data', importCoursesFromJSON);

// Status management
router.patch('/:courseId/toggle-status', toggleCourseStatus);
router.put("/disable/:universityName/:courseId", disableCourses);

router.put(
  "/updateuniversal/:universityName/:courseId",
  upload.single("brochure"),
  updateUniversal
);


router.post('/bulk-insert', insertUniversityCourses);

router.patch('/:courseId/status', updateCourseStatus);
router.put('/:courseId', updateCourse);

export default router;