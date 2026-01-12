import axios from 'axios';

// Location service functions
export const getLocationFromIP = async (ip) => {
  try {
   
    if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === 'Unknown') {
      return {
        country: 'India',
        state: 'Unknown',
        city: 'Unknown',
        timezone: 'Asia/Kolkata'
      };
    }

    const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 5000,
      headers: {
        'User-Agent': 'LMS-System/1.0'
      }
    });

    const data = response.data;
    
    if (data.error) {
      console.warn('IP API returned error:', data.reason);
      return {
        country: 'Unknown',
        state: 'Unknown', 
        city: 'Unknown',
        timezone: 'Unknown',
        error: data.reason || 'API error'
      };
    }
    
    return {
      country: data.country_name || 'Unknown',
      state: data.region || 'Unknown',
      city: data.city || 'Unknown',
      timezone: data.timezone || 'Unknown',
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      isp: data.org || 'Unknown',
      region_code: data.region_code || 'Unknown',
      country_code: data.country_code || 'Unknown',
      postal: data.postal || 'Unknown',
      utc_offset: data.utc_offset || 'Unknown',
      currency: data.currency || 'Unknown',
      continent_code: data.continent_code || 'Unknown'
    };
  } catch (error) {
    console.error('Error fetching location:', error.message);
    
    if (error.response && error.response.status === 429) {
      console.error('IP API rate limit exceeded');
      return {
        country: 'Unknown',
        state: 'Unknown',
        city: 'Unknown', 
        timezone: 'Unknown',
        error: 'Rate limit exceeded'
      };
    }
    
    return {
      country: 'India',
      state: 'Unknown',
      city: 'Unknown',
      timezone: 'Asia/Kolkata',
      error: 'Location fetch failed: ' + error.message
    };
  }
};

// Alternative: Get location from coordinates
export const getLocationFromCoordinates = async (lat, lng) => {
  try {
    const API_KEY = process.env.OPENCAGE_API_KEY;
    
    if (!API_KEY) {
      throw new Error('OpenCage API key not configured');
    }

    const response = await axios.get(
      `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lng}&key=${API_KEY}&pretty=1`
    );

    const result = response.data.results[0];
    if (result) {
      const components = result.components;
      return {
        country: components.country || 'Unknown',
        state: components.state || components.state_district || 'Unknown',
        city: components.city || components.town || components.village || 'Unknown',
        timezone: result.annotations?.timezone?.name || 'Unknown',
        formatted_address: result.formatted || 'Unknown'
      };
    }
    
    throw new Error('No results found');
  } catch (error) {
    console.error('Error in reverse geocoding:', error.message);
    return {
      country: 'Unknown',
      state: 'Unknown',
      city: 'Unknown',
      error: 'Reverse geocoding failed'
    };
  }
};

// Device info extraction helpers
const extractBrowser = (userAgent) => {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
};

const extractOS = (userAgent) => {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Unknown';
};

const extractDevice = (userAgent) => {
  if (userAgent.includes('Mobile')) return 'Mobile';
  if (userAgent.includes('Tablet')) return 'Tablet';
  return 'Desktop';
};

const generateSessionId = () => 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

// Main device info function
export const getDeviceInfo = async (req) => {
  const userAgent = req.headers['user-agent'] || 'Unknown';
  let ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'Unknown';
  
  // Clean up IP
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }

  // Get location from IP
  const locationData = await getLocationFromIP(ip);
  
  // Get location from coordinates if provided
  const { latitude, longitude } = req.body || {};
  let coordinateLocation = null;
  
  if (latitude && longitude) {
    coordinateLocation = await getLocationFromCoordinates(latitude, longitude);
  }

  return {
    sessionId: generateSessionId(),
    ip: ip,
    userAgent: userAgent,
    browser: extractBrowser(userAgent),
    os: extractOS(userAgent),
    device: extractDevice(userAgent),
    loginTime: new Date(),
    isActive: true,
    location: {
      fromIP: locationData,
      fromGPS: coordinateLocation,
      preferred: coordinateLocation || locationData
    }
  };
};

// Helper function to find most common value
export const getMostCommon = (arr) => {
  if (!arr.length) return null;
  
  const frequency = {};
  arr.forEach(item => {
    if (item) frequency[item] = (frequency[item] || 0) + 1;
  });
  
  return Object.keys(frequency).reduce((a, b) => 
    frequency[a] > frequency[b] ? a : b
  );
};