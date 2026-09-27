/**
 * Attendance Model
 * Tracks attendance records per student per day
 */

const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  studentId: {
    type: String,
    required: true // Denormalized for quick querying
  },
  studentName: {
    type: String,
    required: true // Denormalized for CSV export
  },
  date: {
    type: String, // Format: YYYY-MM-DD (makes daily queries easy)
    required: true
  },
  time: {
    type: String, // Format: HH:MM:SS
    required: true
  },
  markedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    default: 'present'
  },
  method: {
    type: String,
    enum: ['face_recognition', 'manual', 'qr_code'],
    default: 'face_recognition'
  },
  confidence: {
    type: Number, // Face recognition confidence score (0-1)
    min: 0,
    max: 1,
    default: null
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null if marked by face recognition system
  },
  subject: {
    type: String,
    trim: true,
    default: 'General'
  },
  location: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// ─── Compound index: One record per student per date ─────────────────────────
AttendanceSchema.index({ student: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ studentId: 1 });
AttendanceSchema.index({ date: 1 });
AttendanceSchema.index({ status: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
