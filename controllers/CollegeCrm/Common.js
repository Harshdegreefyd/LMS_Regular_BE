import collegeCuCRM from "../../models/crm/cu.js"; 
import collegeLpuCRM from "../../models/crm/lpu.js";
import { sendLeadToLPuCRM } from "./Lpu.js";
import { sendLeadToCuCRM } from './CU.js';
import sendMail from "../../config/SendEmail.js";
import { Op } from "sequelize";
export const Common = async (req, res) => {
  try {
    const { data } = req.body;
    let responseArray = [];

    for (const record of data) {
      const rowNumber = record.row;
      let lpu = false;
      let cu = false;

      const updatedResponse = {
        row: rowNumber,
        CU_Status: '',
        LPU_Status: '',
      };

      const [
        timestamp, name, email, mobile, city, state, preferred_degree, specialization,
        stream, remarks, level, budget, source, sourceUrl, secondary_email, whatsapp,
        Callng_Status, Sub_Calling_Status, mode, cta_name, form_name, currentcity,
        currentstate, utm_source, utm_medium, utm_keyword, utm_campaign, utm_campaign_id,
        utm_adgroup_id, utm_creative_id, agent_id, LPU_Status, CU_Status, CGC_Status
      ] = record.data;

      if (!email || !mobile) {
        responseArray.push({
          row: rowNumber,
          CU_Status: 'Missing Required Fields',
          LPU_Status: 'Missing Required Fields'
        });
        continue;
      }

      try {
        const LpuLead = await collegeLpuCRM.findOne({
          where: {
            [Op.or]: [{ student_email: email }, { student_phone: mobile }]
          }
        });

        if (LpuLead) {
          updatedResponse.LPU_Status = 'Already Exists';
          lpu = true;
        }

        const CuLead = await collegeCuCRM.findOne({
          where: {
            [Op.or]: [{ student_email: email }, { student_phone: mobile }]
          }
        });

        if (CuLead) {
          updatedResponse.CU_Status = 'Already Exists';
          cu = true;
        }

        if (!lpu) {
          try {
            const field_program = preferred_degree || 'B.Tech. (Computer Science and Engineering (CSE))';
            const resdata = {
              name: name,
              email: email,
              mobile: mobile,
              state: state || '',
              field_program: field_program,
              field_session: "Session 2026",
              college_id: "524",
              source: "nuvora",
              college_name: "LPU",
              secret_key: "b061b6abae687fbd43e1bc2260c04b6a",
            };

            const response = await sendLeadToLPuCRM(resdata);
            console.log(response);

            const newLead = await collegeLpuCRM.create({
              student_name: resdata.name,
              student_email: resdata.email,
              student_phone: resdata.mobile,
              state: resdata.state,
              field_program: resdata.field_program,
              field_session: resdata.field_session,
              college_id: resdata.college_id,
              source: resdata.source,
              college_name: resdata.college_name,
              response_Status: response.status,
              response_Message: response.message,
              LeadGeneratedBy: 'Google Sheets'
            });

            await newLead.save();
            updatedResponse.LPU_Status = response.message || 'Success';
          } catch (lpuError) {
            console.error("LPU Error:", lpuError);
            updatedResponse.LPU_Status = lpuError.message || 'Error Sending Lead';
          }
        }

        // CU Submission with Sequelize
        if (!cu) {
          try {
            const mx_Program_Code_New = 'CS201';
            const mx_Program_New = 'Bachelor of Engineering (Computer Science and Engineering)';
            const DateOfBirth = '01-01-2001';
            const campus = 'Mohali';

            const resdata = [
              { Attribute: "FirstName", Value: name },
              { Attribute: "EmailAddress", Value: email },
              { Attribute: "Phone", Value: mobile },
              { Attribute: "Source", Value: "nuvora" },
              { Attribute: "mx_Program_Code_New", Value: mx_Program_Code_New },
              { Attribute: "mx_Program_New", Value: mx_Program_New },
              { Attribute: "mx_Discipline_New", Value: 'CSE' },
              { Attribute: "State", Value: state || 'Punjab' },
              { Attribute: "City", Value: city || 'Mohali' },
              { Attribute: "Date of Birth", Value: DateOfBirth },
              { Attribute: "Campus", Value: campus },
            ];

            const response = await sendLeadToCuCRM(resdata);

            let responseStatus = "Success";
            let isCreated = response?.Message?.IsCreated || false;
            let responseMessageId = response?.Message?.Id || null;
            let responseRelatedId = response?.Message?.RelatedId || null;

            if (!response) {
              responseStatus = "No response from API";
            } else if (!isCreated) {
              responseStatus = "Email already exists in their System";
            } else if (response.error) {
              responseStatus = "Error: " + response.error;
            } else {
              responseStatus = response.Status || "Unknown";
            }

            await collegeCuCRM.create({
              student_name: name,
              student_email: email,
              student_phone: mobile,
              source: "nuvora",
              mx_program_code_new: mx_Program_Code_New,
              mx_program_new: mx_Program_New,
              mx_discipline_new: 'CSE',
              state: state || 'Punjab',
              city: city || 'Mohali',
              date_of_birth: DateOfBirth,
              campus: campus,
              response_message_id: responseMessageId,
              response_message_related_id: responseRelatedId,
              response_message_is_created: isCreated,
              response_status: responseStatus,
              lead_generated_by: "Google Sheets",
            });

            updatedResponse.CU_Status = responseStatus;

          } catch (cuError) {
            console.error("CU Error:", cuError);
            updatedResponse.CU_Status = 'Error Sending Lead';
          }
        }

        // Optional Email Notification
        if (!cu && !lpu) {
          await sendMail({
            name: name,
            email: email,
            phone: mobile,
            timestamp: timestamp,
            stream: stream,
            source: source,
            sourceUrl: sourceUrl,
            utm_keyword: utm_keyword,
            utm_campaign: utm_campaign
          }, [
            'Bhuwan@degreefyd.com',
            'Sid@degreefyd.com',
            'Deepak@degreefyd.com',
            'Vinay.sharma@degreefyd.com',
            'Shubham.singh@degreefyd.com'
          ]);
        }

        responseArray.push(updatedResponse);

      } catch (innerError) {
        console.error("Error processing record:", innerError);
        responseArray.push({
          row: rowNumber,
          LPU_Status: 'Processing Error',
          CU_Status: 'Processing Error',
        });
      }
    }

    res.status(201).json({
      message: "Lead Data Sending completed",
      responseArray
    });

  } catch (error) {
    console.error("Main error:", error);
    res.status(500).json({
      message: "Error sending lead",
      error: error.response ? error.response.data : error.message
    });
  }
};
