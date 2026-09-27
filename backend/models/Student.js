/**
 * Student Model
 * Extended student info including face encoding data
 */

const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  studentId: {
    type: String,
    required: [true, 'Student ID is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true
  },
  department: {
    type: String,
    trim: true
  },
  semester: {
    type: Number,
    min: 1,
    max: 12
  },
  // Face recognition data
  faceEncoding: {
    type: [Number], // 128-dimension face encoding from face_recognition library
    default: null
  },
  faceImage: {
    type: String, // Path or base64 of face image
    default: null
  },
  isFaceRegistered: {
    type: Boolean,
    default: false
  },
  faceRegisteredAt: {
    type: Date
  },
  // Computed field (updated periodically)
  attendancePercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Index for faster queries
StudentSchema.index({ studentId: 1 });
StudentSchema.index({ isFaceRegistered: 1 });

module.exports = mongoose.model('Student', StudentSchema);
