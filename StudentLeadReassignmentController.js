import { sequelize, Student, LeadAssignmentLogs, StudentRemark, Counsellor } from "./models/index.js";
import { QueryTypes, Op } from "sequelize";
import dayjs from "dayjs";
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import cron from "node-cron";
import StudentAssignmentLogic from "./models/Student_Reassignment_Logic.js";

dayjs.extend(utc);
dayjs.extend(timezone);

const getActiveAssignmentRule = async (transaction) => {
  console.log("Fetching active assignment rule");
  return await StudentAssignmentLogic.findOne({
    where: { status: 'active' },
    transaction
  });
};

const getCounsellorsWithLimits = async (activeRule, transaction) => {
  if (!activeRule?.assignment_logic?.length) {
    console.log("No assignment logic found");
    return [];
  }

  const assignmentLogic = activeRule.assignment_logic;
  const counsellorNames = assignmentLogic.map(logic => logic.assignedCounsellor);

  const counsellorRecords = await Counsellor.findAll({
    where: {
      counsellor_name: counsellorNames,
      counsellor_preferred_mode: 'Online',
      status: "active",
      role: 'l2'
    },
    attributes: ['counsellor_id', 'counsellor_name'],
    transaction
  });

  const counsellorMap = {};
  counsellorRecords.forEach(c => {
    counsellorMap[c.counsellor_name] = c.counsellor_id;
  });

  const counsellorsWithLimits = [];
  for (const logic of assignmentLogic) {
    const counsellorId = counsellorMap[logic.assignedCounsellor];
    if (counsellorId) {
      counsellorsWithLimits.push({
        counsellor_id: counsellorId,
        counsellor_name: logic.assignedCounsellor,
        hourly_limit: logic.limit,
        current_assigned: 0
      });
    }
  }

  console.log(`Found ${counsellorsWithLimits.length} counsellors`);
  return counsellorsWithLimits;
};

const getCounsellorAssignmentCountsThisHour = async (counsellors, transaction) => {
  const currentHour = dayjs().format('YYYY-MM-DD HH:00:00');
  const nextHour = dayjs().add(1, 'hour').format('YYYY-MM-DD HH:00:00');

  for (const counsellor of counsellors) {
    const assignedCount = await LeadAssignmentLogs.count({
      where: {
        assigned_counsellor_id: counsellor.counsellor_id,
        reference_from: 'Online team lead reassignment',
        created_at: { [Op.gte]: currentHour, [Op.lt]: nextHour }
      },
      transaction
    });

    counsellor.current_assigned = assignedCount;
    counsellor.remaining_capacity = Math.max(0, counsellor.hourly_limit - assignedCount);
  }

  return counsellors;
};

const findEligibleStudents = async (activeRule, totalHourlyCapacity, transaction) => {
  if (!activeRule || totalHourlyCapacity <= 0) return [];

  const query = `
    WITH latest_remark AS (
      SELECT DISTINCT ON (sr.student_id)
        sr.student_id,
        sr.counsellor_id,
        sr.lead_status,
        sr.lead_sub_status,
        sr.isDisabled,
        sr.created_at
      FROM student_remarks sr
      ORDER BY sr.student_id, sr.created_at DESC
    ),
    disabled_check AS (
      SELECT
        student_id,
        COUNT(*) AS total_disabled_remarks
      FROM student_remarks
      WHERE isDisabled = true
      GROUP BY student_id
    )
    SELECT
      s.student_id,
      s.assigned_counsellor_id,
      s.assigned_counsellor_l3_id,
      lr.created_at AS latest_remark_created_at,
      lr.lead_status,
      lr.lead_sub_status,
      c.counsellor_name,
      c.role,
      c.counsellor_preferred_mode,
      COALESCE(dc.total_disabled_remarks, 0) AS disabled_remarks_count
    FROM students s
    JOIN latest_remark lr ON lr.student_id = s.student_id
    JOIN counsellors c ON c.counsellor_id = s.assigned_counsellor_id
    LEFT JOIN disabled_check dc ON dc.student_id = s.student_id
    WHERE
      lr.lead_status = 'NotInterested'
      AND lr.isDisabled = false
      AND lr.created_at <= NOW() - INTERVAL '7 days'
      AND c.role = 'l2'
      AND LOWER(c.counsellor_preferred_mode) = 'online'
      AND COALESCE(dc.total_disabled_remarks, 0) = 0
    ORDER BY lr.created_at ASC
    LIMIT ${totalHourlyCapacity};
  `;

  return await sequelize.query(query, {
    type: QueryTypes.SELECT,
    transaction,
  });
};

const reassignStudents = async (students, counsellors, activeRule, transaction) => {
  if (!students.length || !counsellors.length) return 0;

  let totalReassigned = 0;
  let lastAssignedCounsellorIndex = activeRule.lastAssignedCounsellorIndex || 0;

  console.log(`Starting reassignment with index: ${lastAssignedCounsellorIndex}`);

  for (const student of students) {
    if (student.disabled_remarks_count > 0) continue;

    let nextCounsellor = null;
    let nextCounsellorIndex = -1;

    for (let i = 0; i < counsellors.length; i++) {
      const index = (lastAssignedCounsellorIndex + i) % counsellors.length;
      const counsellor = counsellors[index];

      if (counsellor.current_assigned < counsellor.hourly_limit) {
        nextCounsellor = counsellor;
        nextCounsellorIndex = index;
        break;
      }
    }

    if (!nextCounsellor) continue;

    await Student.update(
      {
        assigned_counsellor_id: nextCounsellor.counsellor_id,
        reassigneddate: dayjs().format('YYYY-MM-DD HH:mm:ss'),
        is_connected_yet: false,
        remarks_count: 0,
        is_reactivity: false,
        total_remarks_l3: 0,
        number_of_unread_messages: 0,
        is_connected_yet_l3: false,
        calling_status_l3: null,
        sub_calling_status_l3: null,
        remarks_l3: null,
        next_call_date_l3: null,
        last_call_date_l3: null,
        next_call_time_l3: null
      },
      { where: { student_id: student.student_id }, transaction }
    );

    await LeadAssignmentLogs.create({
      assigned_counsellor_id: nextCounsellor.counsellor_id,
      student_id: student.student_id,
      reference_from: "Online team lead reassignment",
    }, { transaction });

    await StudentRemark.update(
      { isdisabled: true },
      { where: { student_id: student.student_id }, transaction }
    );

    nextCounsellor.current_assigned += 1;
    lastAssignedCounsellorIndex = (nextCounsellorIndex + 1) % counsellors.length;
    totalReassigned++;

    console.log(`Reassigned student ${student.student_id} to ${nextCounsellor.counsellor_name}`);
  }

  if (totalReassigned > 0) {
    activeRule.lastAssignedCounsellorIndex = lastAssignedCounsellorIndex;
    await activeRule.save({ transaction });
    console.log(`Updated lastAssignedCounsellorIndex to ${lastAssignedCounsellorIndex}`);
  }

  return totalReassigned;
};

const mainFunction = async () => {
  const transaction = await sequelize.transaction();

  try {
    console.log("=== Starting main function ===");

    const activeRule = await getActiveAssignmentRule(transaction);
    if (!activeRule) {
      console.log("No active rule found");
      await transaction.commit();
      return;
    }

    console.log("Active rule found");

    const counsellors = await getCounsellorsWithLimits(activeRule, transaction);
    if (!counsellors.length) {
      console.log("No counsellors found");
      await transaction.commit();
      return;
    }

    console.log(`Found ${counsellors.length} counsellors`);

    await getCounsellorAssignmentCountsThisHour(counsellors, transaction);

    const totalHourlyCapacity = counsellors.reduce((sum, c) => sum + c.remaining_capacity, 0);
    console.log(`Total hourly capacity: ${totalHourlyCapacity}`);

    if (totalHourlyCapacity <= 0) {
      console.log("No capacity available");
      await transaction.commit();
      return;
    }

    const eligibleStudents = await findEligibleStudents(activeRule, totalHourlyCapacity, transaction);
    console.log(`Found ${eligibleStudents.length} eligible students`);

    if (!eligibleStudents.length) {
      console.log("No eligible students found");
      await transaction.commit();
      return;
    }

    const reassignedCount = await reassignStudents(eligibleStudents, counsellors, activeRule, transaction);
    console.log(`Total reassigned: ${reassignedCount}`);

    await transaction.commit();
    console.log("=== Main function completed ===");

  } catch (error) {
    console.error("Error in mainFunction:", error);
    await transaction.rollback();
  }
};

sequelize.authenticate()
  .then(() => {
    console.log('Database connected');

    cron.schedule("0 9-19 * * *", () => {
      console.log('Cron triggered at:', dayjs().tz("Asia/Kolkata").format('HH:mm:ss'));
      mainFunction();
    }, {
      timezone: "Asia/Kolkata",
      scheduled: true,
      runOnInit: false
    });

    console.log("Cron job scheduled: 9 AM to 7 PM IST hourly");
  })
  .catch(err => {
    console.error('Database connection failed:', err);
  });

process.on('SIGINT', () => {
  console.log('Shutting down');
  process.exit(0);
});

export { mainFunction };