export const getShortlistedColleges = async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user?.counsellorId || req.user?.supervisorId || req.user?.id || null;
    const role = req.user?.role;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const [shortlistedStatuses] = await sequelize.query(
      `
     SELECT 
  cs.*,
  uc.course_id AS "courses_details.course_id",
  uc.course_name AS "courses_details.course_name",
  uc.degree_name AS "courses_details.degree_name",
  uc.specialization AS "courses_details.specialization",
  uc.stream AS "courses_details.stream",
  uc.level AS "courses_details.level",
  uc.university_name AS "courses_details.university_name",
  uahv.values AS "courses_details.university_api.values"
  FROM latest_course_statuses cs
  LEFT JOIN university_courses uc 
    ON cs.course_id = uc.course_id
  LEFT JOIN universities_api_header_values uahv 
    ON uc.university_name = uahv.university_name
  WHERE cs.student_id = :studentId
  AND cs.is_shortlisted = true
      `,
      {
        replacements: { studentId },
        type: sequelize.QueryTypes.SELECT
      }
    );
  console.log(shortlistedStatuses)
    if (!shortlistedStatuses.length) {
      return res.status(200).json({
        success: true,
        message: 'No shortlisted colleges found',
        data: []
      });
    }

    // Flatten nested keys like "courses_details.*"
    const updatedArray = shortlistedStatuses.map(obj => {
      const flattened = {};
      for (const key in obj) {
        if (key.startsWith('courses_details.')) {
          const newKey = key.replace('courses_details.', '');
          flattened[newKey] = obj[key];
        } else if (key === 'latest_course_status') {
          flattened.status = obj[key];
        } else {
          flattened[key] = obj[key];
        }
      }
      return flattened;
    });

    return res.status(200).json({
      success: true,
      message: 'Shortlisted colleges retrieved successfully',
      data: updatedArray
    });

  } catch (error) {
    console.error('Error fetching shortlisted colleges:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};