import jwt from 'jsonwebtoken';

export const authorize = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const token = req.cookies.token;
      console.log(token,"hello")
      if (!token) return res.status(401).json({ message: 'Unauthorized' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret123');
      req.user = decoded;
      const userRole = String(decoded.role).trim().toLowerCase();
      const normalizedAllowedRoles = allowedRoles.map(r => r.toLowerCase());

      console.log(userRole,'userRole',normalizedAllowedRoles)
      if (!normalizedAllowedRoles.includes(userRole)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      next();
    } catch (err) {
      console.error("Auth error:", err.message);
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
};

