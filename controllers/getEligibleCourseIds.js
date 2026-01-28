import { QueryTypes, Op, fn, col, where } from "sequelize";
import sequelize from "../config/database-config.js";
import { findActiveCourseByCollege } from "./universitycourse.controller.js";
export async function getEligibleCourseIds(studentId, universityName) {
  const results = await sequelize.query(
    `
    SELECT lcs.course_id
    FROM latest_course_statuses lcs
    JOIN university_courses uc 
      ON lcs.course_id = uc.course_id
    WHERE lcs.student_id = :student_id
      AND LOWER(uc.university_name) = LOWER(:university_name)
      AND EXISTS (
        SELECT 1 
        FROM universities_api_header_values uahv
        WHERE uahv.course_id = lcs.course_id
      )
    `,
    {
      replacements: {
        student_id: studentId,
        university_name: universityName,
      },
      type: QueryTypes.SELECT,
    }
  );
   if (results && results.length > 0) {
    return results.map(r => r.course_id);
  }

  const course = await findActiveCourseByCollege(universityName);

  if (!course) {
    throw new Error(`No active course found for ${universityName}`);
  }

  return [course.course_id];
}
