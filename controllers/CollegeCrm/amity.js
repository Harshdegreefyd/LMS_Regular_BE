import axios from 'axios';
import AmityRequestAndResponse from '../../models/crm/amity.js'; 

// Helper function to send lead to Amity CRM
export const sendLeadToCuCRM = async (leadData) => {
  try {
    const response = await axios.post(
      'https://publisher-api.customui.leadsquared.com/api/leadCapture/MjQzMDA=/?token=57bc1212-d054-47dd-a481-0c2729bc2c38',
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

// Main controller

export const AmityCrm = async (req, res) => {
  const body = req.body;

  try {
    const existingLead = await AmityRequestAndResponse.findOne({
      where: {
        student_email: body?.email,
        student_phone: body?.phoneNumber,
      },
    });

    if (existingLead) {
      return res.status(200).json({ status: true, message: 'Lead already exists' });
    }

    const reqData = [
      { Attribute: 'FirstName', Value: body?.firstName },
      { Attribute: 'LastName', Value: '' },
      { Attribute: 'EmailAddress', Value: body?.email },
      { Attribute: 'Phone', Value: body?.phoneNumber },
      { Attribute: 'Source', Value: 'nuvora' },
      { Attribute: 'SourceCampaign', Value: 'utm_campaign' },
      { Attribute: 'SourceMedium', Value: 'utm_medium' },
      { Attribute: 'mx_Campus', Value: body?.campus },
      { Attribute: 'mx_Course2', Value: body?.course },
      { Attribute: 'mx_State', Value: body?.state },
      { Attribute: 'mx_City', Value: body?.city },
    ];

    const response = await sendLeadToCuCRM(reqData);

    const responseStatus = response?.Status || (response?.error ? 'Email already exists' : 'No response from API');
    const responseMessageId = response?.MessageId || null;
    const responseRelatedId = response?.RelatedId || null;
    const isCreated = response?.IsCreated || false;

    await AmityRequestAndResponse.create({
      student_name: body?.firstName,
      student_email: body?.email,
      student_phone: body?.phoneNumber,
      source: 'nuvora',
      source_medium: 'utm_medium',
      source_campaign: 'utm_campaign',
      course: body?.course,
      state: body?.state,
      city: body?.city,
      campus: body?.campus,
      response_message_id: responseMessageId,
      response_message_related_id: responseRelatedId,
      response_message_is_created: isCreated,
      response_status: responseStatus,
      lead_generated_by: 'Landing Page',
    });

    return res.status(201).json({ message: 'Lead data sending completed', status: true });

  } catch (e) {
    console.error('Amity CRM Error:', e);
    return res.status(500).json({ message: 'An error occurred', status: false });
  }
};

