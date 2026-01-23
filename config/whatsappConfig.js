const WHATSAPP_API_BASE = "https://wsapi.sendmsg.in";
const MEDIA_API_BASE = "https://media.sendmsg.in";
const COUNTRY_CODE = "91";
const WHATSAPP_USER = "degreefyd";
const WHATSAPP_PASS = "zUoZxiaKynbZ";
const FROM_NUMBER = "919667550618";

const TEMPLATE_IDS = {
  DAY_1: "not_connected_template",
  DAY_2: "not_connected_template_day2",
  DAY_3: "not_connected_template_day3",
  DAY_4: "not_connected_template_day4",
  DAY_5: "not_connected_template_day5",
};

const MESSAGES = {
  DAY_1: {
    templateId: TEMPLATE_IDS.DAY_1,
    name: "day_1_followup",
  },
  DAY_2: {
    templateId: TEMPLATE_IDS.DAY_2,
    name: "day_2_followup",
  },
  DAY_3: {
    templateId: TEMPLATE_IDS.DAY_3,
    name: "day_3_followup",
  },
  DAY_4: {
    templateId: TEMPLATE_IDS.DAY_4,
    name: "day_4_followup",
  },
  DAY_5: {
    templateId: TEMPLATE_IDS.DAY_5,
    name: "day_5_followup",
  },
};

export {
  WHATSAPP_API_BASE,
  MEDIA_API_BASE,
  COUNTRY_CODE,
  WHATSAPP_USER,
  WHATSAPP_PASS,
  FROM_NUMBER,
  MESSAGES,
};
