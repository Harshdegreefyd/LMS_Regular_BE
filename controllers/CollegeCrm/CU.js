import axios from 'axios';
import CuRequestAndResponse from '../../models/crm/cu.js'; 
import { Op } from 'sequelize';
// Helper to send lead data to CU CRM
export const sendLeadToCuCRM = async (leadData) => {
  try {
    const response = await axios.post(
      'https://publisher-api.customui.leadsquared.com/api/leadCapture/NzA4MjM=/?token=57bc1212-d054-47dd-a481-0c2729bc2c38',
      leadData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(
      'Error sending data:',
      error.response ? error.response.data : error.message
    );
    return {
      error: error.response ? error.response.data?.error : error.message,
    };
  }
};

export const CuCrm = async (req, res) => {
  try {
    const { data } = req.body;
    let responseArray = [];

    for (const record of data) {
      const rowNumber = record.row;
      const [
        _,
        name,
        email,
        mobile,
        mx_Program_Code_New,
        mx_Program_New,
        mx_Discipline_New,
        DateOfBirth,
        city,
        state,
        campus,
      ] = record.data;

      if (!email || !mobile || !state) {
        responseArray.push({ row: rowNumber, status: 'Missing Required Fields' });
        continue;
      }

      // Duplicate check
      const existingLead = await CuRequestAndResponse.findOne({
        where: {
          [Op.and]: [
            { student_email: email },
            { student_phone: mobile },
          ],
        },
      });

      if (existingLead) {
        console.log(`Duplicate found: ${email}`);
        responseArray.push({ row: rowNumber, status: 'Already Exists' });
        continue;
      }

      // Prepare CU CRM payload
      const resdata = [
        { Attribute: 'FirstName', Value: name },
        { Attribute: 'EmailAddress', Value: email },
        { Attribute: 'Phone', Value: mobile },
        { Attribute: 'Source', Value: 'nuvora' },
        { Attribute: 'mx_Program_Code_New', Value: mx_Program_Code_New },
        { Attribute: 'mx_Program_New', Value: mx_Program_New },
        { Attribute: 'mx_Discipline_New', Value: mx_Discipline_New },
        { Attribute: 'State', Value: state },
        { Attribute: 'City', Value: city },
        { Attribute: 'Date of Birth', Value: DateOfBirth },
        { Attribute: 'Campus', Value: campus },
      ];

      // Send to CU CRM
      const response = await sendLeadToCuCRM(resdata);

      let responseStatus = 'Success';
      let messageId = null;
      let relatedId = null;
      let isCreated = null;

      if (!response) {
        responseStatus = 'No response from API';
      } else if (response.error) {
        responseStatus = 'Email already exists';
      } else {
        responseStatus = response.Status || 'Unknown';
        messageId = response.MessageId || null;
        relatedId = response.RelatedId || null;
        isCreated = response.IsCreated || null;
      }

      try {
        await CuRequestAndResponse.create({
          student_name: name,
          student_email: email.toLowerCase(),
          student_phone: mobile,
          mx_program_code_new: mx_Program_Code_New,
          mx_program_new: mx_Program_New,
          mx_discipline_new: mx_Discipline_New,
          state,
          city,
          date_of_birth: DateOfBirth,
          campus,
          source: 'nuvora',
          response_status: responseStatus,
          response_message_id: messageId,
          response_message_related_id: relatedId,
          response_message_is_created: isCreated,
          lead_generated_by: 'Google Sheets',
        });

        responseArray.push({ row: rowNumber, status: responseStatus });
      } catch (e) {
        responseArray.push({ row: rowNumber, status: e.message || 'DB Save Failed' });
      }
    }

    res.status(201).json({ message: 'Lead Data Sending completed', responseArray });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error sending lead',
      error: error.message || 'Internal Server Error',
    });
  }
};