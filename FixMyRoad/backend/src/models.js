import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  emailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['citizen', 'authority'], default: 'citizen' }
}, { timestamps: true });

const reportSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 1500 },
  damageType: { type: String, enum: ['Pothole', 'Cracked road', 'Waterlogging', 'Broken streetlight', 'Open manhole', 'Other'], default: 'Pothole' },
  severity: { type: String, enum: ['Low', 'Medium', 'High', 'Critical'], default: 'Medium' },
  priority: { type: Number, default: 2 },
  status: { type: String, enum: ['Reported', 'Verified', 'Assigned', 'In Progress', 'Resolved', 'Rejected'], default: 'Reported' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  address: { type: String, default: '' },
  photoPath: { type: String, default: '' },
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedTo: { type: String, default: '' },
  resolutionNote: { type: String, default: '' },
  possibleDuplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null }
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Report = mongoose.models.Report || mongoose.model('Report', reportSchema);

const emailOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  purpose: { type: String, enum: ['register', 'login'], required: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  resendCount: { type: Number, default: 0 },
  name: { type: String, default: '' },
  passwordHash: { type: String, default: '' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const EmailOtp = mongoose.models.EmailOtp || mongoose.model('EmailOtp', emailOtpSchema);
