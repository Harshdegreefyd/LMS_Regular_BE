import axios from 'axios';
import MetaAdsToken from '../../models/ads/meta-token.js';
import MetaAdsLead from '../../models/ads/meta.js';
import sendMail from '../../config/MetaEmail.js';
import {mapAnswersByKeyword} from '../../utils/keywords.js'
export const Webhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.meta_token) {
      console.log('Webhook verified');
      return res.status(200).send(challenge);
    }
  }
  return res.sendStatus(403);
};

export const PostWebhook = async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    res.status(200).send('EVENT_RECEIVED');

    (async () => {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const lead_id = change.value.leadgen_id;

            try {
              const data = await fetchLeadDataWithCampaign(lead_id);
              if (!data) {
                console.error('Failed to fetch lead and campaign details');
                continue;
              }

              const leadDetails = data.lead;
              const campaignDetails = data.campaign;

              const existing = await MetaAdsLead.findOne({
                where: { form_id: leadDetails.id },
              });

              if (existing) {
                console.log('Duplicate lead, skipping...');
                continue;
              }

              const formattedLead = {
                created_time: new Date(leadDetails.created_time),
                full_name: extractFieldValue(leadDetails.field_data, ['Full name', 'full_name', 'name']),
                email: extractFieldValue(leadDetails.field_data, ['Email']),
                phone_number: extractFieldValue(leadDetails.field_data, [
                  'phone_number', 'Phone number', 'Phone', 'Mobile number'
                ]),
                city: extractFieldValue(leadDetails.field_data, ['City']),
                form_id: leadDetails.id,
                campaign_name: leadDetails?.ad_name,
                source_url: campaignDetails?.name || '',
                additional_fields: extractAdditionalFields(leadDetails.field_data),
              };

              await MetaAdsLead.create(formattedLead);

              await sendMail({
                name: formattedLead.full_name,
                email: formattedLead.email,
                phone: formattedLead.phone_number?.slice(3),
                timestamp: formattedLead.created_time,
                stream: formattedLead.email,
                source: 'FaceBook_University_Admit',
                sourceUrl: leadDetails.id,
                ad_name: leadDetails?.name || 'Unknown Campaign',
                utm_campaign: leadDetails?.ad_name || 'Unknown Campaign',
                utm_campaign_id: leadDetails?.ad_id || 'Unknown Campaign ID',
                form_id: leadDetails.id,
              }, [
                'Bhuwan@degreefyd.com',
                'Sid@degreefyd.com',
                'Deepak@degreefyd.com',
                'Vinay.sharma@degreefyd.com',
              ]);
          let student_comment=formatToQuestionAnswerArray(formattedLead.additional_fields)
          let student_extra_details=mapAnswersByKeyword(student_comment)
              await axios.post('http://localhost:3031/v1/student/create', {
                name: formattedLead.full_name,
                phone_number: formattedLead.phone_number?.length === 13
                  ? formattedLead.phone_number?.slice(3)
                  : formattedLead.phone_number,
                email: formattedLead.email,
                preferred_city: formattedLead.city,
                source: 'FaceBook_University_Admit',
                form_name: leadDetails.id,
                mode: 'Online',
                sourceUrl: campaignDetails?.name || '',
                utm_campaign: leadDetails?.ad_name || '',
                utm_campaign_id: leadDetails?.ad_id || '',
                student_comment: student_comment,
                student_current_city:formattedLead.city,
                ...student_extra_details
              });

              console.log('Lead saved and forwarded successfully');
            } catch (err) {
              console.error('Error processing lead:', err.message);
            }
          }
        }
      }
    })();
  } else {
    res.sendStatus(404);
  }
};

async function fetchLeadDataWithCampaign(id) {
  try {
    const tokenData = await MetaAdsToken.findOne({
      where: { page_id:'718284908040065' },
    });

    if (!tokenData) throw new Error('No page token found in DB');
    const accessToken = tokenData.page_access_token;

    const leadUrl = `https://graph.facebook.com/v19.0/${id}?fields=ad_id,ad_name,field_data,created_time&access_token=${accessToken}`;
    const leadResponse = await axios.get(leadUrl);
    const leadData = leadResponse.data;
    const adId = leadData.ad_id;

    if (!adId) {
      console.log('No ad_id found in lead data');
      return { lead: leadData, campaign: null };
    }

    const adUrl = `https://graph.facebook.com/v19.0/${adId}?fields=campaign_id&access_token=${accessToken}`;
    const adResponse = await axios.get(adUrl);
    const campaignId = adResponse.data.campaign_id;

    if (!campaignId) {
      console.log('No campaign_id found for ad:', adId);
      return { lead: leadData, campaign: null };
    }

    const campaignUrl = `https://graph.facebook.com/v19.0/${campaignId}?fields=name,status,buying_type&access_token=${accessToken}`;
    const campaignResponse = await axios.get(campaignUrl);
    const campaignData = campaignResponse.data;

    return { lead: leadData, campaign: campaignData };
  } catch (err) {
    console.error('Error fetching lead or campaign data:', err.message);
    return null;
  }
}

function extractFieldValue(fieldDataArray, possibleNames) {
  const lowerCaseNames = possibleNames.map(name => name.toLowerCase());
  const field = fieldDataArray?.find(f => lowerCaseNames.includes(f.name.trim().toLowerCase()));
  return field ? field.values[0] : null;
}

function extractAdditionalFields(fieldDataArray) {
  const standardFields = ['full_name', 'email', 'phone_number', 'city'];
  const additional = {};
  for (const field of fieldDataArray) {
    const key = field.name.trim().toLowerCase().replace(/\s+/g, '_');
    if (!standardFields.includes(key) && Array.isArray(field.values) && field.values.length > 0) {
      additional[field.name] = field.values[0];
    }
  }
  return additional;
}



export const Manual = async (req, res) => {
  const ids = [1928450754646775, 1262950458673098];
  try {
    const response = [];

    for (const form_id of ids) {
      const lead = await MetaAdsLead.findOne({ where: { form_id } });

      if (!lead) {
        response.push(`Lead with form_id ${form_id} not found`);
        continue;
      }

      await axios.post('http://localhost:3031/v1/student/create', {
        name: lead.full_name || '',
        phone_number: lead.phone_number?.length >= 13
          ? lead.phone_number.slice(3)
          : lead.phone_number || '',
        email: lead.email || '',
        preferred_city: lead.city || '',
        source: 'FaceBook_University_Admit',
        form_name: lead.form_id,
        sourceUrl: lead.source_url || '',
        utm_campaign: lead.campaign_name || '',
        utm_campaign_id: lead.form_id,
        student_comment: formatToQuestionAnswerArray(lead.additional_fields || {}),
        mode: 'Online',
      });

      console.log(`Lead ${form_id} posted successfully`);
      response.push(`Lead ${form_id} posted successfully`);
    }

    return res.status(200).json({
      message: 'Leads processed.',
      response,
      length: response.length,
    });
  } catch (error) {
    console.error('Error inserting leads:', error.message);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
};
export const Manual1 = async (req, res) => {
  const { lead } = req.body;
  const response = []; 

  try {
    await axios.post('http://localhost:3031/v1/student/create', {
      name: lead.full_name ?? '',
      phone_number:
        lead?.phone_number?.length >= 13
          ? lead?.phone_number.slice(3)
          : lead?.phone_number ?? '',
      email: lead.email ?? '',
      preferred_city: lead.city ?? '',
      source: 'FaceBook',
      form_name: lead.form_id,
      sourceUrl: lead.sourceUrl || lead.form_id || '',
      utm_campaign: lead.campaign_name ?? '',
      utm_campaign_id: lead.form_id,
      student_comment: formatToQuestionAnswerArray(lead?.additional_fields ?? {}),
      mode: 'Online',
    });

    response.push(`Lead ${lead.form_id} posted successfully`);
  } catch (err) {
    console.error(`Error posting lead ${lead?.form_id}:`, err.message);
    response.push(`Failed to post lead ${lead?.form_id}: ${err.message}`);
  }

  return res.status(200).json({
    message: 'Lead processed.',
    response,
    length: response.length,
  });
};


function formatToQuestionAnswerArray(obj) {
  const res = Object.entries(obj).map(([question, answer]) => ({
    question,
    answer
  }));
  return res;
}

export async function POSTTOKEN(params) {
  try {
    console.log("triggered")
    const response = await Token.create({ page_id: "500516373142238", page_access_token: "EAAH2cyxBNIMBO7MZAK9LYlRZA66Xzxy0rvwVtGntAXAhhMoUFES6sfELaRdOGCzuPeYxDraEmUZAxvXuXVuZCXZAOLXaSaIZCtrtIGXZCs8yKOVAPtAhpuMQUypRebWjvZA9E1elWHqeUFFtqoEJs1Od0X2GLAPBP6qhzA8eWNRFvUEmgdrO0pUafMGYlwSbzNxFFOL1", long_lived_user_token: "EAAH2cyxBNIMBOxmre32XxQKFMFnHVLZAgKtfKkzpvKXAJOVjarP9eVc2QoD3ZA9PqPThip1ZA9ZC9yOrGy8319AJsErlNZBJoPKIWa7FZCwvM7jF7eE7YspPH0l9tz0uBqXdf9Q3IZAJfl6VBHGbD9R8WiHkBG0XnppK2md3ZCR6fWrpqZCUvMFTzZA5lV" })

  } catch (error) {

  }
}

// POSTTOKEN()


export const PostWebhookManual = async (lead_id) => {

    try {
              const data = await fetchLeadDataWithCampaign(lead_id);
              if (!data) {
                console.error('Failed to fetch lead and campaign details');
                return;
              }

              const leadDetails = data.lead;
              const campaignDetails = data.campaign;

              const existing = await MetaAdsLead.findOne({
                where: { form_id: leadDetails.id },
              });

              if (existing) {
                await axios.post('http://localhost:3031/v1/student/create', {
                name: existing.full_name,
                phone_number: existing.phone_number?.length === 13
                  ? existing.phone_number?.slice(3)
                  : existing.phone_number,
                email: existing.email,
                preferred_city: existing.city,
                source: 'FaceBook_University_Admit',
                form_name: leadDetails.id,
                mode: 'Online',
                sourceUrl: campaignDetails?.name || '',
                utm_campaign: leadDetails?.ad_name || '',
                utm_campaign_id: leadDetails?.ad_id || '',
                student_comment: formatToQuestionAnswerArray(existing.additional_fields),
              });
              }

              const formattedLead = {
                created_time: new Date(leadDetails.created_time),
                full_name: extractFieldValue(leadDetails.field_data, ['Full name', 'full_name', 'name']),
                email: extractFieldValue(leadDetails.field_data, ['Email']),
                phone_number: extractFieldValue(leadDetails.field_data, [
                  'phone_number', 'Phone number', 'Phone', 'Mobile number'
                ]),
                city: extractFieldValue(leadDetails.field_data, ['City']),
                form_id: leadDetails.id,
                campaign_name: leadDetails?.ad_name,
                source_url: campaignDetails?.name || '',
                additional_fields: extractAdditionalFields(leadDetails.field_data),
              };

              await MetaAdsLead.create(formattedLead);

               await axios.post('http://localhost:3031/v1/student/create', {
                name: formattedLead.full_name,
                phone_number: formattedLead.phone_number?.length === 13
                  ? formattedLead.phone_number?.slice(3)
                  : formattedLead.phone_number,
                email: formattedLead.email,
                preferred_city: formattedLead.city,
                source: 'FaceBook_University_Admit',
                form_name: leadDetails.id,
                mode: 'Online',
                sourceUrl: campaignDetails?.name || '',
                utm_campaign: leadDetails?.ad_name || '',
                utm_campaign_id: leadDetails?.ad_id || '',
                student_comment: formatToQuestionAnswerArray(formattedLead.additional_fields),
              });

              

              console.log('Lead saved and forwarded successfully');
            } catch (err) {
              console.error('Error processing lead:', err.message);
            }
};

const ua_array  = [
  { lead_id: '1324239735769027' },
 

];

async function processLeads() {
  for (const lead of ua_array) {
    try{
    await PostWebhookManual(lead.lead_id);
    }catch(err){
      console.error('Error processing lead:', err.message);
    }
  }
}
  // processLeads();