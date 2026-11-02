import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { createHash, randomInt } from 'crypto';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { User, Report, EmailOtp } from './models.js';
import { requireAuth, requireAuthority } from './auth.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, '../uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
} });

const priorityFor = (severity) => ({ Low: 1, Medium: 2, High: 3, Critical: 4 }[severity] || 2);
const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2-lat1), dLon = rad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};
const publicReport = (r) => ({
  _id: r._id, title: r.title, description: r.description, damageType: r.damageType,
  severity: r.severity, priority: r.priority, status: r.status, latitude: r.latitude,
  longitude: r.longitude, address: r.address, photoPath: r.photoPath,
  reporter: r.reporter && typeof r.reporter === 'object' ? { name: r.reporter.name } : undefined,
  assignedTo: r.assignedTo, resolutionNote: r.resolutionNote, possibleDuplicateOf: r.possibleDuplicateOf,
  createdAt: r.createdAt, updatedAt: r.updatedAt
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'FixMyRoad API' }));

const otpExpiryMinutes = Math.max(1, Number(process.env.OTP_EXPIRES_MINUTES) || 5);
const otpHash = (otp) => createHash('sha256').update(String(otp)).digest('hex');
const mailer = process.env.EMAIL_USER && process.env.EMAIL_PASS
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    })
  : null;

async function sendOtpEmail(email, otp, purpose) {
  if (!mailer) {
    const error = new Error('Email is not configured. Add EMAIL_USER and EMAIL_PASS to backend/.env, then restart the backend.');
    error.status = 503;
    throw error;
  }
  const action = purpose === 'register' ? 'verify your FixMyRoad account' : 'complete your FixMyRoad login';
  await mailer.sendMail({
    from: `FixMyRoad <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your FixMyRoad verification code',
    text: `Your code to ${action} is ${otp}. It expires in ${otpExpiryMinutes} minutes. If you did not request this code, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1c2c28"><h2>FixMyRoad verification</h2><p>Use this code to ${action}:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:18px;background:#f1f6f0;border-radius:10px;text-align:center">${otp}</div><p>This code expires in ${otpExpiryMinutes} minutes. Never share it with anyone.</p><p style="color:#6c7a74">If you did not request this code, ignore this email.</p></div>`
  });
}

async function createOtpChallenge({ email, purpose, name = '', passwordHash = '', userId = null }) {
  await EmailOtp.deleteMany({ email, purpose });
  const otp = String(randomInt(100000, 1000000));
  const challenge = await EmailOtp.create({
    email, purpose, otpHash: otpHash(otp),
    expiresAt: new Date(Date.now() + otpExpiryMinutes * 60 * 1000),
    name, passwordHash, userId
  });
  try {
    await sendOtpEmail(email, otp, purpose);
  } catch (error) {
    await EmailOtp.deleteOne({ _id: challenge._id });
    throw error;
  }
  return { challengeId: String(challenge._id), email, expiresInMinutes: otpExpiryMinutes };
}

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.toLowerCase().trim();
    const password = req.body.password;
    if (!name || !email || !password || password.length < 8)
      return res.status(400).json({ message: 'Name, valid email, and password (at least 8 characters) are required.' });
    if (await User.findOne({ email })) return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
    const passwordHash = await bcrypt.hash(password, 12);
    const challenge = await createOtpChallenge({ email, purpose: 'register', name, passwordHash });
    res.status(200).json({ requiresOtp: true, ...challenge, message: 'A 6-digit verification code has been sent to your email.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = req.body.email?.toLowerCase().trim();
    const user = email ? await User.findOne({ email }) : null;
    if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash)))
      return res.status(401).json({ message: 'Incorrect email or password.' });
    if (!user.emailVerified)
      return res.status(403).json({ message: 'Your email is not verified. Please complete sign-up verification or contact support.' });
    // Email OTP is required only during account creation. Returning users sign in with email + password.
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role }, message: 'Login successful.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/verify-otp', async (req, res, next) => {
  try {
    const { challengeId, otp } = req.body;
    if (!mongoose.isValidObjectId(challengeId) || !/^\d{6}$/.test(String(otp || '')))
      return res.status(400).json({ message: 'Enter the 6-digit code sent to your email.' });
    const challenge = await EmailOtp.findById(challengeId);
    if (!challenge) return res.status(400).json({ message: 'This verification code is invalid or expired. Please request a new code.' });
    if (challenge.expiresAt.getTime() <= Date.now()) {
      await EmailOtp.deleteOne({ _id: challenge._id });
      return res.status(400).json({ message: 'This verification code has expired. Please request a new code.' });
    }
    if (challenge.attempts >= 5) {
      await EmailOtp.deleteOne({ _id: challenge._id });
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }
    if (otpHash(otp) !== challenge.otpHash) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(400).json({ message: `Incorrect code. ${5 - challenge.attempts} attempt(s) remaining.` });
    }

    let user;
    if (challenge.purpose === 'register') {
      if (await User.findOne({ email: challenge.email })) {
        await EmailOtp.deleteOne({ _id: challenge._id });
        return res.status(409).json({ message: 'An account with this email already exists. Please sign in.' });
      }
      user = await User.create({ name: challenge.name, email: challenge.email, passwordHash: challenge.passwordHash, role: 'citizen', emailVerified: true });
    } else {
      user = await User.findById(challenge.userId);
      if (!user || !user.emailVerified) {
        await EmailOtp.deleteOne({ _id: challenge._id });
        return res.status(401).json({ message: 'Account is unavailable. Please sign in again.' });
      }
    }
    await EmailOtp.deleteMany({ email: challenge.email });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role }, message: 'Email verified successfully.' });
  } catch (e) { next(e); }
});

app.post('/api/auth/resend-otp', async (req, res, next) => {
  try {
    const { challengeId } = req.body;
    if (!mongoose.isValidObjectId(challengeId)) return res.status(400).json({ message: 'Verification session expired. Please start again.' });
    const challenge = await EmailOtp.findById(challengeId);
    if (!challenge) return res.status(400).json({ message: 'Verification session expired. Please start again.' });
    if (challenge.resendCount >= 3) return res.status(429).json({ message: 'Resend limit reached. Please start the process again later.' });
    const otp = String(randomInt(100000, 1000000));
    challenge.otpHash = otpHash(otp);
    challenge.expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);
    challenge.attempts = 0;
    challenge.resendCount += 1;
    await challenge.save();
    await sendOtpEmail(challenge.email, otp, challenge.purpose);
    res.json({ message: 'A new verification code has been sent.', expiresInMinutes: otpExpiryMinutes });
  } catch (e) { next(e); }
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role }));

app.get('/api/reports', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
    if (req.query.severity && req.query.severity !== 'All') filter.severity = req.query.severity;
    const reports = await Report.find(filter).populate('reporter', 'name').sort({ priority: -1, createdAt: -1 }).limit(500);
    res.json(reports.map(publicReport));
  } catch (e) { next(e); }
});

app.get('/api/reports/mine', requireAuth, async (req, res, next) => {
  try {
    const reports = await Report.find({ reporter: req.user._id }).sort({ createdAt: -1 });
    res.json(reports.map(publicReport));
  } catch (e) { next(e); }
});

app.post('/api/reports', requireAuth, upload.single('photo'), async (req, res, next) => {
  try {
    const { title, description, damageType, severity, latitude, longitude, address } = req.body;
    const lat = Number(latitude), lng = Number(longitude);
    if (!title?.trim() || !description?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
      return res.status(400).json({ message: 'Title, description, and valid GPS coordinates are required.' });
    const nearby = await Report.find({ status: { $ne: 'Rejected' }, damageType: damageType || 'Pothole' }).sort({ createdAt: -1 }).limit(300);
    const duplicate = nearby.find(r => distanceMeters(lat, lng, r.latitude, r.longitude) <= 100);
    const report = await Report.create({ title: title.trim(), description: description.trim(), damageType: damageType || 'Pothole', severity: severity || 'Medium', priority: priorityFor(severity || 'Medium'), latitude: lat, longitude: lng, address: address || '', photoPath: req.file ? `/uploads/${req.file.filename}` : '', reporter: req.user._id, possibleDuplicateOf: duplicate?._id || null });
    res.status(201).json({ report: publicReport(report), possibleDuplicate: duplicate ? { id: duplicate._id, title: duplicate.title, status: duplicate.status } : null });
  } catch (e) { next(e); }
});

app.patch('/api/reports/:id/status', requireAuth, requireAuthority, async (req, res, next) => {
  try {
    const allowed = ['Reported', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Rejected'];
    const { status, assignedTo, resolutionNote } = req.body;
    if (status && !allowed.includes(status)) return res.status(400).json({ message: 'Invalid status.' });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found.' });
    if (status) report.status = status;
    if (assignedTo !== undefined) report.assignedTo = String(assignedTo).slice(0, 120);
    if (resolutionNote !== undefined) report.resolutionNote = String(resolutionNote).slice(0, 1000);
    await report.save();
    res.json(publicReport(report));
  } catch (e) { next(e); }
});

app.get('/api/dashboard/stats', requireAuth, requireAuthority, async (_req, res, next) => {
  try {
    const [total, open, progress, resolved, critical] = await Promise.all([
      Report.countDocuments(), Report.countDocuments({ status: { $nin: ['Resolved', 'Rejected'] } }),
      Report.countDocuments({ status: 'In Progress' }), Report.countDocuments({ status: 'Resolved' }),
      Report.countDocuments({ severity: 'Critical', status: { $nin: ['Resolved', 'Rejected'] } })
    ]);
    res.json({ total, open, progress, resolved, critical });
  } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  res.status(status).json({ message: err.message || 'Unexpected server error.' });
});

if (!process.env.JWT_SECRET) console.warn('WARNING: JWT_SECRET is missing. Create backend/.env before running.');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/fixmyroad')
  .then(() => app.listen(PORT, () => console.log(`FixMyRoad API running at http://localhost:${PORT}`)))
  .catch(err => { console.error('MongoDB connection failed:', err.message); process.exit(1); });
