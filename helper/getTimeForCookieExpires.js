import jwt from 'jsonwebtoken';

export const generateTokenAndSetCookie = (
  res,
  payload, 
  cookieName,
  options = { expiresAtMidnight: false }
) => {
  let expiresIn, expires;

  if (options.expiresAtMidnight) {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); 
    expires = midnight;
    expiresIn = Math.floor((midnight.getTime() - now.getTime()) / 1000) + 's';
  } else {
    expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    expiresIn = '2d';
  }

  // Include id, name, and role in the JWT payload
  const token = jwt.sign(
    {
      id: payload.id,
      name: payload.name, 
      role: payload.role,
      counsellorId:payload.counsellorId || "" ,
      counsellorPreferredMode:payload.counsellorPreferredMode || ""
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
  console.log({
      id: payload.id,
      name: payload.name, 
      role: payload.role,
      counsellorId:payload.counsellorId || "" ,
      counsellorPreferredMode:payload.counsellorPreferredMode || ""
    })
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: false, 
    sameSite: 'lax',
    expires
  });

  return token;
};
