// import axios from "axios";
// import { UniversityCourse } from "../models/index.js";

// export async function autoSending(students_data = []) {
//   try {
//     const RegularColleges = await UniversityCourse.findAll({
//       where: { study_mode: 'Regular' },
//       attributes: ['university_name'],
//       group: ['university_name'],
//       raw: true
//     });

//     for (const college of RegularColleges) {
//       const collegeName = college.university_name;
      
//       if (collegeName.toLowerCase().includes('amity') || collegeName.toLowerCase().includes('chandigarh')) {
//         continue;
//       }
       
//       for (const student_id of students_data) {
//         try {
//         const data=  await axios.post('http://localhost:3001/v1/StudentCourseStatusLogs/sentStatustoCollege', {
//             collegeName,
//             studentId: student_id,
//             sendType: 'auto'
//           });
//           console.log(data,'data')
//         } catch (err) {
//           console.log(`Error for student ${student_id} at ${collegeName}:`, err.message);
//         }
//       }
//     }
//   } catch (error) {
//     console.error('Unexpected error in autoSending:', error.message);
//   }
// }
