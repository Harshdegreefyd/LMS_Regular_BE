import sequelize from '../config/database-config.js';
import UniversitiesAPIHeaderValues from '../models/university_header_values.js';
import UniversityBrochure from '../models/UniversityBrochure.js';
import UniversityCourse from '../models/UniversityCourse.js';
import { Op } from 'sequelize';


export const getAllUniversities = async (req, res) => {
  try {
    const universities = await UniversityCourse.findAll({
      attributes: [
        [sequelize.fn('DISTINCT', sequelize.col('university_name')), 'university_name'],
      ],
      raw: true,
    });

    const universityNames = universities.map(u => u.university_name);

    const universitiesWithData = await Promise.all(
      universityNames.map(async (uni) => {
        const [
          mappedCourses,
          totalCourses,
          activeCourses,
          inactiveCourses,
          brochureInfo,
        ] = await Promise.all([
          UniversitiesAPIHeaderValues.count({
            where: { university_name: uni },
          }),

          UniversityCourse.count({
            where: { university_name: uni },
          }),

          UniversityCourse.count({
            where: {
              university_name: uni,
              status: 'Active',
            },
          }),

          UniversityCourse.count({
            where: {
              university_name: uni,
              status: 'Inactive',
            },
          }),

          UniversityBrochure.findOne({
            where: { university_name: uni },
            attributes: ['brochure_url'],
            raw: true,
          }),
        ]);

        return {
          university_name: uni,
          mapped_courses_count: mappedCourses,
          total_courses: totalCourses,
          active_courses: activeCourses,
          inactive_courses: inactiveCourses,
          has_brochure: !!brochureInfo, // true if brochure exists
          brochure_url: brochureInfo?.brochure_url || null, // URL if exists
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: universitiesWithData,
    });
  } catch (error) {
    console.error('Error fetching universities:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};



export const getUniversityCourseMappings = async (req, res) => {
  try {
    const { universityName } = req.params;

    if (!universityName) {
      return res.status(400).json({
        success: false,
        message: 'universityName is required',
      });
    }

    // Get mapped courses
    const mappedCourses = await UniversitiesAPIHeaderValues.findAll({
      raw: true,
    });

    // Get ALL courses for this university
    const allCourses = await UniversityCourse.findAll({
      where: {
        university_name: universityName,
      },
      order: [
        ['course_name', 'ASC'],
        ['created_at', 'DESC'],
      ],
      raw: true,
    });

    const coursesWithMappings = allCourses.map(course => {
      const mapping = mappedCourses.find(
        m => m.course_id === course.course_id
      );

      return {
        course_id: course.course_id,
        university_name: course.university_name,
        university_state: course.university_state,
        university_city: course.university_city,
        course_name: course.course_name,
        degree_name: course.degree_name,
        specialization: course.specialization,
        stream: course.stream,
        level: course.level,
        study_mode: course.study_mode,
        duration: course.duration,
        duration_type: course.duration_type,
        status: course.status,
        total_fees: course.total_fees,
        semester_fees: course.semester_fees,
        annual_fees: course.annual_fees,

        brochure_url: course.brochure_url,
        usp: course.usp,
        eligibility: course.eligibility,

        values: mapping?.values || null,
        hasApiMapping: !!mapping,

        created_at: course.created_at,
        updated_at: course.updated_at,
      };
    });

    return res.status(200).json({
      success: true,
      totalCount: coursesWithMappings.length,
      data: coursesWithMappings,
    });
  } catch (error) {
    console.error('Error fetching university courses:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};


export const getCourseHeaderValues = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { university } = req.query;

    if (!courseId || !university) {
      return res.status(400).json({ message: 'Course ID and university name are required' });
    }

    const record = await UniversitiesAPIHeaderValues.findOne({
      where: {
        course_id: courseId,
        university_name: university,
      },
    });

    return res.status(200).json(record?.values || {});
  } catch (error) {
    console.error('Error fetching course header values:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const saveCourseHeaderValues = async (req, res) => {
  try {
    const data = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        message: 'Request body must be a non-empty array of objects'
      });
    }

    const results = [];
    const errors = [];
    const notFoundCourses = [];

    for (const item of data) {
      try {
        const { universityName, course_name, ...values } = item;

        if (!universityName || !course_name) {
          errors.push({
            item,
            error: 'universityName and course_name are required'
          });
          continue;
        }

        const course = await UniversityCourse.findOne({
          where: {
            university_name: universityName,
            course_name: course_name
          }
        });

        if (!course) {
          notFoundCourses.push({
            universityName,
            course_name,
            message: `Course not found. No record inserted in header values.`
          });
          continue;
        }

        const valuesToStore = { ...values };
        delete valuesToStore.universityName;
        delete valuesToStore.course_name;

        Object.keys(valuesToStore).forEach(key => {
          if (valuesToStore[key] === undefined || valuesToStore[key] === null) {
            delete valuesToStore[key];
          }
        });

        const [record, created] = await UniversitiesAPIHeaderValues.upsert({
          course_id: course.course_id,
          university_name: universityName,
          values: valuesToStore,
        });

        results.push({
          success: true,
          course_id: course.course_id,
          university_name: universityName,
          course_name: course_name,
          message: created ? 'Header values created' : 'Header values updated',
          data: record,
        });

      } catch (error) {
        errors.push({
          item,
          error: error.message
        });
      }
    }

    const response = {
      success: errors.length === 0 && notFoundCourses.length === 0,
      message: getResponseMessage(results.length, errors.length, notFoundCourses.length),
      results,
      errors: errors.length > 0 ? errors : undefined,
      notFoundCourses: notFoundCourses.length > 0 ? notFoundCourses : undefined
    };

    let statusCode = 200;
    if (errors.length > 0) {
      statusCode = 207; 
    } else if (notFoundCourses.length > 0 && results.length === 0) {
      statusCode = 404; 
    } else if (notFoundCourses.length > 0) {
      statusCode = 207; 
    }

    return res.status(statusCode).json(response);

  } catch (error) {
    console.error('Error saving course header values:', error);
    return res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
};

function getResponseMessage(successCount, errorCount, notFoundCount) {
  const messages = [];

  if (successCount > 0) {
    messages.push(`${successCount} record(s) processed successfully`);
  }

  if (errorCount > 0) {
    messages.push(`${errorCount} record(s) failed due to errors`);
  }

  if (notFoundCount > 0) {
    messages.push(`${notFoundCount} course(s) not found - no header values inserted/updated`);
  }

  return messages.join('. ');
}

export const deleteCourseHeaderValues = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { university } = req.query;

    if (!courseId || !university) {
      return res.status(400).json({ message: 'Course ID and university name are required' });
    }

    const deleted = await UniversitiesAPIHeaderValues.destroy({
      where: {
        course_id: courseId,
        university_name: university
      }
    });

    if (!deleted) {
      return res.status(404).json({ message: 'Course header values not found' });
    }

    return res.status(200).json({ message: 'Course header values deleted successfully' });
  } catch (error) {
    console.error('Error deleting course header values:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const deleteUniversityAllCourses = async (req, res) => {
  try {
    const { universityName } = req.params;

    const deleted = await UniversitiesAPIHeaderValues.destroy({
      where: { university_name: universityName },
    });

    return res.status(200).json({
      success: true,
      message: `Deleted ${deleted} course mappings for ${universityName}`,
      deletedCount: deleted,
    });
  } catch (error) {
    console.error('Error deleting all courses:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const bulkUploadCourseHeaderValues = async (req, res) => {
  try {
    const { courseHeaderValues } = req.body;

    // ❌ only reject if it's NOT an array
    if (!Array.isArray(courseHeaderValues)) {
      return res.status(400).json({
        success: false,
        message: 'courseHeaderValues must be an array'
      });
    }

    // ✅ allow empty array
    if (courseHeaderValues.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No records to process',
        data: {
          totalProcessed: 0,
          inserted: 0,
          updated: 0,
          totalErrors: 0
        }
      });
    }

    let inserted = 0;
    let updated = 0;
    const errors = [];

    for (let i = 0; i < courseHeaderValues.length; i++) {
      try {
        const item = courseHeaderValues[i];
        const courseId = item.courseId || item.course_id;
        const universityName = item.universityName || item.university_name;
        const values =
          typeof item.values === 'object' && item.values !== null
            ? item.values
            : {};

        if (!courseId || !universityName) {
          errors.push(`Row ${i + 1}: Missing courseId or universityName`);
          continue;
        }

        const existingRecord = await UniversitiesAPIHeaderValues.findOne({
          where: {
            course_id: courseId,
            university_name: universityName,
          }
        });

        if (existingRecord) {
          await existingRecord.update({ values });
          updated++;
        } else {
          await UniversitiesAPIHeaderValues.create({
            course_id: courseId,
            university_name: universityName,
            values,
          });
          inserted++;
        }
      } catch (error) {
        errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    return res.status(200).json({
      success: errors.length === 0,
      message: 'Bulk upload completed',
      data: {
        totalProcessed: courseHeaderValues.length,
        inserted,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        totalErrors: errors.length,
      },
    });

  } catch (error) {
    console.error('Error in bulk upload:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};


export const updateSpecificField = async (req, res) => {
  try {
    const { universityName, fieldName, oldValue, newValue } = req.body;

    if (!universityName || !fieldName || !newValue) {
      return res.status(400).json({
        message: 'University name, field name, and new value are required'
      });
    }

    const records = await UniversitiesAPIHeaderValues.findAll({
      where: { university_name: universityName }
    });

    if (!records.length) {
      return res.status(404).json({ message: 'No matching records found.' });
    }

    let updatedCount = 0;

    for (const record of records) {
      const values = record.values || {};

      if (oldValue) {
        if (values[fieldName] === oldValue) {
          values[fieldName] = newValue;
          await record.update({ values });
          updatedCount++;
        }
      } else {
        if (values[fieldName] !== undefined) {
          values[fieldName] = newValue;
          await record.update({ values });
          updatedCount++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Updated '${fieldName}' to '${newValue}' in ${updatedCount} records.`,
      updatedCount
    });
  } catch (error) {
    console.error('Error updating field:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const updateCampusToLucknow = async (req, res) => {
  try {
    const records = await UniversitiesAPIHeaderValues.findAll({
      where: { university_name: 'Lovely Professional University' }
    });

    if (!records.length) {
      return res.status(404).json({ message: 'No matching records found.' });
    }

    let updatedCount = 0;

    for (const record of records) {
      const values = record.values || {};
      if (values.state) {
        values.state = 'Delhi';
        await record.update({ values });
        updatedCount++;
      }
    }

    res.status(200).json({ message: `Updated 'state' to 'Delhi' in ${updatedCount} records.` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
