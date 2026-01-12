
// 1. Composite indexes for student_remarks:
//    CREATE INDEX idx_student_remarks_student_created ON student_remarks(student_id, created_at DESC);
   
// 2. Composite indexes for student_lead_activities:
//    CREATE INDEX idx_student_activities_student_created ON student_lead_activities(student_id, created_at ASC);
   
// 3. Individual column indexes :
//    CREATE INDEX idx_students_id ON students(student_id);
//    CREATE INDEX idx_counsellor_id ON counsellors(counsellor_id);
