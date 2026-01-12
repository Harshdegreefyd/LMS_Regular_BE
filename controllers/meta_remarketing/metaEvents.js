import { sendMetaEventOnce } from "./metaClient.js";

const normalizeLead = (lead) => ({
  id: lead.form_id || lead.id,
  email: lead.email,
  phone: lead.phone_number || lead.phone
});

export const trackMetaLead = (lead) =>
  sendMetaEventOnce({
    eventName: "Lead",
    eventId: `meta_lead_${lead.id}`,
    user: {
      email: lead.email,
      phone: lead.phone
    },
    customData: {
      source: "meta_lead_ad",
      campaign_id: lead.campaignId,
      ad_id: lead.adId
    }
  });


export const trackMetaQualifiedLead = (lead,source) => {
  const l = normalizeLead(lead);

  return sendMetaEventOnce({
    eventName: "QualifiedLead",
    source:source,
    eventId: `meta_qualified_${l.id}`,
    user: {
      email: l.email,
      phone: l.phone
    },
    customData: {
      source: "meta_lead_ad",
      lead_status: "qualified",
      lead_id: l.id,
    }
  });
};

export const trackMetaUnqualifiedLead = (lead) => {
  const l = normalizeLead(lead);

  return sendMetaEventOnce({
    eventName: "UnqualifiedLead",
        source:source,

    eventId: `meta_unqualified_${l.id}`,
    user: {
      email: l.email,
      phone: l.phone
    },
    customData: {
      source: "meta_lead_ad",
      lead_status: "unqualified",
      reason: "Not Interested",
            lead_id: l.id,

    }
  });
};

export const trackMetaConvertedLead = (lead,source) => {
  const l = normalizeLead(lead);

  return sendMetaEventOnce({
    eventName: "Purchase",
    source:source,
    eventId: `meta_converted_${l.id}`,
    user: {
      email: l.email,
      phone: l.phone
    },
     customData: {
      value: 1,
      currency: "INR",
      source: "meta_lead_ad",
      lead_status: "converted",
      lead_id: l.id
    }
  });
};


export const helperForMeta = async (lead) => {
  const { lead_status, lead_sub_status,data,source } = lead;

  if (
    lead_status === "NotInterested" ||
    lead_status === "Not Interested"
  ) {
    return trackMetaUnqualifiedLead(data,source);
  }

  if (
    lead_status === "Application" ||
    lead_status === "Admission"
  ) {
    return trackMetaConvertedLead(data,source);
  }

  if (
    lead_status === "Pre Application" &&
    lead_sub_status === "Initial Counseling Completed"
  ) {
    return trackMetaQualifiedLead(data,source);
  }

  return null;
};




// export const helperForMeta = async (lead) => {
//   const { lead_status, lead_sub_status, data } = lead;

//   if (
//     lead_status === "NotInterested" ||
//     lead_status === "Not Interested"
//   ) {
//     await trackMetaUnqualifiedLead(data);

//     await addUserToAudience({
//       audienceId: process.env.META_AUDIENCE_UNQUALIFIED,
//       lead: data
//     });

//     return;
//   }

//   if (
//     lead_status === "Application" ||
//     lead_status === "Admission"
//   ) {
//     await trackMetaConvertedLead(data);

//     await addUserToAudience({
//       audienceId: process.env.META_AUDIENCE_CONVERTED,
//       lead: data
//     });

//     return;
//   }

//   if (
//     lead_status === "Pre Application" &&
//     lead_sub_status === "Initial Counseling Completed"
//   ) {
//     await trackMetaQualifiedLead(data);

//     await addUserToAudience({
//       audienceId: process.env.META_AUDIENCE_QUALIFIED,
//       lead: data
//     });

//     return;
//   }
// };