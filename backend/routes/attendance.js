/**
 * Attendance Routes: /api/attendance
 */

const express = require('express');
const router = express.Router();
const { createObjectCsvStringifier } = require('csv-writer');
const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const { protect, authorize } = require('../middleware/auth');
const { sendAttendanceEmail } = require('../config/email');

// ─── GET /api/attendance — All records (Admin) ────────────────────────────────

router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { date, startDate, endDate, studentId, status, page = 1, limit = 50 } = req.query;
    const query = {};

    if (date) query.date = date;
    if (studentId) query.studentId = studentId;
    if (status) query.status = status;
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const total = await Attendance.countDocuments(query);
    const records = await Attendance.find(query)
      .populate('student', 'name studentId department')
      .sort({ date: -1, time: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, total, page: parseInt(page), data: records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/attendance/my — Student's own attendance ────────────────────────

router.get('/my', protect, authorize('student'), async (req, res) => {
  try {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) return res.status(404).json({ success: false, error: 'Student profile not found' });

    const { month, year } = req.query;
    const query = { student: student._id };

    // Filter by month/year if provided
    if (month && year) {
      const paddedMonth = String(month).padStart(2, '0');
      query.date = { $regex: `^${year}-${paddedMonth}` };
    }

    const records = await Attendance.find(query).sort({ date: -1, time: -1 });

    // Calculate stats
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const late = records.filter(r => r.status === 'late').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const percentage = total > 0 ? ((present + late) / total * 100).toFixed(1) : 0;

    res.json({
      success: true,
      stats: { total, present, late, absent, percentage },
      data: records
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/attendance/stats — Attendance statistics (Admin) ────────────────

router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Today's stats
    const todayTotal = await Attendance.countDocuments({ date: today });
    const todayPresent = await Attendance.countDocuments({ date: today, status: 'present' });

    // Total students
    const totalStudents = await Student.countDocuments();

    // Monthly trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDate = thirtyDaysAgo.toISOString().split('T')[0];

    const monthlyData = await Attendance.aggregate([
      { $match: { date: { $gte: startDate }, status: { $in: ['present', 'late'] } } },
      {
        $group: {
          _id: '$date',
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Department-wise attendance
    const deptStats = await Attendance.aggregate([
      { $match: { date: today } },
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'studentData'
        }
      },
      { $unwind: '$studentData' },
      {
        $group: {
          _id: '$studentData.department',
          count: { $sum: 1 }
        }
      }
    ]);

    // Top present students (last 30 days)
    const topStudents = await Attendance.aggregate([
      { $match: { date: { $gte: startDate }, status: 'present' } },
      { $group: { _id: '$studentId', name: { $first: '$studentName' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      data: {
        today: { total: todayTotal, present: todayPresent, totalStudents },
        monthlyTrend: monthlyData,
        departmentStats: deptStats,
        topStudents
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── POST /api/attendance/mark — Mark attendance (face recognition or manual) ─

router.post('/mark', protect, async (req, res) => {
  try {
    const { studentId, status = 'present', method = 'face_recognition', confidence, subject } = req.body;

    // Find student
    const student = await Student.findOne({ studentId });
    if (!student) {
      return res.status(404).json({ success: false, error: `Student ${studentId} not found` });
    }

    // Today's date and time
    const now = new Date();
    const date = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const time = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // Determine status based on time (late if after 9:30 AM)
    const [hours, minutes] = time.split(':').map(Number);
    const isLate = hours > 9 || (hours === 9 && minutes > 30);
    const finalStatus = status === 'present' && isLate ? 'late' : status;

    // Upsert attendance (avoid duplicates for same day)
    const attendance = await Attendance.findOneAndUpdate(
      { student: student._id, date },
      {
        student: student._id,
        studentId: student.studentId,
        studentName: student.name,
        date,
        time,
        markedAt: now,
        status: finalStatus,
        method,
        confidence: confidence || null,
        subject: subject || 'General',
        markedBy: method === 'manual' ? req.user._id : null
      },
      { upsert: true, new: true }
    );

    // Send email notification if enabled
    try {
      const user = await require('../models/User').findOne({ studentId: student.studentId });
      if (user && user.emailNotifications) {
        await sendAttendanceEmail(user.email, student.name, date, time, finalStatus);
      }
    } catch (emailErr) {
      console.warn('Email notification failed:', emailErr.message);
    }

    res.json({
      success: true,
      message: `Attendance marked as ${finalStatus} for ${student.name}`,
      data: attendance
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── GET /api/attendance/export — Export CSV (Admin) ─────────────────────────

router.get('/export', protect, authorize('admin'), async (req, res) => {
  try {
    const { startDate, endDate, department } = req.query;
    const query = {};

    if (startDate && endDate) query.date = { $gte: startDate, $lte: endDate };
    else if (startDate) query.date = { $gte: startDate };

    let records = await Attendance.find(query)
      .populate('student', 'department semester')
      .sort({ date: 1, studentId: 1 });

    // Filter by department if specified
    if (department) {
      records = records.filter(r => r.student?.department === department);
    }

    // Build CSV
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'studentId', title: 'Student ID' },
        { id: 'studentName', title: 'Name' },
        { id: 'department', title: 'Department' },
        { id: 'date', title: 'Date' },
        { id: 'time', title: 'Time' },
        { id: 'status', title: 'Status' },
        { id: 'method', title: 'Method' },
        { id: 'subject', title: 'Subject' }
      ]
    });

    const csvRecords = records.map(r => ({
      studentId: r.studentId,
      studentName: r.studentName,
      department: r.student?.department || 'N/A',
      date: r.date,
      time: r.time,
      status: r.status.toUpperCase(),
      method: r.method,
      subject: r.subject
    }));

    const csvContent = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvRecords);

    const filename = `attendance_${startDate || 'all'}_to_${endDate || 'all'}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─── DELETE /api/attendance/:id — Delete record (Admin) ──────────────────────

router.delete('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, message: 'Attendance record deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
