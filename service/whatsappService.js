import axios from "axios";
import Student from "../models/Student.js";
import {
  MEDIA_API_BASE,
  WHATSAPP_USER,
  WHATSAPP_PASS,
  FROM_NUMBER,
  MESSAGES,
} from "../config/whatsappConfig.js";

const validatePhoneNumber = (phone) => {
  const phoneRegex = /^[6-9]\d{9}$/;
  return phoneRegex.test(phone);
};

const formatPhoneNumber = (phone) => {
  let cleaned = phone.replace(/\D/g, "");

  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.length === 10) {
    return "91" + cleaned;
  }
  return cleaned;
};

export const sendNotInterestedFollowup = async (
  studentId,
  phone,
  dayNumberOrTemplate,
  customTemplateId = null
) => {
  try {
    let templateId;
    
    if (customTemplateId) {
      templateId = customTemplateId;
    } else {
      const dayNumber = dayNumberOrTemplate;
      const messageConfig = MESSAGES[`DAY_${dayNumber}`];
      
      if (!messageConfig) {
        throw new Error(`No message configuration found for day ${dayNumber}`);
      }
      
      templateId = messageConfig.templateId;
    }

    if (!validatePhoneNumber(phone)) {
      throw new Error("Invalid phone number format");
    }

    const studentData = await Student.findOne({
      where: { student_id: studentId },
      attributes: [
        "student_id",
        "student_phone",
        "student_name",
        "student_email",
        "whatsapp",
      ],
    });

    if (!studentData) {
      throw new Error("Student not found");
    }

    const placeholders = {
      0: studentData.student_name || "Student",
    };

    const messageData = {
      to: formatPhoneNumber(phone),
      templateid: templateId,
      from: FROM_NUMBER,
      smsgid: "Nuvora",
      placeholders: [placeholders],
      url: "",
      filename: "",
    };

    const whatsappPayload = {
      user: WHATSAPP_USER,
      pass: WHATSAPP_PASS,
      student: studentId,
      whatsapptosend: [messageData],
    };

    console.log(`📤 Sending WhatsApp request:`);
    console.log(`   Template: ${templateId}`);
    console.log(`   To: ${formatPhoneNumber(phone)}`);
    console.log(`   Student: ${studentId}`);

    const response = await axios.post(
      `${MEDIA_API_BASE}/mediasend`,
      whatsappPayload,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      },
    );

    console.log(
      `📩 WhatsApp API Response:`,
      JSON.stringify(response.data, null, 2),
    );

    if (response.data && Array.isArray(response.data)) {
      const result = response.data[0];
      if (result.Error === "0x204") {
        console.log(`✅ Message sent to ${result.to}`);
        return {
          success: true,
          messageId: `day_${dayNumberOrTemplate}_${Date.now()}`,
          templateUsed: templateId,
          phone: result.to,
        };
      } else if (result.Error && result.Error !== "0x204") {
        throw new Error(`WhatsApp API error: ${result.Error} for ${result.to}`);
      }
    }

    if (response.status === 200) {
      console.log(
        `✅ Successfully sent message to student ${studentId}`,
      );
      return {
        success: true,
        messageId: response.data?.messageId || `msg_${Date.now()}`,
        templateUsed: templateId,
      };
    }

    throw new Error(
      "Failed to send message: " + (response.data?.message || "Unknown error"),
    );
  } catch (error) {
    console.error(
      `❌ Error sending message to student ${studentId}:`,
      error.message,
    );

    if (error.response) {
      console.error(`   Response status: ${error.response.status}`);
      console.error(
        `   Response data:`,
        JSON.stringify(error.response.data, null, 2),
      );
    } else if (error.request) {
      console.error(`   No response received:`, error.request);
    }

    return {
      success: false,
      error: error.message,
      studentId,
    };
  }
};

export const getTemplateForDaysDifference = (daysDifference) => {
  let dayNumber;
  let templateId;
  
  switch(daysDifference) {
    case 0:
      dayNumber = 0;
      templateId = "not_connected_template";
      break;
    case 1:
      dayNumber = 1;
      templateId =  "not_connected_template_day2";
      break;
    case 2:
      dayNumber = 2;
      templateId = "not_connected_template_day3";
      break;
    case 3:
      dayNumber = 3;
      templateId = "not_connected_template_day4";
      break;
    case 4:
      dayNumber = 4;
      templateId = "not_connected_template_day5";
      break;
    default:
      return null;
  }
  
  return { dayNumber, templateId };
};