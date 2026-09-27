/**
 * seed.js — Populate database with demo data
 * Usage: node seed.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_db';

const departments = ['Computer Science', 'Electronics', 'Mechanical', 'Civil', 'Information Technology'];

const demoStudents = [
  { name: 'Aditya Sharma', email: 'aditya@demo.com', studentId: 'STU001', department: 'Computer Science', semester: 3 },
  { name: 'Priya Patel',   email: 'priya@demo.com',  studentId: 'STU002', department: 'Electronics',      semester: 5 },
  { name: 'Rahul Gupta',   email: 'rahul@demo.com',  studentId: 'STU003', department: 'Computer Science', semester: 3 },
  { name: 'Sneha Joshi',   email: 'sneha@demo.com',  studentId: 'STU004', department: 'Information Technology', semester: 1 },
  { name: 'Vikram Singh',  email: 'vikram@demo.com', studentId: 'STU005', department: 'Mechanical',       semester: 7 },
  { name: 'Ananya Reddy',  email: 'ananya@demo.com', studentId: 'STU006', department: 'Civil',            semester: 2 },
  { name: 'Karan Mehta',   email: 'karan@demo.com',  studentId: 'STU007', department: 'Computer Science', semester: 4 },
  { name: 'Divya Nair',    email: 'divya@demo.com',  studentId: 'STU008', department: 'Electronics',      semester: 6 },
];

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Clear existing data
    await Promise.all([
      User.deleteMany({ email: { $regex: '@demo.com' } }),
      Student.deleteMany({ studentId: { $regex: /^STU/ } }),
      Attendance.deleteMany({ studentId: { $regex: /^STU/ } }),
    ]);
    console.log('🗑️  Cleared old demo data');

    // Create admin
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@demo.com',
      password: 'password123',
      role: 'admin',
    });
    console.log(`👑 Admin created: admin@demo.com / password123`);

    // Create students
    const studentDocs = [];
    for (const s of demoStudents) {
      const user = await User.create({
        name: s.name,
        email: s.email,
        password: 'password123',
        role: 'student',
        studentId: s.studentId,
        department: s.department,
      });

      const student = await Student.create({
        user: user._id,
        studentId: s.studentId,
        name: s.name,
        email: s.email,
        department: s.department,
        semester: s.semester,
      });

      studentDocs.push(student);
      console.log(`  👤 ${s.name} (${s.studentId})`);
    }

    // Generate attendance for last 30 days
    console.log('\n📅 Generating 30 days of attendance...');
    const attendanceRecords = [];
    const today = new Date();

    for (let d = 29; d >= 0; d--) {
      const date = new Date(today);
      date.setDate(today.getDate() - d);
      const dayOfWeek = date.getDay();

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) continue;

      const dateStr = date.toISOString().split('T')[0];

      for (const student of studentDocs) {
        // Random attendance pattern — 75-95% rate
        const rand = Math.random();
        let status, time;

        if (rand < 0.80) {
          status = 'present';
          const h = 8 + Math.floor(Math.random() * 2); // 8 or 9 AM
          const m = Math.floor(Math.random() * 60);
          time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`;
        } else if (rand < 0.90) {
          status = 'late';
          const m = Math.floor(Math.random() * 30);
          time = `09:${String(30 + m).padStart(2,'0')}:00`;
        } else {
          status = 'absent';
          time = '00:00:00';
        }

        attendanceRecords.push({
          student: student._id,
          studentId: student.studentId,
          studentName: student.name,
          date: dateStr,
          time,
          markedAt: date,
          status,
          method: 'face_recognition',
          confidence: status !== 'absent' ? 0.85 + Math.random() * 0.14 : null,
          subject: 'General',
        });
      }
    }

    // Bulk insert
    if (attendanceRecords.length > 0) {
      await Attendance.insertMany(attendanceRecords, { ordered: false }).catch(() => {});
    }
    console.log(`  ✅ ${attendanceRecords.length} attendance records created`);

    console.log('\n🎉 Seed complete!\n');
    console.log('─────────────────────────────────────────');
    console.log('  Login credentials:');
    console.log('  Admin   : admin@demo.com  / password123');
    console.log('  Student : aditya@demo.com / password123');
    console.log('  (All demo accounts use password: password123)');
    console.log('─────────────────────────────────────────\n');

  } catch (err) {
    console.error('❌ Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
