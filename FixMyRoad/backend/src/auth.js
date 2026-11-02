import jwt from 'jsonwebtoken';
import { User } from './models.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please log in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select('-passwordHash');
    if (!user) return res.status(401).json({ message: 'Account not found.' });
    req.user = user;
    next();
  } catch { return res.status(401).json({ message: 'Your session is invalid or expired. Please log in again.' }); }
}

export function requireAuthority(req, res, next) {
  if (req.user?.role !== 'authority') return res.status(403).json({ message: 'Authority access only.' });
  next();
}
