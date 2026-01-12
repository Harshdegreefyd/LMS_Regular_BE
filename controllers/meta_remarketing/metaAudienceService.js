import MetaAudience from "../../models/meta_audience.js";
import {
  createCustomAudience,
  addUserToAudience
} from "./metaAudienceClient.js";

const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID;


export const ensureAudience = async (groupName) => {
  try {
    if (!groupName) {
      throw new Error("groupName is required");
    }

    const existing = await MetaAudience.findOne({
      where: { group_name: groupName, status: "ACTIVE" }
    });

    if (existing) return existing;

    const created = await createCustomAudience(groupName);

    if (!created?.id) {
      throw new Error("Meta audience creation failed");
    }

    return await MetaAudience.create({
      group_name: groupName,
      meta_audience_id: created.id,
      ad_account_id: AD_ACCOUNT_ID
    });

  } catch (error) {
    console.error("ensureAudience error:", {
      groupName,
      message: error.message
    });
    throw error;
  }
};


export const pushLeadToAudience = async ({ groupName, lead }) => {
  try {
    if (!groupName || !lead) {
      throw new Error("groupName and lead are required");
    }

   

    const audience = await ensureAudience(groupName);

    await addUserToAudience({
      audienceId: audience.meta_audience_id,
      lead
    });

    await audience.increment("lead_count", { by: 1 });

    return {
      success: true,
      groupName,
      lead_count: audience.lead_count + 1
    };

  } catch (error) {
    console.error(" pushLeadToAudience error:", {
      groupName,
      message: error.message
    });

    return {
      success: false,
      groupName,
      error: error.message
    };
  }
};
