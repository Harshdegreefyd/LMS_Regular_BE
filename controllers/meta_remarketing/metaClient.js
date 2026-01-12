import axios from "axios";
import crypto from "crypto";
import MetaEventLog from "../../models/MetaEventLog.js";


const hash = (v) =>
  v
    ? crypto.createHash("sha256").update(v.trim().toLowerCase()).digest("hex")
    : undefined;


export const sendMetaEventOnce = async ({
  studentId = null,
  eventName,
  eventId,
  user,
  source,
  customData = {}
}) => {
  if (!eventName || !eventId) {
    console.warn(" Meta event skipped: missing identifiers");
    return null;
  }
const PIXEL_ID = source=='Facebook' ? process.env.META_PIXEL_ID : process.env.UA_META_PIXEL_ID;
const TOKEN = source=='Facebook' ? process.env.META_PIXEL_TOKEN : process.env.UA_META_PIXEL_TOKEN;

const ENDPOINT = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events`;

  try {
    await MetaEventLog.create({
      email: user.email,
      phone:user.phone,
      student_id: studentId,
      event_name: eventName,
      event_id: eventId,
      source:source
    });

    const payload = {
      data: [
        {
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: "system_generated",
          user_data: {
            em: hash(user.email),
            ph: hash(user.phone)
          },
          custom_data: customData
        }
      ],
      access_token: TOKEN
    };

    const response = await axios.post(ENDPOINT, payload);
    return response.data;
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return null;
    }

    if (err.response) {
      await MetaEventLog.destroy({
        where: {
          email: user.email,
          phone:user.phone,
          event_name: eventName
        }
      });

      console.error(
        "Meta API error:",
        err.response?.data || err.message
      );
    }

    throw err;
  }
};
