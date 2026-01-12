import { Op, Sequelize } from 'sequelize';
import { UniversityCourse, sequelize, CourseStatus } from '../models/index.js';
import UniversitiesAPIHeaderValues from '../models/university_header_values.js';

import fs from 'fs';
import path from 'path';
import { uploadToCloudinary } from '../config/cloudinary.js';

const fieldMapping = {
  universityName: 'university_name',
  state: 'university_state',
  city: 'university_city',
  degreeName: 'degree_name',
  specialization: 'specialization',
  stream: 'stream',
  level: 'level',
  courseName: 'course_name',
  durationType: 'duration_type',
  studyMode: 'study_mode',
  totalFees: 'total_fees',
  semesterFees: 'semester_fees',
  annualFees: 'annual_fees',
  examFee: 'exam_fee',
  duration: 'duration',
  courseId: 'course_id',
  status: 'status',
  mode: 'study_mode',
  semFee: 'semester_fees',
  annualFee: 'annual_fees'
};
export const isApiExist = async (req, res) => {
  try {
    const { university_name, course_name } = req.body;

    if (!university_name || !course_name) {
      return res.status(400).json({
        success: false,
        message: "university_name and course_name are required",
      });
    }

    const course = await UniversityCourse.findOne({
      where: { university_name, course_name, status: "Active" },
      raw: true,
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Active course not found for this university",
      });
    }

    const mapping = await UniversitiesAPIHeaderValues.findOne({
      where: { university_name },
      raw: true,
    });

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: "API mapping not found for this course",
        has_mapping: false,
      });
    }

    return res.status(200).json({
      success: true,
      message: "API exists for the given university and course",
      has_mapping: true,
      data: {
        university_name,
        course_name,
        values: mapping.values,
      },
    });
  } catch (error) {
    console.error("Error checking API existence:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};


export const validatePagination = (req, res, next) => {
  const { page = 1, limit = 100 } = req.query;

  if (isNaN(page) || page < 1) {
    return res.status(400).json({
      success: false,
      error: 'Page must be a positive integer'
    });
  }

  if (isNaN(limit) || limit < 1 || limit > 1000) {
    return res.status(400).json({
      success: false,
      error: 'Limit must be between 1 and 1000'
    });
  }

  next();
};


// Transform course data to camelCase






const transformCourseData = (course) => {
  return {
    courseId: course.course_id,
    courseName: course.course_name,
    universityName: course.university_name,
    state: course.university_state,
    city: course.university_city,
    degreeName: course.degree_name,
    specialization: course.specialization,
    stream: course.stream,
    level: course.level,
    totalFees: course.total_fees,
    semFee: course.semester_fees,
    annualFee: course.annual_fees,
    mode: course.study_mode,
    duration: course.duration,
    durationType: course.duration_type,
    status: course.status,
    created_at: course.created_at,
    updated_at: course.updated_at,
    brochureUrl: course.brochure_url,
    usp: course.usp,
    eligibility: course.eligibility
  };
};

export const getAllCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      universityName,
      courseName,
      degreeName,
      specialization,
      level,
      durationType,
      studyMode,
      status
    } = req.query;

    const where = {};

    // ====== Filters - EXACT DB field names
    if (universityName) {
      const namesArray = universityName.split(',').map(name => name.trim());
      where.university_name = {
        [Op.or]: namesArray.map(name => ({ [Op.iLike]: `%${name}%` }))
      };
    }

    if (courseName) where.course_name = { [Op.iLike]: `%${courseName}%` };
    if (degreeName) where.degree_name = { [Op.iLike]: `%${degreeName}%` };
    if (specialization) where.specialization = { [Op.iLike]: `%${specialization}%` };
    if (level) where.level = { [Op.iLike]: `%${level}%` };
    if (durationType) where.duration_type = { [Op.iLike]: `%${durationType}%` };
    if (studyMode) where.study_mode = { [Op.iLike]: `%${studyMode}%` };

    // ====== Status - SHOW ALL BY DEFAULT (Active + Inactive)
    if (status && status.toLowerCase() !== "all") {
      where.status = status;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // ====== Fetch ALL data in parallel
    const [
      coursesResult,
      activeCount,
      inactiveCount,
      onlineCount,
      offlineCount,
      coursesWithApiMapping,
      totalCoursesCount
    ] = await Promise.all([
      UniversityCourse.findAndCountAll({
        where,
        offset,
        limit: limitNum,
        order: [["created_at", "DESC"]],
      }),

      UniversityCourse.count({ where: { ...where, status: "Active" } }),
      UniversityCourse.count({ where: { ...where, status: "Inactive" } }),

      UniversityCourse.count({
        where: {
          ...where,
          status: "Active",
          study_mode: { [Op.iLike]: "%online%" },
        },
      }),

      UniversityCourse.count({
        where: {
          ...where,
          status: "Active",
          [Op.or]: [
            { study_mode: { [Op.iLike]: "%regular%" } },
            { study_mode: { [Op.notILike]: "%online%" } },
          ],
        },
      }),

      UniversitiesAPIHeaderValues.findAll({
        attributes: ["course_id", "university_name"],
        raw: true,
      }),

      UniversityCourse.count({ where }),
    ]);

    const { count, rows: courses } = coursesResult;

    // ====== Add hasApiMapping flag ONLY
    const apiMappedCombos = new Set();
    coursesWithApiMapping.forEach((m) => {
      const normalizedCombo = `${m.course_id.trim()}|${(m.university_name || "").trim().toLowerCase()}`;
      apiMappedCombos.add(normalizedCombo);
    });

    const coursesWithMappingFlag = courses.map((course) => ({
      ...course.toJSON(), // ✅ EXACT DB fields
      hasApiMapping: apiMappedCombos.has(`${course.course_id.trim()}|${(course.university_name || "").trim().toLowerCase()}`),
    }));

    const totalCoursesCountFinal = count;
    const coursesWithApiMappingCount = new Set(coursesWithApiMapping.map((m) => m.course_id)).size;
    const coursesWithoutApiMappingCount = totalCoursesCountFinal - coursesWithApiMappingCount;

    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      success: true,
      data: coursesWithMappingFlag, // ✅ EXACT DB fields + hasApiMapping
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount: count,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
      statistics: {
        total: totalCoursesCountFinal,        // ALL courses
        active: activeCount,
        inactive: inactiveCount,
        online: onlineCount,
        offline: offlineCount,
        coursesWithApiMapping: coursesWithApiMappingCount,
        coursesWithoutApiMapping: coursesWithoutApiMappingCount,
        apiMappingPercentage: totalCoursesCountFinal > 0
          ? ((coursesWithApiMappingCount / totalCoursesCountFinal) * 100).toFixed(2)
          : 0,
      },
      message: "All courses fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching courses",
      error: error.message,
    });
  }
};









export const getAllCoursesWithFilter = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      universityName,
      courseName,
      degreeName,
      specialization,
      level,
      durationType,
      studyMode,
      status
    } = req.query;

    const where = {};

    // Search by university or course name
    if (universityName) {
      const namesArray = universityName.split(',').map(name => name.trim());
      where.university_name = {
        [Op.or]: namesArray.map(name => ({ [Op.iLike]: `%${name}%` }))
      };
    }

    if (courseName) where.course_name = { [Op.iLike]: `%${courseName}%` };
    if (degreeName) where.degree_name = { [Op.iLike]: `%${degreeName}%` };
    if (specialization) where.specialization = { [Op.iLike]: `%${specialization}%` };
    if (level) where.level = { [Op.iLike]: `%${level}%` };
    if (durationType) where.duration_type = { [Op.iLike]: `%${durationType}%` };
    if (studyMode) where.study_mode = { [Op.iLike]: `%${studyMode}%` };
    if (status) where.status = status;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // Execute all queries in parallel
    const [
      coursesResult,
      totalCount,
      activeCount,
      inactiveCount,
      onlineCount,
      offlineCount
    ] = await Promise.all([
      // Main query with pagination
      UniversityCourse.findAndCountAll({
        where,
        offset,
        limit: limitNum,
        order: [['created_at', 'DESC']]
      }),

      // Total count - ONLY ACTIVE (unless status filter is applied)
      UniversityCourse.count({
        where: status ? where : { ...where, status: 'Active' }
      }),

      // Active count
      UniversityCourse.count({
        where: { ...where, status: 'Active' }
      }),

      // Inactive count
      UniversityCourse.count({
        where: { ...where, status: 'Inactive' }
      }),

      // Online count - ONLY ACTIVE
      UniversityCourse.count({
        where: {
          ...where,
          status: 'Active',
          study_mode: { [Op.iLike]: '%online%' }
        }
      }),

      // Offline count - ONLY ACTIVE
      UniversityCourse.count({
        where: {
          ...where,
          status: 'Active',
          [Op.or]: [
            { study_mode: { [Op.iLike]: '%regular%' } },
            { study_mode: { [Op.notILike]: '%online%' } }
          ]
        }
      })
    ]);

    const { count, rows: courses } = coursesResult;
    const transformedCourses = courses.map(transformCourseData);
    const totalPages = Math.ceil(count / limitNum);

    res.status(200).json({
      success: true,
      data: transformedCourses,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount: count,
        limit: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      },
      statistics: {
        total: totalCount,
        active: activeCount,
        inactive: inactiveCount,
        online: onlineCount,
        offline: offlineCount
      },
      message: 'Courses fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching courses',
      error: error.message
    });
  }
};




// Unified search with advanced filters
export const unifiedSearch = async (req, res) => {
  try {
    const remappedBody = {
      universityName: req.body.universityName || '',
      state: req.body.state || [],
      city: req.body.city || [],
      degreeName: req.body.degreeName || [],
      specialization: req.body.specialization || [],
      stream: req.body.stream || [],
      level: req.body.level || [],
      studyMode: req.body.mode || req.body.studyMode || '',
      totalFees: req.body.preferredBudget
        ? { max: req.body.preferredBudget }
        : req.body.totalFees || {},
      duration: req.body.duration || {},
      semesterFees: req.body.semesterFees || {},
      partialSearch: req.body.partialSearch || {},
      page: req.body.page || 1,
      limit: req.body.limit || 100,
      studentId: req.body.student_id || req.body.studentId
    };

    const {
      totalFees = {},
      duration = {},
      semesterFees = {},
      partialSearch = {},
      page = 1,
      limit = 100,
      studentId,
      ...searchFields
    } = remappedBody;

    const where = { status: 'Active' };

    const exactMatchFields = [
      'universityName',
      'state',
      'city',
      'degreeName',
      'specialization',
      'stream',
      'level',
      'courseName',
      'durationType',
      'studyMode'
    ];

    // Exact match filters
    exactMatchFields.forEach(field => {
      const dbField = fieldMapping[field];
      const value = searchFields[field];

      if (Array.isArray(value) && value.length > 0 && value[0] !== '') {
        where[dbField] = {
          [Op.or]: value.map(val => ({ [Op.iLike]: val }))
        };
      } else if (typeof value === 'string' && value.trim() !== '') {
        where[dbField] = { [Op.iLike]: value.trim() };
      }
    });

    // Range filters
    if (totalFees.min !== undefined || totalFees.max !== undefined) {
      where[fieldMapping.totalFees] = {};
      if (totalFees.min !== undefined) {
        where[fieldMapping.totalFees][Op.gte] = totalFees.min;
      }
      if (totalFees.max !== undefined) {
        where[fieldMapping.totalFees][Op.lte] = totalFees.max;
      }
    }

    if (duration.min !== undefined || duration.max !== undefined) {
      where[fieldMapping.duration] = {};
      if (duration.min !== undefined) {
        where[fieldMapping.duration][Op.gte] = duration.min;
      }
      if (duration.max !== undefined) {
        where[fieldMapping.duration][Op.lte] = duration.max;
      }
    }

    if (semesterFees.min !== undefined || semesterFees.max !== undefined) {
      where[fieldMapping.semesterFees] = {};
      if (semesterFees.min !== undefined) {
        where[fieldMapping.semesterFees][Op.gte] = semesterFees.min;
      }
      if (semesterFees.max !== undefined) {
        where[fieldMapping.semesterFees][Op.lte] = semesterFees.max;
      }
    }

    // Partial search (LIKE queries)
    const partialConditions = [];
    Object.keys(partialSearch).forEach(key => {
      const dbField = fieldMapping[key] || key;
      const terms = partialSearch[key];

      if (Array.isArray(terms)) {
        const orConditions = terms
          .filter(term => !!term)
          .map(term => ({
            [dbField]: { [Op.iLike]: `%${term}%` }
          }));
        if (orConditions.length) partialConditions.push({ [Op.or]: orConditions });
      } else if (typeof terms === 'string' && terms.trim() !== '') {
        partialConditions.push({
          [dbField]: { [Op.iLike]: `%${terms.trim()}%` }
        });
      }
    });

    if (partialConditions.length > 0) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push(...partialConditions);
    }

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const limitVal = parseInt(limit);

    // Build query with optional CourseStatus join
    const queryOptions = {
      where,
      offset,
      limit: limitVal,
      subQuery: false,
      attributes: [
        'university_name',
        'university_state',
        'university_city',
        'degree_name',
        'specialization',
        'stream',
        'level',
        'course_name',
        'duration_type',
        'duration',
        'total_fees',
        'semester_fees',
        'annual_fees',
        'study_mode',
        'course_id',
        'status',
        'brochure_url',
        'usp',
        'eligibility'
      ],
      order: [['created_at', 'DESC']]
    };

    // Add CourseStatus join if studentId provided
    if (studentId && CourseStatus) {
      queryOptions.include = [{
        model: CourseStatus,
        as: 'latest_course_statuses',
        where: { student_id: studentId },
        required: false
      }];
    }

    const { count, rows: courses } = await UniversityCourse.findAndCountAll(queryOptions);

    const transformedCourses = courses.map(transformCourseData);

    return res.status(200).json({
      success: true,
      message: 'Courses retrieved successfully',
      totalCount: count,
      currentPage: parseInt(page),
      pageSize: parseInt(limit),
      count: courses.length,
      courses: transformedCourses
    });
  } catch (error) {
    console.error('Error in unified search:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error searching courses',
      error: error.message
    });
  }
};

// Get all dropdown/filter data
export const getDropdownData = async (req, res) => {
  try {
    const [
      universities,
      streams,
      degrees,
      specializations,
      levels,
      cities,
      states,
      studyModes,
      courses,
      durationTypes
    ] = await Promise.all([
      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('university_name')), 'university_name']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.university_name).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('stream')), 'stream']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.stream).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('degree_name')), 'degree_name']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.degree_name).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('specialization')), 'specialization']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.specialization).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('level')), 'level']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.level).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('university_city')), 'university_city']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.university_city).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('university_state')), 'university_state']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.university_state).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('study_mode')), 'study_mode']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.study_mode).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('course_name')), 'course_name']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.course_name).filter(Boolean)),

      UniversityCourse.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('duration_type')), 'duration_type']],
        where: { status: 'Active' },
        raw: true
      }).then(results => results.map(r => r.duration_type).filter(Boolean))
    ]);

    return res.status(200).json({
      success: true,
      data: {
        universities: universities.sort(),
        streams: streams.sort(),
        degrees: degrees.sort(),
        specializations: specializations.sort(),
        levels: levels.sort(),
        cities: cities.sort(),
        states: states.sort(),
        studyModes: studyModes.sort(),
        courses: courses.sort(),
        durationTypes: durationTypes.sort()
      }
    });
  } catch (error) {
    console.error('Error fetching dropdown data:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// Alias for getDropdownData
export const getFilterOptions = getDropdownData;


export const getCascadingFilterOptions = async (req, res) => {
  try {
    const {
      studyMode,
      universityName,
      level,
      degreeName,
      specialization,
      stream,
      status
    } = req.query;

    const filters = {};

    if (!status || status.toLowerCase() !== "all") {
      filters.status = "Active";
    }

    if (studyMode) filters.study_mode = studyMode;
    if (universityName) filters.university_name = universityName;
    if (level) filters.level = level;
    if (degreeName) filters.degree_name = degreeName;
    if (specialization) filters.specialization = specialization;
    if (stream) filters.stream = stream;

    const studyModesPromise = UniversityCourse.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("study_mode")), "study_mode"]],
      where: { status: "Active" },
      raw: true,
    }).then(results => results.map(r => r.study_mode).filter(Boolean));

    const universitiesPromise = UniversityCourse.findAll({
      attributes: ["university_name"],
      where: { ...(studyMode ? { study_mode: studyMode } : {}), status: "Active" },
      group: ["university_name"],
      raw: true,
    })
      .then(results => results.map(r => r.university_name).filter(Boolean));

    const levelsPromise = UniversityCourse.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("level")), "level"]],
      where: filters,
      raw: true,
    }).then(results => results.map(r => r.level).filter(Boolean));

    const degreesPromise = UniversityCourse.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("degree_name")), "degree_name"]],
      where: filters,
      raw: true,
    }).then(results => results.map(r => r.degree_name).filter(Boolean));

    const specializationsPromise = UniversityCourse.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("specialization")), "specialization"]],
      where: filters,
      raw: true,
    }).then(results => results.map(r => r.specialization).filter(Boolean));

    const streamsPromise = UniversityCourse.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("stream")), "stream"]],
      where: filters,
      raw: true,
    }).then(results => results.map(r => r.stream).filter(Boolean));

    const coursesPromise = UniversityCourse.findAll({
      attributes: [[Sequelize.fn("DISTINCT", Sequelize.col("course_name")), "course_name"]],
      where: filters,
      raw: true,
    }).then(results => results.map(r => r.course_name).filter(Boolean));

    const [studyModes, universities, levels, degrees, specializations, streams, courses] =
      await Promise.all([
        studyModesPromise,
        universitiesPromise,
        levelsPromise,
        degreesPromise,
        specializationsPromise,
        streamsPromise,
        coursesPromise,
      ]);

    res.status(200).json({
      success: true,
      data: {
        studyModes: studyModes.sort(),
        universities: universities.sort(),
        levels: levels.sort(),
        degrees: degrees.sort(),
        specializations: specializations.sort(),
        streams: streams.sort(),
        courses: courses.sort(),
      },
    });
  } catch (error) {
    console.error("Error fetching cascading filter options:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching cascading filter options",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};


// Bulk insert courses
export const insertBulkCourses = async (req, res) => {
  try {
    const courses = req.body;
    console.log(courses)
    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Request body must be a non-empty array."
      });
    }

    // Transform camelCase to snake_case
    const transformedCourses = courses.map(course => {
      const transformed = {};
      Object.keys(course).forEach(key => {
        const dbField = fieldMapping[key] || key;
        transformed[dbField] = course[key];
      });
      // Ensure status is set
      if (!transformed.status) {
        transformed.status = 'Active';
      }
      return transformed;
    });

    const insertedCourses = await UniversityCourse.bulkCreate(transformedCourses, {
      returning: true,
      updateOnDuplicate: ['university_name', 'degree_name', 'specialization', 'stream', 'level',
        'course_name', 'total_fees', 'semester_fees', 'annual_fees',
        'registration_fee', 'exam_fee', 'alumni_fee', 'study_mode',
        'duration', 'duration_type', 'status', 'updated_at']
    });

    const responseData = insertedCourses.map(transformCourseData);

    return res.status(201).json({
      success: true,
      message: `${insertedCourses.length} courses inserted successfully.`,
      data: responseData
    });

  } catch (error) {
    console.error("Bulk insert error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message
    });
  }
};

// Import courses from JSON file
export const importCoursesFromJSON = async (req, res) => {
  try {
    const filePath = path.join(process.cwd(), 'data', 'LMS-PROD.university_courses.json');

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'JSON file not found at expected location'
      });
    }

    const courses = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    const formattedCourses = courses.map(course => ({
      university_name: course.universityName || course.university_name || '',
      university_state: course.state || course.university_state || '',
      university_city: course.city || course.university_city || '',
      degree_name: course.degreeName || course.degree_name || '',
      specialization: course.specialization || '',
      study_mode: course.studyMode || course.study_mode || '',
      stream: course.stream || '',
      level: course.level || '',
      course_name: course.courseName || course.course_name || '',
      duration_type: course.durationType || course.duration_type || '',
      duration: course.duration || '',
      semester_fees: Number(course.semesterFees || course.semFee || course.semester_fees) || 0,
      annual_fees: Number(course.annualFees || course.annualFee || course.annual_fees) || 0,
      total_fees: Number(course.totalFees || course.total_fees) || 0,
      registration_fee: Number(course.registrationFee || course.registration_fee) || 0,
      exam_fee: Number(course.examFee || course.exam_fee) || 0,
      alumni_fee: Number(course.alumniFee || course.alumni_fee) || 0,
      status: 'Active'
    }));

    console.log(`Preparing to import ${formattedCourses.length} courses`);

    const insertedCourses = await UniversityCourse.bulkCreate(formattedCourses, {
      returning: true,
      updateOnDuplicate: ['university_name', 'degree_name', 'specialization', 'stream', 'level',
        'course_name', 'total_fees', 'semester_fees', 'annual_fees',
        'registration_fee', 'exam_fee', 'alumni_fee', 'study_mode',
        'duration', 'duration_type', 'status', 'updated_at']
    });

    res.status(201).json({
      success: true,
      message: 'Courses imported successfully',
      inserted: insertedCourses.length,
      total: formattedCourses.length,
    });

  } catch (err) {
    console.error('❌ Error importing courses:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};
// Toggle course status between Active and Inactive
export const toggleCourseStatus = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find the course
    const course = await UniversityCourse.findByPk(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Toggle status
    const newStatus = course.status === 'Active' ? 'Inactive' : 'Active';

    // Update the course
    await course.update({ status: newStatus });

    // Reload to get updated data
    await course.reload();

    return res.status(200).json({
      success: true,
      message: `Course status toggled to ${newStatus}`,
      data: transformCourseData(course)
    });

  } catch (error) {
    console.error('Error toggling course status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error toggling course status',
      error: error.message
    });
  }
};

// Set specific status (Active or Inactive)
export const updateCourseStatus = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status } = req.body;

    // Validate status
    if (!status || !['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "Active" or "Inactive"'
      });
    }

    // Find the course
    const course = await UniversityCourse.findByPk(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Update status
    await course.update({ status });

    // Reload to get updated data
    await course.reload();

    return res.status(200).json({
      success: true,
      message: `Course status updated to ${status}`,
      data: transformCourseData(course)
    });

  } catch (error) {
    console.error('Error updating course status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating course status',
      error: error.message
    });
  }
};

// Bulk toggle status for multiple courses
export const bulkToggleStatus = async (req, res) => {
  try {
    const { courseIds } = req.body;

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'courseIds must be a non-empty array'
      });
    }

    // Find all courses
    const courses = await UniversityCourse.findAll({
      where: {
        course_id: {
          [Op.in]: courseIds
        }
      }
    });

    if (courses.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No courses found'
      });
    }

    // Toggle each course using Sequelize.literal for atomic operation
    const updatePromises = courses.map(course => {
      const newStatus = course.status === 'Active' ? 'Inactive' : 'Active';
      return course.update({ status: newStatus });
    });

    await Promise.all(updatePromises);

    // Reload all courses
    const updatedCourses = await UniversityCourse.findAll({
      where: {
        course_id: {
          [Op.in]: courseIds
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: `${updatedCourses.length} courses status toggled`,
      data: updatedCourses.map(transformCourseData)
    });

  } catch (error) {
    console.error('Error bulk toggling status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error bulk toggling status',
      error: error.message
    });
  }
};

// Bulk set status for multiple courses
export const bulkUpdateStatus = async (req, res) => {
  try {
    const { courseIds, status } = req.body;

    if (!Array.isArray(courseIds) || courseIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'courseIds must be a non-empty array'
      });
    }

    if (!status || !['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "Active" or "Inactive"'
      });
    }

    // Bulk update
    const [updatedCount] = await UniversityCourse.update(
      { status },
      {
        where: {
          course_id: {
            [Op.in]: courseIds
          }
        }
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No courses found to update'
      });
    }

    // Fetch updated courses
    const updatedCourses = await UniversityCourse.findAll({
      where: {
        course_id: {
          [Op.in]: courseIds
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: `${updatedCount} courses status updated to ${status}`,
      data: updatedCourses.map(transformCourseData)
    });

  } catch (error) {
    console.error('Error bulk updating status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error bulk updating status',
      error: error.message
    });
  }
};
// Add to universitycourse.controller.js
export const updateCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const updates = req.body;

    // Transform camelCase to snake_case
    const transformedUpdates = {};
    Object.keys(updates).forEach(key => {
      const dbField = fieldMapping[key] || key;
      transformedUpdates[dbField] = updates[key];
    });

    const course = await UniversityCourse.findByPk(courseId);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    await course.update(transformedUpdates);
    await course.reload();

    return res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: transformCourseData(course)
    });

  } catch (error) {
    console.error('Error updating course:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating course',
      error: error.message
    });
  }
};

export const disableCourses = async (req, res) => {
  try {
    const { courseId, universityName } = req.params;

    if (!universityName) {
      return res.status(400).json({
        success: false,
        message: "University name is required",
      });
    }

    let condition = { university_name: universityName };

    // If courseId is provided, disable only that course
    if (courseId && courseId !== "all") {
      condition = { ...condition, course_id: courseId };
    }

    // Fetch the first matching course to know current status
    const firstCourse = await UniversityCourse.findOne({ where: condition });

    if (!firstCourse) {
      return res.status(404).json({
        success: false,
        message: "No matching course(s) found",
      });
    }

    // Toggle logic: Active → Inactive, Inactive → Active
    const newStatus = firstCourse.status === "Active" ? "Inactive" : "Active";

    // Update all matching courses
    const [updatedCount] = await UniversityCourse.update(
      { status: newStatus },
      { where: condition }
    );

    return res.status(200).json({
      success: true,
      message:
        courseId && courseId !== "all"
          ? `Course ${courseId} status changed to ${newStatus}`
          : `All courses for ${universityName} changed to ${newStatus}`,
      updatedCount,
      newStatus,
    });
  } catch (error) {
    console.error("Error disabling/toggling course(s):", error);
    return res.status(500).json({
      success: false,
      message: "Server error while toggling course(s)",
      error: error.message,
    });
  }
};
export const updateUniversal = async (req, res) => {
  try {
    const { universityName, courseId } = req.params;
    const { usp, eligibility } = req.body;
    const brochureFile = req.file;

    // ✅ Validate params
    if (!universityName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "University name is required",
      });
    }

    if (!courseId?.trim()) {
      return res.status(400).json({
        success: false,
        message: "courseId is required (use 'all' to update all courses)",
      });
    }

    const decodedUniversityName = decodeURIComponent(universityName);

    // ✅ Determine scope
    const isUpdatingAllCourses = courseId === "all";

    // ✅ Build condition
    const condition = isUpdatingAllCourses
      ? { university_name: decodedUniversityName }
      : {
        university_name: decodedUniversityName,
        course_id: courseId,
      };

    // ✅ Check existence
    const coursesCount = await UniversityCourse.count({ where: condition });

    if (coursesCount === 0) {
      return res.status(404).json({
        success: false,
        message: isUpdatingAllCourses
          ? `No courses found for ${decodedUniversityName}`
          : `Course ${courseId} not found for ${decodedUniversityName}`,
      });
    }

    const updateData = {};
    let uploadedBrochureUrl = null;

    // ✅ Brochure upload
    if (brochureFile) {
      const timestamp = Date.now();
      const originalName = brochureFile.originalname.replace(/\.[^/.]+$/, "");
      const fileName = `brochure_${originalName}_${timestamp}`;

      uploadedBrochureUrl = await uploadToCloudinary(
        brochureFile.buffer,
        fileName
      );

      updateData.brochure_url = uploadedBrochureUrl;
    }

    // ✅ USP
    if (usp) {
      const parsedUsp =
        typeof usp === "string"
          ? (() => {
            try {
              const v = JSON.parse(usp);
              return Array.isArray(v) ? v : [usp];
            } catch {
              return [usp];
            }
          })()
          : usp;

      updateData.usp = parsedUsp.filter(Boolean);
    }

    // ✅ Eligibility
    if (eligibility) {
      const parsedEligibility =
        typeof eligibility === "string"
          ? (() => {
            try {
              const v = JSON.parse(eligibility);
              return Array.isArray(v) ? v : [eligibility];
            } catch {
              return [eligibility];
            }
          })()
          : eligibility;

      updateData.eligibility = parsedEligibility.filter(Boolean);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid update data provided",
      });
    }

    const [updatedCount] = await UniversityCourse.update(updateData, {
      where: condition,
    });

    return res.status(200).json({
      success: true,
      message: isUpdatingAllCourses
        ? `Updated ${updatedCount} course(s) successfully`
        : `Course ${courseId} updated successfully`,
      updatedCount,
      brochureUrl: uploadedBrochureUrl,
      updates: updateData,
    });
  } catch (error) {
    console.error("updateUniversal error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating courses",
      error: error.message,
    });
  }
};



export const getByCourseandUniversity = async (req, res) => {
  try {
    const { university_name, course_name } = req.body;

    if (!university_name || !course_name) {
      return res.status(400).json({
        success: false,
        message: "Please provide both university_name and course_name",
      });
    }

    // 🔹 Sequelize uses `where` instead of direct object filters
    const course = await UniversityCourse.findOne({
      where: {
        university_name: university_name,
        course_name: course_name,
      },
    });

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "No course found for this university",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Course details fetched successfully",
      data: course,
    });
  } catch (error) {
    console.error("Error in getByCourseandUniversity:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};




const toNull = (val) => {
  if (
    val === undefined ||
    val === null ||
    val === '' ||
    val === 'NULL' ||
    val === 'null'
  ) return null;
  return val;
};

const toNumberOrNull = (val) => {
  if (
    val === undefined ||
    val === null ||
    val === '' ||
    val === 'NULL' ||
    val === 'null'
  ) return null;

  const num = Number(val);
  return isNaN(num) ? null : num;
};

const sanitizeCourses = (courses) => {
  return courses.map(course => ({
    ...course,

    // 🔗 URL
    brochure_url:
      course.brochure_url &&
      /^https?:\/\/.+/i.test(course.brochure_url)
        ? course.brochure_url
        : null,

    // 📦 ARRAYS
    usp: Array.isArray(course.usp)
      ? course.usp
      : course.usp
        ? [String(course.usp)]
        : [],

    eligibility: Array.isArray(course.eligibility)
      ? course.eligibility
      : course.eligibility
        ? [String(course.eligibility)]
        : [],

    // 🔢 NUMBERS (CRITICAL FIX)
    total_fees: toNumberOrNull(course.total_fees),
    semester_fees: toNumberOrNull(course.semester_fees),
    annual_fees: toNumberOrNull(course.annual_fees),
    duration: toNumberOrNull(course.duration),

    // 🧵 STRINGS (remove "NULL")
    stream: toNull(course.stream),
    level: toNull(course.level),
    study_mode: toNull(course.study_mode),
    specialization: toNull(course.specialization),
  }));
};



export const insertUniversityCourses = async (req, res) => {
  try {
    let courses = req.body;

    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    courses = sanitizeCourses(courses);

    await UniversityCourse.bulkCreate(courses, {
      validate: true,
      ignoreDuplicates: true
    });

    res.status(201).json({
      message: 'Courses inserted successfully',
      count: courses.length
    });

  } catch (error) {
    console.error('Bulk insert error:', error);
    res.status(500).json({
      message: 'Bulk insert failed',
      error: error.message
    });
  }
};



