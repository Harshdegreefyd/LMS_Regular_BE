import {
  trackQualifiedLead,
  trackUnqualifiedLead
} from "./metaEvents.js";

export const onCounsellorAction = async (lead, action, req) => {
  const basePayload = {
    user: {
      email: lead.email,
      phone: lead.phone,
      ip: req.ip,
      userAgent: req.headers["user-agent"]
    },
    eventId: `lead_${lead.id}_${action}`,
    fbp: req.cookies?._fbp,
    fbc: req.cookies?._fbc,
    customData: {
      course: lead.course,
      source: "counsellor"
    }
  };

  if (action === "QUALIFIED") {
    await trackQualifiedLead(basePayload);
  }

  if (action === "UNQUALIFIED") {
    await trackUnqualifiedLead({
      ...basePayload,
      reason: lead.rejectReason
    });
  }
};
