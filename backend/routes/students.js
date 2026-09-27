/**
 * Student Routes: /api/students
 * Admin can manage all students; students can view themselves
 */

const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { protect, authorize } = require('../middleware/auth');

// ─── GET /api/students — List all students (Admin) ───────────────────────────

router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { department, search, isFaceRegistered, page = 1, limit = 20 } = req.query;
    const query = {};

    if (department) query.department = department;
    if (isFaceRegistered !== undefined) query.isFaceRegistered = isFaceRegistered === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .select('-faceEncoding') // Don't send binary encoding data
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: students
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/students/me — My profile (Student) ─────────────────────────────

router.get('/me', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user._id }).select('-faceEncoding');
    if (!student) return res.status(404).json({ success: false, error: 'Student profile not found' });

    // Calculate attendance stats
    const totalDays = await Attendance.countDocuments({ student: student._id });
    const presentDays = await Attendance.countDocuments({ student: student._id, status: 'present' });
    const percentage = totalDays > 0 ? ((presentDays / totalDays) * 100).toFixed(1) : 0;

    res.json({
      success: true,
      data: {
        ...student.toObject(),
        attendanceStats: { totalDays, presentDays, percentage }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/students/:id — Single student (Admin) ──────────────────────────

router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('-faceEncoding');
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    res.json({ success: true, data: student });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PUT /api/students/:id — Update student (Admin) ──────────────────────────

router.put('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const allowedUpdates = ['name', 'department', 'semester', 'isActive'];
    const updates = {};
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const student = await Student.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true
    }).select('-faceEncoding');

    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    res.json({ success: true, message: 'Student updated', data: student });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/students/:id — Remove student (Admin) ───────────────────────

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    // Also delete user account and attendance records
    await User.findOneAndDelete({ _id: student.user });
    await Attendance.deleteMany({ student: student._id });
    await student.deleteOne();

    res.json({ success: true, message: 'Student and all related data deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/students/:id/encode-face — Save face encoding ─────────────────
// Called by Python face-recognition service after encoding a face

router.post('/:id/encode-face', protect, authorize('admin'), async (req, res) => {
  try {
    const { faceEncoding, faceImage } = req.body;

    if (!faceEncoding || !Array.isArray(faceEncoding) || faceEncoding.length !== 128) {
      return res.status(400).json({ success: false, error: 'Valid 128-dim face encoding required' });
    }

    const student = await Student.findByIdAndUpdate(
      req.params.id,
      {
        faceEncoding,
        faceImage: faceImage || null,
        isFaceRegistered: true,
        faceRegisteredAt: Date.now()
      },
      { new: true }
    ).select('-faceEncoding');

    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    res.json({ success: true, message: 'Face encoding saved', data: student });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/students/encodings/all — Get all face encodings (Python service) 

router.get('/encodings/all', protect, authorize('admin'), async (req, res) => {
  try {
    const students = await Student.find({ isFaceRegistered: true })
      .select('studentId name faceEncoding');

    res.json({
      success: true,
      count: students.length,
      data: students
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
