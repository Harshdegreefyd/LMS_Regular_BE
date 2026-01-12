export const bearerAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Bearer token required' });
  }

  const token = authHeader.split(' ')[1];

  if (token !== process.env.EXTERNAL_API_TOKEN) {
    return res.status(403).json({ message: 'Invalid token' });
  }

  next();
};
