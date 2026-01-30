import axios from "axios";
import { Student, UniversityCourse } from "../models/index.js";
import { createCollegeApiSentStatus } from "./collegeApiSentStatus.controller.js";
import CourseHeaderValue from "../models/university_header_values.js";
import { Op, fn, col, where } from "sequelize";
import { getEligibleCourseIds } from "./getEligibleCourseIds.js";
async function findHeaderValue(collegeName, courseId, studentId) {
  try {
    const andConditions = [
      where(fn("LOWER", col("university_name")), {
        [Op.eq]: collegeName.toLowerCase(),
      }),
    ];

    if (courseId !== null && courseId !== undefined) {
      andConditions.push({ course_id: courseId });
    } else {
      if (!studentId) {
        throw new Error("studentId is required when courseId is not provided");
      }

      const courseIds = await getEligibleCourseIds(studentId, collegeName);

      if (!courseIds.length) {
        throw new Error("No eligible courses found for header values");
      }

      andConditions.push({
        course_id: {
          [Op.in]: courseIds,
        },
      });
    }

    const courseHeaderValue = await CourseHeaderValue.findOne({
      where: {
        [Op.and]: andConditions,
      },
      order: [["created_at", "DESC"]],
    });

    if (!courseHeaderValue || !courseHeaderValue.values) {
      throw new Error("Course header values not found");
    }

    return courseHeaderValue;
  } catch (error) {
    console.error(
      ` Error fetching course header values for ${collegeName}:`,
      error,
    );
    throw error;
  }
}

async function updateStudentShortlistStatus(
  studentId,
  collegeName,
  status,
  requestData = null,
  responseData = null,
  headersData = null,
  sendType,
  studentEmail = null,
  studentPhone = null,
  isPrimary = true,
) {
  console.log(`📝 Updating status for ${collegeName}:`, {
    studentId,
    status,
    isPrimary,
    studentEmail: studentEmail || "Using primary email",
    studentPhone: studentPhone || "Using primary phone",
  });

  try {
    if (!collegeName || !studentId) {
      console.error("❌ Missing collegeName or studentId for status update");
      return;
    }

    await createCollegeApiSentStatus({
      studentId,
      collegeName,
      status,
      requestToApi: requestData,
      responseFromApi: responseData,
      requestHeaderToApi: headersData,
      sendType,
      studentEmail,
      studentPhone,
      isPrimary,
    });

    console.log(`✅ Status updated successfully for ${collegeName}: ${status}`);
    return status;
  } catch (error) {
    console.error(
      `❌ Error updating student status for ${collegeName}:`,
      error,
    );
    throw error;
  }
}

async function handleApiError(
  error,
  res,
  studentId,
  collegeName,
  payloadData,
  headers,
  sendType,
  studentEmail = null,
  studentPhone = null,
  isPrimary = true,
) {
  console.error(`🚨 API Error for ${collegeName}:`, {
    error: error.message,
    statusCode: error.response?.status,
    isPrimary,
    studentEmail,
    studentPhone,
  });

  const errorStatus = "Failed due to Technical Issues";

  if (studentId && collegeName) {
    await updateStudentShortlistStatus(
      studentId,
      collegeName,
      errorStatus,
      payloadData,
      error.response?.data || null,
      headers,
      sendType,
      studentEmail,
      studentPhone,
      isPrimary,
    ).catch((err) =>
      console.error("❌ Failed to update student status on error:", err),
    );
  }
  if (error.response) {
    const statusCode = error.response.status;
    const responseData = error.response.data;

    console.log(`📊 Error Response for ${collegeName}:`, {
      statusCode,
      response: responseData,
    });

    if (statusCode === 400 || statusCode === 422) {
      if (studentId && collegeName) {
        await updateStudentShortlistStatus(
          studentId,
          collegeName,
          "Field Missing",
          payloadData,
          responseData,
          headers,
          sendType,
          studentEmail,
          studentPhone,
          isPrimary,
        );
      }

      return res.status(400).json({
        success: false,
        message: "Field match issue",
        status: "Field Missing",
        error: responseData,
      });
    } else if (statusCode === 409) {
      if (studentId && collegeName) {
        await updateStudentShortlistStatus(
          studentId,
          collegeName,
          "Do not Proceed",
          payloadData,
          responseData,
          headers,
          sendType,
          studentEmail,
          studentPhone,
          isPrimary,
        );
      }

      return res.status(409).json({
        success: false,
        message: "Lead already exists",
        status: "Do not Proceed",
        error: responseData,
      });
    } else if (statusCode >= 500) {
      return res.status(500).json({
        success: false,
        message: "Failed due to technical issue",
        status: errorStatus,
        error: responseData,
      });
    }
  } else if (error.request) {
    console.error(`⏰ No response received from ${collegeName} API`);
    return res.status(504).json({
      success: false,
      message: "No response received from API",
      status: errorStatus,
      error: "Gateway Timeout",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Error sending status to college",
    status: errorStatus,
    error: error.message,
  });
}

async function getStudentDataForRequest(
  studentId,
  studentData,
  studentEmail,
  studentPhone,
  isPrimary,
) {
  console.log(`👤 Getting student data:`, {
    studentId,
    hasStudentData: !!studentData,
    isPrimary,
    providedEmail: studentEmail,
    providedPhone: studentPhone,
  });

  if (!isPrimary && studentEmail && studentPhone) {
    console.log(
      `📞 Using secondary contact details: ${studentEmail}, ${studentPhone}`,
    );
    return {
      student_email: studentEmail,
      student_phone: studentPhone,
      student_name: "Parent/Guardian",
    };
  }

  if (studentId) {
    console.log(`🔍 Fetching primary student data for: ${studentId}`);
    const student = await Student.findByPk(studentId);
    if (!student) {
      console.error(`❌ Student not found: ${studentId}`);
      throw new Error("Student not found");
    }
    console.log(`✅ Found primary student: ${student.student_email}`);
    return student.toJSON();
  }

  if (studentData) {
    console.log(`📋 Using provided student data`);
    return studentData;
  }

  console.error(`❌ No student data available`);
  throw new Error("Either studentId or studentData is required");
}

function processSpecialUniversityApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing special university response for ${collegeName}:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) {
    console.error(`❌ No response data from ${collegeName}`);
    return "Failed due to Technical Issues";
  }

  const responseData = apiResponse.data;
  const status = responseData.Status || responseData.status;
  const message = responseData.Message;

  console.log(`📋 Response analysis:`, { status, message: typeof message });

  if (status !== "Success" || !message || typeof message !== "object") {
    console.error(`❌ Invalid response structure from ${collegeName}`);
    return "Failed due to Technical Issues";
  }

  const result =
    message.IsCreated === true
      ? "Proceed"
      : message.IsCreated === false
        ? "Do not Proceed"
        : "Failed due to Technical Issues";

  console.log(`✅ ${collegeName} result: ${result}`);
  return result;
}
function processJaypeeApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Jaypee (NoPaperForms) response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) {
    console.error(`❌ No response data from ${collegeName}`);
    return "Failed due to Technical Issues";
  }

  const responseData = apiResponse.data;
  const status = responseData.status || responseData.Status;
  const message = responseData.message || responseData.Message;

  console.log(`📋 Jaypee response analysis:`, { status, message });

  // Handle Jaypee/NoPaperForms specific responses
  if (status === "Success") {
    console.log(`✅ ${collegeName}: Lead created successfully`);
    return "Proceed";
  }

  if (status === "Duplicate") {
    console.log(`⚠️ ${collegeName}: Email/Mobile already registered (DND)`);
    return "Do not Proceed";
  }

  // Check for duplicate message in text
  if (message && typeof message === "string") {
    const msgLower = message.toLowerCase();
    if (
      msgLower.includes("already registered") ||
      msgLower.includes("duplicate") ||
      msgLower.includes("already exists")
    ) {
      console.log(`⚠️ ${collegeName}: Duplicate lead detected`);
      return "Do not Proceed";
    }

    if (
      msgLower.includes("required") ||
      msgLower.includes("mandatory") ||
      msgLower.includes("missing")
    ) {
      console.log(`⚠️ ${collegeName}: Field missing`);
      return "Field Missing";
    }
  }

  console.error(`❌ ${collegeName}: Failed due to technical issues`);
  return "Failed due to Technical Issues";
}
function processShooliniApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Shoolini response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) {
    console.error(`❌ No response data from Shoolini`);
    return "Failed due to Technical Issues";
  }

  const responseData = apiResponse.data;
  const status = responseData.Status || responseData.status;
  const message = responseData.Message;
  const exceptionType = responseData.ExceptionType;
  const exceptionMessage = responseData.ExceptionMessage || "";

  console.log(`📋 Shoolini response analysis:`, {
    status,
    messageType: typeof message,
    exceptionType,
    exceptionMessage,
  });

  // ⚠️ Duplicate lead (Email already exists) → Do not Proceed
  if (
    status === "Error" &&
    (exceptionType === "MXDuplicateEntryException" ||
      exceptionMessage.includes("already exists"))
  ) {
    console.log(`⚠️ Shoolini: Duplicate lead detected`);
    return "Do not Proceed";
  }

  // ❌ Invalid / unexpected response
  if (status !== "Success" || !message || typeof message !== "object") {
    console.error(`❌ Invalid response structure from Shoolini`);
    return "Failed due to Technical Issues";
  }

  // ✅ Normal success / business failure handling
  const result =
    message.IsCreated === true
      ? "Proceed"
      : message.IsCreated === false
        ? "Do not Proceed"
        : "Failed due to Technical Issues";

  console.log(`✅ Shoolini result: ${result}`);
  return result;
}

function processManipalApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Manipal response for ${collegeName}:`, {
    status: apiResponse?.status,
    data: apiResponse?.data,
  });

  if (!apiResponse?.data) {
    return "Failed due to Technical Issues";
  }

  const responseData = apiResponse.data;

  // 🔍 Extract Status
  const status =
    responseData?.Status ||
    responseData?.status ||
    responseData?.message?.Status ||
    responseData?.Message?.Status;

  // 🔍 Extract IsCreated (if exists)
  const isCreated =
    responseData?.message?.Message?.IsCreated ??
    responseData?.Message?.Message?.IsCreated ??
    responseData?.message?.IsCreated ??
    responseData?.Message?.IsCreated;

  // ❌ SUCCESS but NOT CREATED → DO NOT PROCEED
  if (status === "Success" && isCreated === false) {
    return "Do Not Proceed";
  }

  // ✅ SUCCESS and CREATED (or IsCreated not provided)
  if (status === "Success" && isCreated !== false) {
    return "Proceed";
  }

  // ---- existing message handling ----
  let rawMessage = "";

  if (typeof responseData.message === "string") {
    rawMessage = responseData.message;
  } else if (typeof responseData.Message === "string") {
    rawMessage = responseData.Message;
  } else if (typeof responseData.message === "object") {
    rawMessage =
      responseData.message.Message || responseData.message.Status || "";
  } else if (typeof responseData.Message === "object") {
    rawMessage =
      responseData.Message.Message || responseData.Message.Status || "";
  }

  const normalizedMessage = String(rawMessage).toLowerCase();

  // 🚫 LEAD ALREADY EXISTS
  if (normalizedMessage.includes("already exists")) {
    return "Do Not Proceed";
  }

  // ❌ Fallback
  return "Failed due to Technical Issues";
}

function processVivekanandApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Vivekanand response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) return "Failed due to Technical Issues";

  const responseData = apiResponse.data;
  const status = responseData.Status || responseData.status;
  const message = responseData.Message;

  if (status !== "Success" || !message || typeof message !== "object") {
    return "Failed due to Technical Issues";
  }

  return message.IsCreated === true
    ? "Proceed"
    : message.IsCreated === false
      ? "Do not Proceed"
      : "Failed due to Technical Issues";
}

function processGLAApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing GLA response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) return "Failed due to Technical Issues";

  const responseData = apiResponse.data;
  const responseText =
    typeof responseData === "string"
      ? responseData
      : JSON.stringify(responseData);

  console.log(`📋 GLA response text: ${responseText.substring(0, 200)}...`);

  if (responseText.includes("Email Id or Mobile No already registered")) {
    console.log(`⚠️ GLA: Duplicate registration detected`);
    return "Do not Proceed";
  }

  if (
    responseText.includes("Rgistration successful with UserId:") ||
    responseText.includes("Registration successful with UserId:")
  ) {
    console.log(`✅ GLA: Registration successful`);
    return "Proceed";
  }

  console.error(`❌ GLA: Unrecognized response`);
  return "Failed due to Technical Issues";
}

function processGalgotiasApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Galgotias response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) return "Failed due to Technical Issues";

  const responseData = apiResponse.data;
  const code = responseData.code;
  const status = responseData.status;
  const message = responseData.message || "";

  console.log(`📋 Galgotias response:`, {
    code,
    status,
    message: message.substring(0, 100),
  });

  // ❌ Non-200 code → technical issue
  if (code !== 200) {
    console.error(`❌ Galgotias: Invalid status code ${code}`);
    return "Failed due to Technical Issues";
  }

  // ⚠️ Email already used → Do not Proceed
  if (status === false && message.includes("Email is already being used")) {
    console.log(`⚠️ Galgotias: Email already in use`);
    return "Do not Proceed";
  }

  // ⚠️ Mobile already used → Do not Proceed
  if (
    status === false &&
    message.includes("Mobile number is already being used")
  ) {
    console.log(`⚠️ Galgotias: Mobile number already in use`);
    return "Do not Proceed";
  }

  // ✅ Lead created successfully
  if (
    status === true &&
    message.includes("Lead has been created successfully") &&
    responseData.data?.lead_id
  ) {
    console.log(`✅ Galgotias: Lead created successfully`);
    return "Proceed";
  }

  // ❌ Everything else
  console.error(`❌ Galgotias: Unrecognized response`, responseData);
  return "Failed due to Technical Issues";
}

function processAmityOnlineApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Amity Online response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) return "Failed due to Technical Issues";

  const responseData = apiResponse.data;
  const status = responseData.status;
  const leadId = responseData.lead_id;
  const amsId = responseData.ams_id;

  console.log(`📋 Amity Online response:`, { status, leadId, amsId });

  if (status === "Lead already exists" && leadId && amsId) {
    console.log(`⚠️ Amity Online: Lead already exists`);
    return "Do not Proceed";
  }

  if (status === "Success" && leadId && amsId) {
    console.log(`✅ Amity Online: Success`);
    return "Proceed";
  }

  console.error(`❌ Amity Online: Unrecognized response`);
  return "Failed due to Technical Issues";
}

function processMangalayatanApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing Mangalayatan response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) return "Failed due to Technical Issues";

  const responseData = apiResponse.data;
  const status = apiResponse.status;

  console.log(
    `📋 Mangalayatan status: ${status}, leadAlreadyExists: ${responseData.leadAlreadyExists}`,
  );

  if (status !== 200) {
    console.error(`❌ Mangalayatan: Invalid status ${status}`);
    return "Failed due to Technical Issues";
  }

  return responseData.leadAlreadyExists !== true
    ? "Proceed"
    : responseData.leadAlreadyExists === true
      ? "Do not Proceed"
      : "Failed due to Technical Issues";
}
function CgcApiResponse(apiResponse, collegeName) {
  if (!apiResponse?.data) {
    return "Failed due to Technical Issues";
  }

  const responseData = apiResponse.data;

  const status = responseData.status;
  const message = responseData.message;

  if (status === "Fail") {
    return "Failed due to Technical Issues";
  }

  if (
    message === "Duplicate" ||
    message === "Email/Mobile already registered"
  ) {
    return "Do not Proceed";
  }

  return "Proceed";
}

function processLPUOnlineApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing LPU Online response:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) return "Failed due to Technical Issues";

  const responseData = apiResponse.data;
  const statusCode = responseData.statusCode || responseData.code;
  const status = responseData.status;

  console.log(`📋 LPU Online: statusCode=${statusCode}, status=${status}`);

  if (statusCode === 200 && status === true && responseData.data?.lead_id) {
    console.log(
      `✅ LPU Online: Proceed with lead_id ${responseData.data.lead_id}`,
    );
    return "Proceed";
  }

  if (
    statusCode === 200 &&
    status === false &&
    (!responseData.data || responseData.data.length === 0)
  ) {
    console.log(`⚠️ LPU Online: Do not Proceed - no data returned`);
    return "Do not Proceed";
  }

  console.error(`❌ LPU Online: Failed due to technical issues`);
  return "Failed due to Technical Issues";
}

function processApiResponse(apiResponse, collegeName) {
  console.log(`📊 Processing standard response for ${collegeName}:`, {
    status: apiResponse.status,
    data: apiResponse.data,
  });

  if (!apiResponse?.data) {
    console.error(`❌ No response data from ${collegeName}`);
    return "Failed due to Technical Issues";
  }

  const responseData = apiResponse.data;
  const status = responseData.status || responseData.Status;
  const statusCode = responseData.statusCode || responseData.code;
  const message = responseData.message || responseData.Message;

  console.log(`📋 Standard response analysis:`, {
    status,
    statusCode,
    message: message?.substring(0, 100),
  });

  if (!status && !statusCode) {
    console.error(`❌ Invalid response from ${collegeName}`);
    return "Failed due to Technical Issues";
  }

  const isLPU =
    collegeName?.toLowerCase().includes("lovely professional university") &&
    !collegeName?.toLowerCase().includes("online");

  if (isLPU) {
    if (status === "Success") {
      console.log(`✅ LPU: Success`);
      return "Proceed";
    }
    if (status === "Duplicate") {
      console.log(`⚠️ LPU: Duplicate lead`);
      return "Do not Proceed";
    }
    if (status === "Fail") {
      const messageStr = message?.toString().toLowerCase() || "";
      if (
        messageStr.includes("mandatory") ||
        messageStr.includes("required") ||
        messageStr.includes("missing")
      ) {
        console.log(`⚠️ LPU: Field missing`);
        return "Field Missing";
      }
      console.error(`❌ LPU: Failed`);
      return "Failed due to Technical Issues";
    }
  }

  if (status === "Lead already exists") {
    console.log(`⚠️ ${collegeName}: Lead already exists`);
    return "Do not Proceed";
  }

  if (status === "Success") {
    console.log(`✅ ${collegeName}: Success`);
    return "Proceed";
  }

  if (status?.includes("required")) {
    console.log(`⚠️ ${collegeName}: Required field missing`);
    return "Field Missing";
  }

  console.error(`❌ ${collegeName}: Failed due to technical issues`);
  return "Failed due to Technical Issues";
}

async function processStandardUniversity(
  req,
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🔄 Processing standard university: ${collegeName}`, {
    isPrimary,
    studentEmail: studentEmail || "Using primary",
    studentPhone: studentPhone || "Using primary",
  });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );
  let transformedData = {};
  let apiUrl = null;
  let apiKey = null;

  if (courseHeaderValue?.values) {
    const valuesMap = new Map(Object.entries(courseHeaderValue.values));

    for (const [key, value] of valuesMap.entries()) {
      if (key === "API_URL") {
        apiUrl = value;
        continue;
      }
      if (key === "x-api-key") {
        apiKey = value;
        continue;
      }

      if (key === "mx_AMS_ID") {
        transformedData.mx_AMS_ID = Number(value);
        continue;
      }

      if (typeof value === "string" && value.startsWith("student.")) {
        const userKey = value.replace("student.", "");
        const keyMapping = {
          phone_number: "student_phone",
          name: "student_name",
          email: "student_email",
        };
        const actualKey = keyMapping[userKey] || userKey;
        let userValue = userResponse[actualKey];

        if (Array.isArray(userValue)) {
          userValue = userValue.length > 0 ? userValue[0] : null;
        }

        if (!isPrimary) {
          if (actualKey === "student_email" && studentEmail) {
            userValue = studentEmail;
          } else if (actualKey === "student_phone" && studentPhone) {
            userValue = studentPhone;
          }
        }

        transformedData[key] = userValue !== undefined ? userValue : null;
      } else {
        transformedData[key] = value;
      }
    }
  }

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const finalPayload = {
    ...transformedData,
    ...(transformedData.secret_key === "b061b6abae687fbd43e1bc2260c04b6a" && {
      field_session: "Session 2026",
    }),
  };

  console.log(`📤 Sending to ${collegeName}:`, {
    url: apiUrl,
    headers: Object.keys(headers),
    payload: finalPayload,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: finalPayload,
      timeout: 15000,
    });

    const statusResult = processApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        finalPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    const errorStatus = "Failed due to Technical Issues";
    console.error(`❌ Error sending to ${collegeName}:`, error.message);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        errorStatus,
        finalPayload,
        null,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }
    throw error;
  }
}

async function handleShooliniOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling Shoolini University Online`, {
    collegeName,
    isPrimary,
    studentEmail,
    studentPhone,
  });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );

  if (!courseHeaderValue?.values) {
    throw new Error("Course header values not found");
  }

  const values = courseHeaderValue.values;
  const baseApiUrl = values.API_URL;
  const accessKey = values.accessKey;
  const secretKey = values.secretKey;
  const leadUpdateBehavior = values.LeadUpdateBehavior;

  if (!baseApiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const queryParams = new URLSearchParams({
    accessKey,
    secretKey,
    LeadUpdateBehavior: leadUpdateBehavior,
  });

  const fullApiUrl = `${baseApiUrl}?${queryParams.toString()}`;
  const shooliniPayload = [];

  console.log(`🔗 Shoolini API URL: ${fullApiUrl}`);

  for (const [key, value] of Object.entries(values)) {
    if (
      ["API_URL", "accessKey", "secretKey", "LeadUpdateBehavior"].includes(key)
    ) {
      continue;
    }

    let finalValue;

    if (!isPrimary) {
      if (key === "EmailAddress" && studentEmail) {
        finalValue = studentEmail;
      } else if (key === "Phone" && studentPhone) {
        finalValue = studentPhone;
      } else if (typeof value === "string" && value.startsWith("student.")) {
        const userKey = value.replace("student.", "");
        const mapping = {
          phone_number: "student_phone",
          name: "student_name",
          email: "student_email",
        };
        const actualKey = mapping[userKey] || userKey;
        finalValue = userResponse[actualKey] || "";
      } else {
        finalValue = value;
      }
    } else {
      if (typeof value === "string" && value.startsWith("student.")) {
        const userKey = value.replace("student.", "");
        const mapping = {
          phone_number: "student_phone",
          preferred_state: "preferredState",
          name: "student_name",
          email: "student_email",
          preferred_city: "preferred_city",
        };
        const actualKey = mapping[userKey] || userKey;
        let userValue = userResponse[actualKey];

        if (Array.isArray(userValue)) {
          userValue = userValue.length > 0 ? userValue[0] : "";
        }

        if (actualKey === "preferredState") {
          finalValue = userValue?.trim() ? userValue : "Himachal Pradesh";
        } else if (actualKey === "preferredCity") {
          finalValue =
            userValue?.trim() &&
            !userValue.toLowerCase().includes("himachal") &&
            !userValue.toLowerCase().includes("pradesh")
              ? userValue
              : "Solan";
        } else if (actualKey === "phoneNumber" && userValue) {
          finalValue = `+91-${userValue}`;
        } else {
          finalValue = userValue || "";
        }
      } else {
        finalValue = value;
      }
    }

    shooliniPayload.push({
      Attribute: key,
      Value: finalValue,
    });
  }

  const headers = {
    "Content-Type": "application/json",
  };

  console.log(`📤 Sending to Shoolini:`, {
    url: fullApiUrl,
    payload: shooliniPayload,
    isPrimary,
    studentEmail: studentEmail || userResponse.student_email,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: fullApiUrl,
      headers,
      data: shooliniPayload,
      timeout: 15000,
    });

    const statusResult = processShooliniApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        shooliniPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    // 🔥 CRITICAL FIX: Handle LeadSquared business errors sent as HTTP 500
    if (error.response && error.response.data) {
      console.warn("⚠️ Shoolini returned error response, processing body");

      const statusResult = processShooliniApiResponse(
        error.response,
        collegeName,
      );

      if (studentId) {
        await updateStudentShortlistStatus(
          studentId,
          collegeName,
          statusResult,
          shooliniPayload,
          error.response.data,
          headers,
          sendType,
          studentEmail || userResponse.student_email,
          studentPhone || userResponse.student_phone,
          isPrimary,
        );
      }

      return statusResult;
    }

    // ❌ REAL technical failure
    console.error(`❌ Shoolini API technical failure:`, error.message);
    throw error;
  }
}
async function handleJaypeeNoPaperForms(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling Jaypee NoPaperForms API: ${collegeName}`, {
    isPrimary,
  });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );

  if (!courseHeaderValue?.values) {
    throw new Error("Course header values not found");
  }

  const values = courseHeaderValue.values;
  const apiUrl = values.API_URL;

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  // Prepare form data for x-www-form-urlencoded
  const formData = new URLSearchParams();

  // Add all required fields from header values
  for (const [key, value] of Object.entries(values)) {
    if (key === "API_URL") continue;

    let finalValue;

    if (typeof value === "string" && value.startsWith("student.")) {
      const userKey = value.replace("student.", "");
      const mapping = {
        student_name: "student_name",
        student_email: "student_email",
        student_phone: "student_phone",
      };
      const actualKey = mapping[userKey] || userKey;

      // Use secondary contact details if provided and not primary
      if (!isPrimary) {
        if (actualKey === "student_email" && studentEmail) {
          finalValue = studentEmail;
        } else if (actualKey === "student_phone" && studentPhone) {
          finalValue = studentPhone;
        } else {
          finalValue = userResponse[actualKey] || "";
        }
      } else {
        finalValue = userResponse[actualKey] || "";
      }
    } else {
      finalValue = value;
    }

    // Handle dynamic values for medium and campaign
    if (
      key === "medium" &&
      finalValue === "Dynamic value as per the Publisher"
    ) {
      finalValue = "website"; // Default value or get from your system
    }

    if (
      key === "campaign" &&
      finalValue === "Dynamic value as per the Publisher"
    ) {
      finalValue = "default_campaign"; // Default value or get from your system
    }

    formData.append(key, finalValue);
  }

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  console.log(`📤 Sending to Jaypee (NoPaperForms):`, {
    url: apiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
    phone:
      !isPrimary && studentPhone ? studentPhone : userResponse.student_phone,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: formData.toString(),
      timeout: 15000,
    });

    const statusResult = processJaypeeApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        Object.fromEntries(formData),
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Jaypee NoPaperForms API error:`, error.message);

    // Handle specific NoPaperForms errors
    if (error.response?.data) {
      const statusResult = processJaypeeApiResponse(
        error.response,
        collegeName,
      );

      if (studentId) {
        await updateStudentShortlistStatus(
          studentId,
          collegeName,
          statusResult,
          Object.fromEntries(formData),
          error.response.data,
          headers,
          sendType,
          studentEmail || userResponse.student_email,
          studentPhone || userResponse.student_phone,
          isPrimary,
        );
      }

      return statusResult;
    }

    throw error;
  }
}
async function handleSpecialUniversity(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling special university: ${collegeName}`, {
    isPrimary,
    studentEmail,
    studentPhone,
  });

  const specialPayload = [
    { Attribute: "FirstName", Value: userResponse.student_name || "" },
    { Attribute: "LastName", value: "" },
    {
      Attribute: "EmailAddress",
      Value:
        !isPrimary && studentEmail
          ? studentEmail
          : userResponse.student_email || "",
    },
    {
      Attribute: "Phone",
      Value:
        !isPrimary && studentPhone
          ? studentPhone
          : userResponse.student_phone || "",
    },
    { Attribute: "Source", Value: "nuvora" },
    { Attribute: "SourceCampaign", Value: "" },
    { Attribute: "SourceMedium", Value: "" },
    {
      Attribute: "mx_Campus",
      Value: collegeName.includes("Chandigarh University")
        ? "Mohali"
        : "Gurgaon",
    },
    { Attribute: "mx_Course2", Value: "Btech" },
    {
      Attribute: "mx_State",
      Value: collegeName.includes("Chandigarh University") ? "Punjab" : "Punjab",
    },
    {
      Attribute: "mx_City",
      Value: collegeName.includes("Chandigarh University")
        ? "Chandigarh"
        : "Chandigarh",
    },
  ];

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );
  const apiUrl =
    courseHeaderValue?.values?.API_URL ||
    courseHeaderValue?.values?.["api-url"];
  const apiKey = courseHeaderValue?.values?.["x-api-key"];
  const apiKey1 = courseHeaderValue?.values?.["secret-key"];
  const apiKey2 = courseHeaderValue?.values?.["access-key"];

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) headers["x-api-key"] = apiKey;
  if (apiKey1) headers["secret-key"] = apiKey1;
  if (apiKey2) headers["access-key"] = apiKey2;

  console.log(`📤 Sending to special university:`, {
    url: apiUrl,
    headers: Object.keys(headers),
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    console.log("hello", {
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: specialPayload,
      timeout: 15000,
    });
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: specialPayload,
      timeout: 15000,
    });

    const statusResult = processSpecialUniversityApiResponse(
      apiResponse,
      collegeName,
    );

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        specialPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Special university API error:`, error.message);
    throw error;
  }
}

async function handleManipalOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling Manipal Online: ${collegeName}`, { isPrimary });
  console.log(userResponse);
  const manipalPayload = [
    { Attribute: "FirstName", Value: userResponse.student_name || "" },
    {
      Attribute: "EmailAddress",
      Value:
        !isPrimary && studentEmail
          ? studentEmail
          : userResponse.student_email || "",
    },
    {
      Attribute: "Phone",
      Value:
        !isPrimary && studentPhone
          ? `${studentPhone}`
          : `${userResponse.student_phone}` || "",
    },
    { Attribute: "mx_course_applying_for", Value: "BBA" },
    { Attribute: "Source", Value: "Agents" },
    { Attribute: "Source Medium", Value: " NEPL" },
    {
      Attribute: "mx_Mobile",
      Value: userResponse.student_phone
        ? `+91-${userResponse.student_phone}`
        : "+91-9782135259",
    },
    { Attribute: "mx_Enquired_University", Value: "MUJ" },
  ];

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );
  const apiUrl =
    courseHeaderValue?.values?.API_URL ||
    courseHeaderValue?.values?.["api-url"];
  const apiKey = courseHeaderValue?.values?.["x-api-key"];
  const apiKey1 = courseHeaderValue?.values?.["secret-key"];
  const apiKey2 = courseHeaderValue?.values?.["access-key"];

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) headers["x-api-key"] = apiKey;
  if (apiKey1) headers["secret-key"] = apiKey1;
  if (apiKey2) headers["access-key"] = apiKey2;

  console.log(`📤 Sending to Manipal:`, {
    url: apiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    console.log("hello", manipalPayload, apiUrl, headers);
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: manipalPayload,
      timeout: 15000,
    });
    console.log(apiResponse, "api.response");
    const statusResult = processManipalApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        manipalPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Manipal API error:`, error.message);
    throw error;
  }
}

async function handleVivekanandGlobal(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling Vivekanand Global: ${collegeName}`, { isPrimary });

  const vivekanandPayload = [
    { Attribute: "FirstName", Value: userResponse.student_name || "" },
    {
      Attribute: "EmailAddress",
      Value:
        !isPrimary && studentEmail
          ? studentEmail
          : userResponse.student_email || "",
    },
    {
      Attribute: "Phone",
      Value:
        !isPrimary && studentPhone
          ? `+91 ${studentPhone}`
          : userResponse.student_phone
            ? `+91 ${userResponse.student_phone}`
            : "",
    },
    { Attribute: "ProspectID", Value: "45b5fded-e696-45a6-9fbb-c6af6178229e" },
    { Attribute: "SearchBy", Value: "Phone" },
    {
      Attribute: "RelatedCompanyId",
      Value: "82a19544-ef4f4cef-a09c-d68b939742f9",
    },
    { Attribute: "mx_Program", Value: "UG" },
    { Attribute: "mx_Course_Name", Value: "Bachelor of Computer Applications" },
    { Attribute: "mx_Elective_Specilization_pool", Value: "Block Chain " },
    { Attribute: "Source", Value: "Nuvora" },
  ];

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );
  const apiUrl =
    courseHeaderValue?.values?.API_URL ||
    courseHeaderValue?.values?.["api-url"];
  const apiKey = courseHeaderValue?.values?.["x-api-key"];
  const apiKey1 = courseHeaderValue?.values?.["secret-key"];
  const apiKey2 = courseHeaderValue?.values?.["access-key"];

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) headers["x-api-key"] = apiKey;
  if (apiKey1) headers["secret-key"] = apiKey1;
  if (apiKey2) headers["access-key"] = apiKey2;

  console.log(`📤 Sending to Vivekanand Global:`, {
    url: apiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: vivekanandPayload,
      timeout: 15000,
    });

    const statusResult = processVivekanandApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        vivekanandPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Vivekanand Global API error:`, error.message);
    throw error;
  }
}

async function handleLPUOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling LPU Online: ${collegeName}`, { isPrimary });

  const lpuOnlinePayload = {
    source: "324RJ0174",
    name: `${userResponse.student_name || ""} ${""}`.trim(),
    email:
      !isPrimary && studentEmail
        ? studentEmail
        : userResponse.student_email || "",
    mobile:
      !isPrimary && studentPhone
        ? studentPhone
        : userResponse.student_phone || "",
    state: "Punjab",
    city: "Chandigarh",
    field_new_specialization_for_new_widgets: "BBA",
    field_new_specialization: "BBA",
  };

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );
  const apiUrl =
    courseHeaderValue?.values?.API_URL ||
    courseHeaderValue?.values?.["api-url"];
  const apiKey1 = courseHeaderValue?.values?.["secret-key"];
  const apiKey2 = courseHeaderValue?.values?.["access-key"];

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey1 || apiKey2) {
    headers["secret-key"] = "f048d44ade6e3f910a8e5fe407b3b5fc";
    headers["access-key"] = "3344c49e16f54991b9c8e528a0ba0041";
  }

  console.log(`📤 Sending to LPU Online:`, {
    url: apiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: lpuOnlinePayload,
      timeout: 15000,
    });

    const statusResult = processLPUOnlineApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        lpuOnlinePayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ LPU Online API error:`, error.message);
    throw error;
  }
}

async function handleGLAOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling GLA Online: ${collegeName}`, { isPrimary });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );
  const baseApiUrl =
    courseHeaderValue?.values?.API_URL ||
    courseHeaderValue?.values?.["api-url"];

  if (!baseApiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const queryParams = new URLSearchParams({
    Name: sanitizeStudentName(userResponse.student_name) || "Harsh",
    DOB: "01/01/2000",
    EmailId:
      !isPrimary && studentEmail
        ? studentEmail
        : userResponse.student_email || "",
    Mobile:
      !isPrimary && studentPhone
        ? studentPhone
        : userResponse.student_phone || "",
    ProgramCode: "OGLABBA201",
    source: "Nuvora_Education_Pvt_Ltd",
    City: "0",
  });

  const fullApiUrl = `${baseApiUrl}?${queryParams.toString()}`;
  const headers = {};

  console.log(`📤 Sending to GLA Online:`, {
    url: fullApiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    const apiResponse = await axios({
      method: "GET",
      url: fullApiUrl,
      timeout: 15000,
    });

    const statusResult = processGLAApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        { url: fullApiUrl, method: "GET" },
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ GLA Online API error:`, error.message);
    throw error;
  }
}
function sanitizeStudentName(name) {
  if (!name || typeof name !== "string") return "Harsh";

  const trimmed = name.trim();

  // Reject NA / N-A / N/A etc
  if (/^(na|n\/a|none|null)$/i.test(trimmed)) {
    return "Harsh";
  }

  // Allow only English letters and spaces
  const englishNameRegex = /^[A-Za-z ]+$/;

  if (!englishNameRegex.test(trimmed)) {
    return "Harsh";
  }

  return trimmed;
}
function normalizePhoneNumber(phone) {
  if (!phone) return "";

  let cleaned = phone.toString().replace(/\D/g, "");

  if (cleaned.startsWith("91") && cleaned.length > 10) {
    cleaned = cleaned.slice(-10);
  }

  return cleaned.length === 10 ? cleaned : "";
}

async function handleGalgotiasOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling Galgotias Online: ${collegeName}`, { isPrimary });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );

  if (!courseHeaderValue?.values) {
    throw new Error("Course header values not found");
  }

  const apiUrl =
    courseHeaderValue.values.API_URL || courseHeaderValue?.values?.["api-url"];

  const secretKey = courseHeaderValue.values["Secret-key"];
  const accessKey = courseHeaderValue.values["Access-key"];

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (secretKey) headers["Secret-key"] = secretKey.trim();
  if (accessKey) headers["Access-key"] = accessKey;

  const transformedPayload = {};

  for (const [key, value] of Object.entries(courseHeaderValue.values)) {
    if (["API_URL", "Secret-key", "Access-key"].includes(key)) continue;

    if (typeof value === "string" && value.startsWith("student.")) {
      const userKey = value.replace("student.", "");

      const mapping = {
        phone_number: "student_phone",
        name: "student_name",
        email: "student_email",
      };

      const actualKey = mapping[userKey] || userKey;

      if (actualKey === "student_phone") {
        const phoneToUse =
          !isPrimary && studentPhone
            ? studentPhone
            : userResponse.student_phone;

        transformedPayload[key] = normalizePhoneNumber(phoneToUse);
        continue;
      }

      if (actualKey === "student_name") {
        transformedPayload[key] = sanitizeStudentName(
          userResponse.student_name,
        );
        continue;
      }

      if (actualKey === "student_email") {
        transformedPayload[key] =
          !isPrimary && studentEmail
            ? studentEmail
            : userResponse.student_email || "";
        continue;
      }

      transformedPayload[key] = userResponse[actualKey] || "";
    } else {
      transformedPayload[key] = value;
    }
  }

  console.log(`📤 Sending to Galgotias:`, {
    url: apiUrl,
    isPrimary,
    phone: transformedPayload?.mobile || transformedPayload?.phone,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers,
      data: transformedPayload,
      timeout: 15000,
    });

    const statusResult = processGalgotiasApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        transformedPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        normalizePhoneNumber(studentPhone || userResponse.student_phone),
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Galgotias API error:`, error.message);
    throw error;
  }
}

async function handleAmityOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
) {
  console.log(`🎯 Handling Amity Online: ${collegeName}`, { isPrimary });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );

  if (!courseHeaderValue?.values) {
    throw new Error("Course header values not found");
  }

  const apiUrl =
    courseHeaderValue.values.API_URL || courseHeaderValue?.values?.["api-url"];
  const apiKey = courseHeaderValue.values["x-api-key"];

  if (!apiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (apiKey) headers["x-api-key"] = apiKey;

  const transformedPayload = {};
  for (const [key, value] of Object.entries(courseHeaderValue.values)) {
    if (key === "API_URL" || key === "x-api-key") continue;

    if (key === "mx_AMS_ID") {
      transformedPayload[key] = Number(value);
      continue;
    }
    if (key === "mx_Whatsapp_Opt_in") {
      transformedPayload[key] = Number(value);
      continue;
    }

    if (typeof value === "string" && value.startsWith("student.")) {
      const userKey = value.replace("student.", "");
      const mapping = {
        phone_number: "student_phone",
        name: "student_name",
        email: "student_email",
      };
      const actualKey = mapping[userKey] || userKey;

      // For secondary contacts, override with provided email/phone
      if (!isPrimary) {
        if (actualKey === "student_email" && studentEmail) {
          transformedPayload[key] = studentEmail;
        } else if (actualKey === "student_phone" && studentPhone) {
          transformedPayload[key] = studentPhone;
        } else {
          transformedPayload[key] = userResponse[actualKey] || "";
        }
      } else {
        transformedPayload[key] = userResponse[actualKey] || "";
      }
    } else {
      transformedPayload[key] = value;
    }
  }

  console.log(`📤 Sending to Amity Online:`, {
    url: apiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    const apiResponse = await axios({
      method: "POST",
      url: apiUrl,
      headers: headers,
      data: transformedPayload,
      timeout: 15000,
    });

    const statusResult = processAmityOnlineApiResponse(
      apiResponse,
      collegeName,
    );

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        transformedPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Amity Online API error:`, error.message);
    throw error;
  }
}

async function handleMangalayatanOnline(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  console.log(`🎯 Handling Mangalayatan Online: ${collegeName}`, { isPrimary });

  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );

  if (!courseHeaderValue?.values) {
    throw new Error("Course header values not found");
  }

  const values = courseHeaderValue.values;
  const baseApiUrl = values.API_URL;

  if (!baseApiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const mangalayatanPayload = {};

  for (const [key, value] of Object.entries(values)) {
    if (key === "API_URL") continue;

    let finalValue;

    if (typeof value === "string" && value.startsWith("student.")) {
      const userKey = value.replace("student.", "");
      const mapping = {
        phone_number: "student_phone",
        preferred_state: "preferredState",
        name: "student_name",
        email: "student_email",
        preferred_city: "preferred_city",
      };
      const actualKey = mapping[userKey] || userKey;

      let userValue = userResponse[actualKey];

      if (Array.isArray(userValue)) {
        userValue = userValue.length > 0 ? userValue[0] : "";
      }

      if (!isPrimary) {
        if (actualKey === "student_email" && studentEmail) {
          userValue = studentEmail;
        } else if (actualKey === "student_phone" && studentPhone) {
          userValue = studentPhone;
        }
      }

      if (actualKey === "preferredState") {
        finalValue = userValue && userValue.trim() !== "" ? userValue : "";
      } else if (actualKey === "preferredCity") {
        finalValue = userValue && userValue.trim() !== "" ? userValue : "";
      } else if (actualKey === "phoneNumber" && userValue) {
        finalValue = `+91-${userValue}`;
      } else {
        finalValue = userValue || "";
      }
    } else {
      finalValue = value;
    }

    mangalayatanPayload[key] = finalValue;
  }

  const headers = {
    "Content-Type": "application/json",
  };

  console.log(`📤 Sending to Mangalayatan:`, {
    url: baseApiUrl,
    isPrimary,
    email:
      !isPrimary && studentEmail ? studentEmail : userResponse.student_email,
  });

  try {
    const apiResponse = await axios.post(baseApiUrl, mangalayatanPayload, {
      headers,
      timeout: 15000,
    });

    const statusResult = processMangalayatanApiResponse(
      apiResponse,
      collegeName,
    );

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        mangalayatanPayload,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Mangalayatan API error:`, error.message);
    throw error;
  }
}
async function CgcLandran(
  collegeName,
  userResponse,
  studentId,
  sendType,
  studentEmail,
  studentPhone,
  isPrimary,
  courseId,
) {
  const courseHeaderValue = await findHeaderValue(
    collegeName,
    courseId,
    studentId,
  );

  // if (!courseHeaderValue?.values) {
  //   throw new Error("Course header values not found");
  // }

  const defaultValues = {
    name: `${userResponse.student_name || ""} ${""}`.trim(),
    email:
      !isPrimary && studentEmail
        ? studentEmail
        : userResponse.student_email || "",
    college_id: "270",
    mobile:
      !isPrimary && studentPhone
        ? studentPhone
        : userResponse.student_phone || "",
    source: "nuvora",
    state: "Punjab",
    city: "Chandigarh",
    course: "B.Tech-CSE",
    secret_key: "b30c9bcd9fb18a82e41a505fae8490b2",
  };
  const values = courseHeaderValue?.values || defaultValues;
  const baseApiUrl =
    values?.API_URL || "https://api.nopaperforms.com/dataporting/270/nuvora";

  if (!baseApiUrl) {
    throw new Error("API URL not found in the course header values");
  }

  const cgcPayload = {};

  // for (const [key, value] of Object.entries(values)) {
  //   if (key === "API_URL") continue;

  //   let finalValue;

  //   if (typeof value === "string" && value.startsWith("student.")) {
  //     const userKey = value.replace("student.", "");
  //     const mapping = {
  //       phone_number: "student_phone",
  //       preferred_state: "preferredState",
  //       name: "student_name",
  //       email: "student_email",
  //       preferred_city: "preferred_city",
  //     };
  //     const actualKey = mapping[userKey] || userKey;

  //     let userValue = userResponse[actualKey];

  //     if (Array.isArray(userValue)) {
  //       userValue = userValue.length > 0 ? userValue[0] : "";
  //     }

  //     if (!isPrimary) {
  //       if (actualKey === "student_email" && studentEmail) {
  //         userValue = studentEmail;
  //       } else if (actualKey === "student_phone" && studentPhone) {
  //         userValue = studentPhone;
  //       }
  //     }

  //     if (actualKey === "preferredState") {
  //       finalValue = userValue && userValue.trim() !== "" ? userValue : "";
  //     } else if (actualKey === "preferredCity") {
  //       finalValue = userValue && userValue.trim() !== "" ? userValue : "";
  //     } else if (actualKey === "phoneNumber" && userValue) {
  //       finalValue = `+91-${userValue}`;
  //     } else {
  //       finalValue = userValue || "";
  //     }
  //   } else {
  //     finalValue = value;
  //   }

  //   cgcPayload[key] = finalValue;
  // }

  const headers = {
    "Content-Type": "application/json",
  };

  try {
    const apiResponse = await axios.post(baseApiUrl, defaultValues, {
      headers,
      timeout: 15000,
    });

    const statusResult = CgcApiResponse(apiResponse, collegeName);

    if (studentId) {
      await updateStudentShortlistStatus(
        studentId,
        collegeName,
        statusResult,
        defaultValues,
        apiResponse.data,
        headers,
        sendType,
        studentEmail || userResponse.student_email,
        studentPhone || userResponse.student_phone,
        isPrimary,
      );
    }

    return statusResult;
  } catch (error) {
    console.error(`❌ Mangalayatan API error:`, error.message);
    throw error;
  }
}
export const sentStatustoCollege = async (req, res) => {
  console.log("\n" + "=".repeat(60));
  console.log(`🚀 START: Sending status to college`);
  console.log("=".repeat(60));

  try {
    const {
      collegeName,
      studentId,
      sendType = "manual",
      studentData,
      studentEmail,
      studentPhone,
      isPrimary = true,
      courseId,
    } = req.body;

    console.log(`📋 Request Parameters:`, {
      collegeName,
      studentId,
      sendType,
      hasStudentData: !!studentData,
      studentEmail,
      studentPhone,
      isPrimary,
    });

    if (!collegeName) {
      console.error(`❌ Missing collegeName`);
      return res.status(400).json({
        success: false,
        message: "collegeName is required",
      });
    }

    const userResponse = await getStudentDataForRequest(
      studentId,
      studentData,
      studentEmail,
      studentPhone,
      isPrimary,
    );

    console.log(`✅ Student data retrieved:`, {
      email: userResponse.student_email,
      phone: userResponse.student_phone,
      name: userResponse.student_name,
    });

    const isSpecialUniversity =
      collegeName &&
      (collegeName.includes("Chandigarh University") ||
        (collegeName.includes("Amity University") &&
          !collegeName.includes("Online")));

    const isLPUOnline = collegeName?.includes(
      "Lovely Professional University Online",
    );
    const isManipalOnline =
      collegeName?.includes("Sikkim Manipal University Online") ||
      collegeName?.includes("Manipal University Online");
    const isVivekanandGlobal = collegeName?.includes(
      "Vivekanand Global University Online",
    );
    const isGLAOnline = collegeName?.includes("GLA University Online");
    const isGalgotiasOnline = collegeName?.includes(
      "Galgotias University Online",
    );
    const isAmityOnline = collegeName?.includes("Amity University Online");
    const isShooliniOnline = collegeName?.includes(
      "Shoolini University online",
    );
    const isMangalayatanOnline = collegeName?.includes(
      "Mangalayatan University online",
    );
    // Add this near other university detections
    const isJaypeeNoPaperForms = collegeName?.includes("Jaypee Institute");
    console.log(`🏫 University Detection:`, {
      isSpecialUniversity,
      isLPUOnline,
      isManipalOnline,
      isVivekanandGlobal,
      isGLAOnline,
      isGalgotiasOnline,
      isAmityOnline,
      isShooliniOnline,
      isMangalayatanOnline,
    });

    let statusResult;

    if (isSpecialUniversity) {
      console.log(`🔄 Routing to Special University handler`);
      statusResult = await handleSpecialUniversity(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isJaypeeNoPaperForms) {
      console.log(`🔄 Routing to Jaypee NoPaperForms handler`);
      statusResult = await handleJaypeeNoPaperForms(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isShooliniOnline) {
      console.log(`🔄 Routing to Shoolini Online handler`);
      statusResult = await handleShooliniOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isManipalOnline) {
      console.log(`🔄 Routing to Manipal Online handler`);
      statusResult = await handleManipalOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isVivekanandGlobal) {
      console.log(`🔄 Routing to Vivekanand Global handler`);
      statusResult = await handleVivekanandGlobal(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isLPUOnline) {
      console.log(`🔄 Routing to LPU Online handler`);
      statusResult = await handleLPUOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isGLAOnline) {
      console.log(`🔄 Routing to GLA Online handler`);
      statusResult = await handleGLAOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isGalgotiasOnline) {
      console.log(`🔄 Routing to Galgotias Online handler`);
      statusResult = await handleGalgotiasOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isAmityOnline) {
      console.log(`🔄 Routing to Amity Online handler`);
      statusResult = await handleAmityOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (isMangalayatanOnline) {
      console.log(`🔄 Routing to Mangalayatan Online handler`);
      statusResult = await handleMangalayatanOnline(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else if (
      collegeName.toLowerCase() ===
        "chandigarh group of colleges, landran (cgc)" ||
      collegeName.toLowerCase().includes("cgc")
    ) {
      statusResult = await CgcLandran(
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    } else {
      console.log(`🔄 Routing to Standard University handler`);
      statusResult = await processStandardUniversity(
        req,
        collegeName,
        userResponse,
        studentId,
        sendType,
        studentEmail,
        studentPhone,
        isPrimary,
        courseId,
      );
    }

    console.log(`🎉 Final Result: ${statusResult}`);

    return res.status(200).json({
      success: statusResult === "Proceed",
      message: statusResult,
      status: statusResult,
    });
  } catch (error) {
    console.error("\n" + "❌".repeat(20));
    console.error(`💥 ERROR in sentStatustoCollege:`, error.message);
    console.error(`Stack:`, error.stack);
    console.error("❌".repeat(20) + "\n");

    if (!error.response) {
      return handleApiError(
        error,
        res,
        req.body.studentId,
        req.body.collegeName,
        null,
        null,
        req.body.sendType || "manual",
        req.body.studentEmail,
        req.body.studentPhone,
        req.body.isPrimary ?? true,
      );
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    console.log("=".repeat(60));
    console.log(`🏁 END: Sending status to college`);
    console.log("=".repeat(60) + "\n");
  }
};
