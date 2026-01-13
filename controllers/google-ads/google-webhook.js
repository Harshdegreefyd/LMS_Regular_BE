import axios from 'axios';
import GoogleWebHook from '../../models/ads/google.js'
import sendMail from '../../config/MetaEmail.js';
import Campaign from '../../models/Campaign_id_mapping.js';
import { mapAnswersByKeyword } from '../../utils/keywords.js'
import { sequelize, Student, LeadAssignmentLogs, LastassignOnline, Counsellor } from "../../models/index.js";
import { col, fn, Op, Sequelize, where } from 'sequelize';

export const Postwebhook = async (req, res) => {
  try {
    const leadData = req.body;

    if (leadData.google_key !== process.env.GOOGLE_LEAD_TOKEN) {
      return res.status(403).send('Forbidden');
    }

    res.status(200).send('OK');

    const formattedLead = mapGoogleLead(leadData);
    const mappedValues = await Campaign.findOne({
      where: {
        campign_id: formattedLead.campaign_id
      }
    })
    const existing = await GoogleWebHook.findOne({
      where: {
        form_id: formattedLead.form_id,
        email: formattedLead.email,
        phone_number: formattedLead.phone_number,
      },
    });
console.log(formattedLead,"amy test")
    if (!existing) {
      await GoogleWebHook.create(formattedLead);
    } 

    // await sendMail({
    //   name: formattedLead.full_name,
    //   email: formattedLead.email,
    //   phone: formattedLead.phone_number,
    //   timestamp: formattedLead.created_time,
    //   stream: formattedLead.email,
    //   source: 'Google_Lead_Form',
    //   sourceUrl: formattedLead.form_id,
    //   utm_campaign: formattedLead.campaign_id,
    //   utm_campaign_id: formattedLead.campaign_id || 'Unknown Campaign ID',
    //   form_id: formattedLead.form_id,
    // }, [
    //   'Bhuwan@degreefyd.com',
    //   'Sid@degreefyd.com',
    //   'Deepak@degreefyd.com',
    //   'Vinay.sharma@degreefyd.com',
    // ]);
console.log("trigger1")
    await forwardToStudentAPI(formattedLead, mappedValues);
  } catch (error) {
    console.error('Error processing lead webhook:', error.message);
    res.status(500).send('Internal Server Error');
  }
};

const mapGoogleLead = (lead) => {
  console.log(lead)
  const fieldMappings = {
    full_name: ['FULL_NAME', 'full_name', 'name', 'Name', 'Full Name'],
    email: ['EMAIL', 'email', 'Email', 'User Email'],
    phone_number: ['PHONE_NUMBER', 'MOBILE_NUMBER', 'mobile', 'phone', 'User Phone'],
    city: ['CITY', 'city', 'City'],
  };

  const result = {
    created_time: new Date(),
    full_name: null,
    email: null,
    phone_number: null,
    city: null,
    form_id: String(lead.form_id),
    campaign_id: String(lead.campaign_id),
    additional_fields: [],
  };

  if (Array.isArray(lead.user_column_data)) {
    for (const field of lead.user_column_data) {
      let matched = false;

      for (const [key, variants] of Object.entries(fieldMappings)) {
        if (variants.includes(field.column_id) || variants.includes(field.column_name)) {
          result[key] = field.string_value || null;
          matched = true;
          break;
        }
      }

      if (!matched) {
        result.additional_fields.push({
          question: field.column_name || field.column_id,
          answer: field.string_value || '',
        });
      }
    }
  }

  return result;
};

const forwardToStudentAPI = async (formattedLead, mappedValues) => {
  try {
    console.log(formattedLead,"new trigger1")
    let student_extra_details = mapAnswersByKeyword(formattedLead?.additional_fields)
    await axios.post('http://localhost:3031/v1/student/create', {
      name: formattedLead.full_name,
      phone_number: formattedLead.phone_number?.length === 13
        ? formattedLead.phone_number.slice(3)
        : formattedLead.phone_number || '',
      email: formattedLead.email,
      preferred_city: formattedLead.city || "",
      source: 'Google_Lead_Form',
      preferred_state: mappedValues ? mappedValues?.state : '',
      preferredDegree: mappedValues ? mappedValues?.degree : '',
      mode: mappedValues ? mappedValues.mode : 'Online',
      campign_name: mappedValues ? mappedValues?.campign_name : '',
      stream: mappedValues ? mappedValues?.stream : '',
      sourceUrl: formattedLead.form_id,
      form_name: formattedLead.form_id,
      utm_campaign: formattedLead.campaign_id,
      utm_campaign_id: formattedLead?.campaign_id || 'Unknown Campaign ID',
      student_comment: formattedLead?.additional_fields,
      ...student_extra_details
    });
  } catch (err) {
    console.error('Failed to forward lead to student API:', err.message);
  }
};



export const Func1Controller = async (req, res) => {
  let { data } = req.body;

  if (!data) {
    return res.status(400).json({ error: "No lead data provided." });
  }

  const leads = Array.isArray(data) ? data : [data];

  if (leads.length === 0) {
    return res.status(400).json({ error: "Lead array is empty." });
  }

  try {
    const results = [];

    for (const lead of leads) {
      const phone = lead.phone_number
        ? lead.phone_number.replace(/\D/g, '').slice(-10)
        : null;

      const email = lead.email?.toLowerCase() || null;
      const exists = await Student.findOne({
        where: {
          [Op.or]: [
            phone
              ? where(
                  fn('right', fn('regexp_replace', col('student_phone'), '\\D', '', 'g'), 10),
                  phone
                )
              : null,
            email
              ? where(fn('lower', col('student_email')), email)
              : null,
          ].filter(Boolean), 
        },
      });

      if (exists) {
        results.push({
          lead: lead.form_id,
          status: "skipped",
          message: "Student already exists in DB",
        });
        continue; 
      }

      try {
        const response = await forwardToStudentAPI(lead, null);

        results.push({
          lead: lead.form_id,
          status: "success",
          data: response?.data || null, 
        });

      } catch (apiError) {
        console.error(`Error forwarding lead ${lead.form_id}:`, apiError.message);

        results.push({
          lead: lead.form_id,
          status: "failed",
          message: apiError.message,
        });
      }
    }

    return res.status(200).json({
      message: "Lead(s) processed successfully",
      results,
    });
  } catch (error) {
    console.error("Error in Func1Controller:", error.message);
    return res.status(500).json({
      error: "Failed to process lead(s)",
      details: error.message,
    });
  }
};






export const func1 = async (formattedLead) => {
  const res = await axios.post('http://localhost:3031/v1/student/create', {
    name: formattedLead.full_name,
    phone_number: formattedLead.phone_number
      ? formattedLead.phone_number.slice(-10)
      : '',
    email: formattedLead.email,
    preferred_city: formattedLead.city,
    source: 'Google_Lead_Form',
    form_name: formattedLead.form_id,
    mode: 'Online',
    sourceUrl: formattedLead.form_id,
    utm_campaign: formattedLead?.campaign_id,
    utm_campaign_id: formattedLead?.campaign_id || 'Unknown Campaign ID',
    student_comment: formattedLead?.additional_fields,
  });
  return res;
};
