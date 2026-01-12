import axios from "axios";
import crypto from "crypto";

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;
const ACCESS_TOKEN = process.env.META_GROUP_ACCESS_TOKEN;
const GRAPH_VERSION = "v19.0";


const hash = (value) =>
  value
    ? crypto
        .createHash("sha256")
        .update(value.trim().toLowerCase())
        .digest("hex")
    : null;

const normalizePhone = (phone) => {
  if (!phone) return null;
  if (phone.startsWith("+")) return phone;
  return `+91${phone.replace(/\D/g, "")}`;
};

const sanitizeAudienceName = (name) =>
  name
    .replace(/university|college|online|education/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);

const normalizeLeadForMeta = (lead) => ({
  email: lead.email || lead.student_email || null,
  phone: lead.phone || lead.student_phone || null
});


export const createCustomAudience = async (name) => {
  try {
    const safeName = sanitizeAudienceName(name);

    const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/act_${AD_ACCOUNT_ID}/customaudiences`;

    const res = await axios.post(endpoint, {
      name: name,
      subtype: "CUSTOM",
      description: "System generated audience",
      customer_file_source: "USER_PROVIDED_ONLY",
      access_token: ACCESS_TOKEN
    });

    return res.data;
  } catch (error) {
   
    throw error;
  }
};

export const addUserToAudience = async ({ audienceId, lead }) => {
  try {
    const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${audienceId}/users`;

    const normalizedLead = normalizeLeadForMeta(lead);

    const hashedEmail = hash(normalizedLead.email);
    const hashedPhone = hash(normalizePhone(normalizedLead.phone));

    if (!hashedEmail && !hashedPhone) {
      throw new Error("Email or phone is required for Meta audience");
    }

    const payload = {
      schema: ["EMAIL", "PHONE"],
      data: [[hashedEmail, hashedPhone]]
    };

    const res = await axios.post(endpoint, {
      payload,
      access_token: ACCESS_TOKEN
    });

    return res.data;
  } catch (error) {
    
    throw error;
  }
};
