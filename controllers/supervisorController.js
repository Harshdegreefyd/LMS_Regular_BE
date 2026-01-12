import UserActivityLog from '../models/supervisor_activities.js';
import geoip from 'geoip-lite';
import {getLocationFromIP} from '../helper/deviceLocationHelpers.js'
const logActivity = async (req, res, extra = {}) => {
  try {
    const duration = extra?.startTime
      ? Date.now() - extra?.startTime
      : null;

    const locationData = geoip.lookup(req.ip) || await getLocationFromIP(req.ip) || {};
    await UserActivityLog.create({
      user_id: req.user?.id || null,
      endpoint: req.originalUrl,
      method: req.method,
      request_data: req.body || {},
      response_data: res || null,
      status_code: res.code || null,
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      referrer: req.headers['referer'] || null,
      location: locationData,
      duration_ms: duration,
    });
  } catch (err) {
    console.error('Log insert error:', err);
  }
};
export  default logActivity; 
