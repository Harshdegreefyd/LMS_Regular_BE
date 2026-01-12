import axios from 'axios';
import LpuRequestAndResponse from '../../models/crm/lpu.js'; 

export const sendLeadToLPuCRM = async (leadData) => {
  try {
    const response = await axios.post(
      'https://lpuapi.nopaperforms.com/dataporting/524/Nuvora',
      leadData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    console.error(error);
    console.error('Error sending data:', error.response ? error.response.data : error.message);
    return {
      status: 'Failed',
      message: error.response?.data?.message || error.message || 'Unknown error',
    };
  }
};

export const LPUCrm = async (req, res) => {
  try {
    const { data } = req.body;
    let responseArray = [];

    for (const record of data) {
      const rowNumber = record.row;
      const [_, name, email, mobile, field_program, state] = record.data;

      if (!email || !mobile || !state) {
        responseArray.push({ row: rowNumber, status: 'Missing Required Fields' });
        continue;
      }

      try {
        const existingLead = await LpuRequestAndResponse.findOne({
          where: {
            [Op.or]: [{ student_email: email }, { student_phone: mobile }],
          },
        });

        if (existingLead) {
          responseArray.push({ row: rowNumber, status: 'Already Exists' });
          continue;
        }

        const resdata = {
          name,
          email,
          mobile,
          state,
          field_program: field_program || 'B.Tech. (Computer Science and Engineering (CSE))',
          field_session: 'Session 2026',
          college_id: '524',
          source: 'nuvora',
          college_name: 'LPU',
          secret_key: 'b061b6abae687fbd43e1bc2260c04b6a',
        };

        const response = await sendLeadToLPuCRM(resdata);

        await LpuRequestAndResponse.create({
          student_name: resdata.name,
          student_email: resdata.email,
          student_phone: resdata.mobile,
          state: resdata.state,
          field_program: resdata.field_program,
          field_session: resdata.field_session,
          college_id: resdata.college_id,
          college_name: resdata.college_name,
          lead_generated_by: 'Google Sheets',
          response_status: response.status,
          response_message: response.message,
        });

        responseArray.push({ row: rowNumber, status: response.message });
      } catch (innerError) {
        responseArray.push({
          row: rowNumber,
          status:
            innerError.response?.data?.message ||
            innerError.message ||
            'Unknown Error',
        });
      }
    }

    res.status(201).json({ message: 'Lead Data Sending completed', responseArray });
  } catch (error) {
    res.status(500).json({ message: 'Error processing leads', error: error.message });
  }
};
export const LPUCrmForLandingPage = async (req, res) => {
  const { data } = req.body;

  try {
    const resdata = {
      name: data.name,
      email: data.email,
      mobile: data.phoneNumber,
      state: 'Punjab',
      field_program: 'B.Tech. (Computer Science and Engineering (CSE))',
      field_session: 'Session 2026',
      college_id: '524',
      source: 'nuvora',
      college_name: 'LPU',
      secret_key: 'b061b6abae687fbd43e1bc2260c04b6a',
    };

    const response = await sendLeadToLPuCRM(resdata);

    await LpuRequestAndResponse.create({
      student_name: resdata.name,
      student_email: resdata.email,
      student_phone: resdata.mobile,
      state: resdata.state,
      field_program: resdata.field_program,
      field_session: resdata.field_session,
      college_id: resdata.college_id,
      college_name: resdata.college_name,
      lead_generated_by: 'Landing Page',
      response_status: response.status,
      response_message: response.message,
    });

    res.status(201).send({ status: true });
  } catch (e) {
    res.status(200).send('Internal Error');
  }
};
