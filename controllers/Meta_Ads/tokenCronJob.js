import axios from 'axios';
import dotenv from 'dotenv';
import Token from '../../models/ads/meta-token.js';
import Lead from '../../models/ads/meta.js';

dotenv.config();

const PAGE_ID = process.env.PAGE_ID;

async function refreshPageToken() {
  try {
    const tokenData = await Token.findOne({ where: { page_id: PAGE_ID } });
    if (!tokenData) {
      console.log('No existing token found in DB');
      return;
    }

    const longLivedUserToken = tokenData.long_lived_user_token;

    const response = await axios.get(`https://graph.facebook.com/v17.0/${PAGE_ID}`, {
      params: {
        fields: 'access_token',
        access_token: longLivedUserToken
      }
    });

    const newPageToken = response.data.access_token;
    tokenData.page_access_token = newPageToken;
    tokenData.updated_at = new Date();
    await tokenData.save();

    console.log('✅ Page token refreshed and saved to DB');
  } catch (error) {
    console.error('❌ Error refreshing page token:', error.response?.data || error.message);
  }
}

export default refreshPageToken;

export async function checkToken() {
  const tokenDoc = await Token.findOne({ where: { page_id: '718284908040065' } });

  if (!tokenDoc) {
    console.log('Token not found!');
    return;
  }

  const pageAccessToken = tokenDoc.page_access_token;

  try {
    const response = await axios.get(`https://graph.facebook.com/v19.0/me?access_token=${pageAccessToken}`);
    console.log('✅ Token is valid:', response.data);
  } catch (err) {
    console.error('❌ Token failed:', err.response?.data?.error || err.message);
  }
}

export async function getUserLeads() {
  let count = 0;
  try {
    const tokenDoc = await Token.findOne({ where: { page_id: '718284908040065' } });

    if (!tokenDoc) {
      console.log('Page Token not found!');
      return;
    }

    const pageAccessToken = tokenDoc.page_access_token;
    const url = `https://graph.facebook.com/v19.0/${tokenDoc.page_id}/leadgen_forms?access_token=${pageAccessToken}`;
    const response = await axios.get(url);
    const leadForms = response.data.data;

    if (leadForms && leadForms.length > 0) {
      for (let form of leadForms) {
        let leadsUrl = `https://graph.facebook.com/v19.0/1310281557399068/leads?access_token=${pageAccessToken}`;

        while (leadsUrl) {
          const leadsResponse = await axios.get(leadsUrl);
          const leads = leadsResponse.data.data;

          count += leads.length;
          console.log(`${form.name} - Fetched leads: ${leads.length}`);

          for (let lead of leads) {
            const leadData = {
              lead_id: lead.id, 
              created_time: new Date(lead.created_time),
              full_name: null,
              email: null,
              phone_number: null,
              city: null,
              form_id: form.id,
              additional_fields: {},
              campaign_id: null,
              campaign_name: null,
            };

            if (lead.field_data && lead.field_data.length > 0) {
              lead.field_data.forEach(field => {
                const fieldName = field.name;
                const fieldValue = field.values?.[0] || null;

                if (fieldName === 'full_name') leadData.full_name = fieldValue;
                else if (fieldName === 'email') leadData.email = fieldValue;
                else if (fieldName === 'phone_number') leadData.phone_number = fieldValue;
                else if (fieldName === 'city') leadData.city = fieldValue;
                else leadData.additional_fields[fieldName] = fieldValue;
              });
            }

            const adId = lead.ad_id;
            if (adId) {
              try {
                const adDetailsRes = await axios.get(`https://graph.facebook.com/v19.0/${adId}?fields=campaign_id&access_token=${pageAccessToken}`);
                const campaignId = adDetailsRes.data.campaign_id;
                leadData.campaign_id = campaignId;

                if (campaignId) {
                  const campaignRes = await axios.get(`https://graph.facebook.com/v19.0/${campaignId}?fields=name&access_token=${pageAccessToken}`);
                  leadData.campaign_name = campaignRes.data.name;
                }
              } catch (error) {
                console.error(`Failed to fetch campaign for ad ${adId}:`, error.response?.data || error.message);
              }
            }

        //    const existingLead = await Lead.findOne({
        //   where: {
        //     form_id: leadData.form_id,
        //     email: leadData.email,
        //     phone_number: leadData.phone_number,
        //   },
        // });

        // if (!existingLead) {
        //   await Lead.create(leadData);
        // }
        console.log(leadData);
          }

          leadsUrl = leadsResponse.data.paging?.next || null;
        }
      }
    } else {
      console.log('No lead forms found.');
    }

  } catch (err) {
    console.error('Error fetching leads:', err.response?.data?.error || err.message);
  }
}
// getUserLeads();
