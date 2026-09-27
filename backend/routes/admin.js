/**
 * Admin Routes: /api/admin
 * Dashboard, overview, and admin-only actions
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { protect, authorize } = require('../middleware/auth');

/**
 * Turn a Mongoose/Mongo error into something an admin can act on.
 * Raw driver text like "E11000 duplicate key error collection: attendance_db.users
 * index: studentId_1 dup key: { studentId: \"STU001\" }" is useless in a toast.
 */
const friendlyError = (err) => {
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = field ? err.keyValue[field] : null;
    const label = field === 'studentId' ? 'Student ID' : field === 'email' ? 'Email' : field;
    return label
      ? `${label} '${value}' is already taken`
      : 'A student with these details already exists';
  }
  if (err.name === 'ValidationError') {
    return Object.values(err.errors).map(e => e.message).join(', ');
  }
  return err.message;
};

// ─── GET /api/admin/dashboard — Overview stats ────────────────────────────────

router.get('/dashboard', protect, authorize('admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const [
      totalStudents,
      faceRegistered,
      todayPresent,
      todayTotal,
      totalRecords
    ] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ isFaceRegistered: true }),
      Attendance.countDocuments({ date: today, status: { $in: ['present', 'late'] } }),
      Attendance.countDocuments({ date: today }),
      Attendance.countDocuments()
    ]);

    // Recent activity (last 10 records)
    const recentActivity = await Attendance.find()
      .sort({ markedAt: -1 })
      .limit(10)
      .select('studentName studentId date time status method markedAt');

    res.json({
      success: true,
      data: {
        totalStudents,
        faceRegistered,
        notRegistered: totalStudents - faceRegistered,
        todayPresent,
        todayAbsent: totalStudents - todayPresent,
        todayAttendanceRate: totalStudents > 0
          ? ((todayPresent / totalStudents) * 100).toFixed(1)
          : 0,
        totalRecords,
        recentActivity
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/admin/users — List all users ────────────────────────────────────

router.get('/users', protect, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── PUT /api/admin/users/:id/toggle — Toggle user active status ──────────────

router.put('/users/:id/toggle', protect, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'}`,
      isActive: user.isActive
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/admin/students/bulk — Bulk create students ────────────────────

router.post('/students/bulk', protect, authorize('admin'), async (req, res) => {
  try {
    const { students } = req.body; // Array of student objects
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide an array of students' });
    }

    const results = { success: [], errors: [] };

    for (const s of students) {
      let createdUser = null;
      try {
        // Create user
        createdUser = await User.create({
          name: s.name,
          email: s.email,
          password: s.password || `Student@${s.studentId}`, // Default password
          role: 'student',
          studentId: s.studentId,
          department: s.department
        });

        await Student.create({
          user: createdUser._id,
          studentId: s.studentId,
          name: s.name,
          email: s.email,
          department: s.department,
          semester: s.semester || 1
        });

        results.success.push(s.studentId);
      } catch (err) {
        // Roll back a half-created User, otherwise the account lingers without a
        // Student profile and every retry fails with "email already exists".
        if (createdUser) {
          await User.deleteOne({ _id: createdUser._id }).catch(() => {});
        }
        results.errors.push({ studentId: s.studentId, error: friendlyError(err) });
      }
    }

    const created = results.success.length;
    const failed = results.errors.length;
    const message = `${created} students created, ${failed} failed`;

    // Nothing was created — that is a failure, not a 200 OK. Reporting success
    // here made the UI show "Student added!" for students that never existed.
    if (created === 0) {
      return res.status(400).json({
        success: false,
        error: results.errors[0]?.error || 'No students were created',
        message,
        results
      });
    }

    // 207 when some succeeded and some failed, so callers can tell the difference
    res.status(failed > 0 ? 207 : 201).json({ success: true, message, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
