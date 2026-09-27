/**
 * seed-dummy.js — Add extra dummy data WITHOUT wiping what's already there.
 *
 * Unlike seed.js (which clears demo data and starts fresh), this script is
 * additive and idempotent:
 *   - Students that already exist are skipped, not duplicated.
 *   - Attendance is upserted on {student, date} with $setOnInsert, so existing
 *     records keep their original values and only missing days get filled.
 * Safe to run more than once.
 *
 * Usage: node seed-dummy.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance_db';

const DAYS_BACK = 60;   // weekdays only; weekends are skipped
const PASSWORD  = 'password123';

const SUBJECTS = [
  'Data Structures', 'Operating Systems', 'DBMS',
  'Computer Networks', 'Mathematics', 'General',
];

// Extra students to add on top of STU001–STU008 from seed.js
const newStudents = [
  { name: 'Arjun Desai',      email: 'arjun@demo.com',     studentId: 'STU009', department: 'Computer Science',       semester: 5 },
  { name: 'Meera Iyer',       email: 'meera@demo.com',     studentId: 'STU010', department: 'Information Technology', semester: 3 },
  { name: 'Rohan Kulkarni',   email: 'rohan@demo.com',     studentId: 'STU011', department: 'Mechanical',             semester: 7 },
  { name: 'Ishita Banerjee',  email: 'ishita@demo.com',    studentId: 'STU012', department: 'Electronics',            semester: 2 },
  { name: 'Siddharth Rao',    email: 'siddharth@demo.com', studentId: 'STU013', department: 'Computer Science',       semester: 6 },
  { name: 'Nikhil Verma',     email: 'nikhil@demo.com',    studentId: 'STU014', department: 'Civil',                  semester: 4 },
  { name: 'Tanvi Shah',       email: 'tanvi@demo.com',     studentId: 'STU015', department: 'Information Technology', semester: 8 },
  { name: 'Aryan Chatterjee', email: 'aryan@demo.com',     studentId: 'STU016', department: 'Electronics',            semester: 1 },
  { name: 'Pooja Malhotra',   email: 'pooja@demo.com',     studentId: 'STU017', department: 'Computer Science',       semester: 3 },
  { name: 'Kabir Ahuja',      email: 'kabir@demo.com',     studentId: 'STU018', department: 'Mechanical',             semester: 5 },
  { name: 'Riya Sengupta',    email: 'riya@demo.com',      studentId: 'STU019', department: 'Civil',                  semester: 6 },
  { name: 'Manav Trivedi',    email: 'manav@demo.com',     studentId: 'STU020', department: 'Information Technology', semester: 2 },
  { name: 'Sanya Kapoor',     email: 'sanya@demo.com',     studentId: 'STU021', department: 'Computer Science',       semester: 7 },
  { name: 'Dev Pillai',       email: 'dev@demo.com',       studentId: 'STU022', department: 'Electronics',            semester: 4 },
  { name: 'Aisha Khan',       email: 'aisha@demo.com',     studentId: 'STU023', department: 'Computer Science',       semester: 1 },
  { name: 'Yash Bhatt',       email: 'yash@demo.com',      studentId: 'STU024', department: 'Mechanical',             semester: 8 },
];

const extraAdmins = [
  { name: 'Prof. Ramesh Iyer', email: 'ramesh@demo.com', department: 'Computer Science' },
  { name: 'Dr. Kavita Menon',  email: 'kavita@demo.com',  department: 'Electronics' },
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const pad  = n   => String(n).padStart(2, '0');

// A plausible-looking 128-dim vector. NOTE: synthetic — see the caveat printed
// at the end of this script. Real encodings come from register_face.py.
const fakeEncoding = () =>
  Array.from({ length: 128 }, () => Number(((Math.random() - 0.5) * 0.4).toFixed(6)));

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log(`✅ Connected to ${mongoose.connection.name} @ ${mongoose.connection.host}:${mongoose.connection.port}\n`);

  // ─── 1. Extra admin/staff accounts ─────────────────────────────────────────
  let adminsAdded = 0;
  for (const a of extraAdmins) {
    if (await User.findOne({ email: a.email })) continue;
    await User.create({ ...a, password: PASSWORD, role: 'admin' });
    adminsAdded++;
    console.log(`👑 Admin added: ${a.name} (${a.email})`);
  }
  if (!adminsAdded) console.log('👑 Admins already present — skipped');

  // ─── 2. Extra students ─────────────────────────────────────────────────────
  console.log('\n👥 Students:');
  let studentsAdded = 0;
  for (const s of newStudents) {
    if (await Student.findOne({ studentId: s.studentId })) {
      console.log(`  ⏭️  ${s.studentId} ${s.name} — already exists`);
      continue;
    }
    const user = await User.create({
      name: s.name, email: s.email, password: PASSWORD,
      role: 'student', studentId: s.studentId, department: s.department,
    });
    await Student.create({
      user: user._id, studentId: s.studentId, name: s.name,
      email: s.email, department: s.department, semester: s.semester,
    });
    studentsAdded++;
    console.log(`  ➕ ${s.studentId} ${s.name} (${s.department}, sem ${s.semester})`);
  }

  // ─── 3. Face registration for ~60% of all students ─────────────────────────
  const allStudents = await Student.find().sort({ studentId: 1 });
  let facesRegistered = 0;
  for (const st of allStudents) {
    if (st.isFaceRegistered) continue;
    if (Math.random() > 0.6) continue;
    st.faceEncoding = fakeEncoding();
    st.isFaceRegistered = true;
    st.faceRegisteredAt = new Date();
    await st.save();
    facesRegistered++;
  }
  console.log(`\n🧑‍💻 Face encodings added for ${facesRegistered} student(s)`);

  // ─── 4. Attendance across the last ${DAYS_BACK} days (weekdays only) ────────
  console.log(`\n📅 Generating attendance for ${allStudents.length} students over ${DAYS_BACK} days...`);

  // Give each student their own baseline so charts show real spread
  const profile = new Map(
    allStudents.map(s => [String(s._id), 0.62 + Math.random() * 0.35]) // 62%–97%
  );

  const ops = [];
  const today = new Date();

  for (let d = DAYS_BACK - 1; d >= 0; d--) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends

    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const subject = pick(SUBJECTS);

    for (const st of allStudents) {
      const rate = profile.get(String(st._id));
      const r = Math.random();

      let status, time, confidence;
      if (r < rate) {
        status = 'present';
        time = `${pad(8 + Math.floor(Math.random() * 2))}:${pad(Math.floor(Math.random() * 60))}:00`;
        confidence = Number((0.86 + Math.random() * 0.13).toFixed(4));
      } else if (r < rate + 0.12) {
        status = 'late';
        time = `09:${pad(30 + Math.floor(Math.random() * 29))}:00`;
        confidence = Number((0.80 + Math.random() * 0.15).toFixed(4));
      } else {
        status = 'absent';
        time = '00:00:00';
        confidence = null;
      }

      const markedAt = new Date(date);
      const [hh, mm] = time.split(':');
      markedAt.setHours(Number(hh), Number(mm), 0, 0);

      const methodRoll = Math.random();
      const method = methodRoll < 0.82 ? 'face_recognition'
                   : methodRoll < 0.94 ? 'manual'
                   : 'qr_code';

      ops.push({
        updateOne: {
          filter: { student: st._id, date: dateStr },
          update: {
            $setOnInsert: {
              student: st._id,
              studentId: st.studentId,
              studentName: st.name,
              date: dateStr,
              time,
              markedAt,
              status,
              method,
              confidence: method === 'face_recognition' ? confidence : null,
              subject,
              location: 'Main Campus — Block A',
            },
          },
          upsert: true,
        },
      });
    }
  }

  const before = await Attendance.countDocuments();
  const res = await Attendance.bulkWrite(ops, { ordered: false });
  const after = await Attendance.countDocuments();
  console.log(`  ✅ ${res.upsertedCount} new records inserted (${before} → ${after}); existing records left untouched`);

  // ─── 5. Recompute attendancePercentage for every student ───────────────────
  console.log('\n📊 Recomputing attendance percentages...');
  for (const st of allStudents) {
    const total = await Attendance.countDocuments({ student: st._id });
    if (!total) continue;
    const attended = await Attendance.countDocuments({
      student: st._id, status: { $in: ['present', 'late'] },
    });
    st.attendancePercentage = Math.round((attended / total) * 100);
    await st.save();
  }
  console.log('  ✅ Done');

  // ─── Summary ───────────────────────────────────────────────────────────────
  const [users, students, attendance, faces] = await Promise.all([
    User.countDocuments(),
    Student.countDocuments(),
    Attendance.countDocuments(),
    Student.countDocuments({ isFaceRegistered: true }),
  ]);

  console.log('\n─────────────────────────────────────────');
  console.log(`  Database : ${mongoose.connection.name}`);
  console.log(`  Users              : ${users}`);
  console.log(`  Students           : ${students}  (${faces} with a face registered)`);
  console.log(`  Attendance records : ${attendance}`);
  console.log('  ─────────────────────────────────────');
  console.log(`  Added this run: ${adminsAdded} admin(s), ${studentsAdded} student(s), ${res.upsertedCount} attendance record(s)`);
  console.log('  ─────────────────────────────────────');
  console.log('  All demo accounts use password: password123');
  console.log('─────────────────────────────────────────');
  console.log('\n⚠️  Face encodings created here are RANDOM vectors, not real faces.');
  console.log('   They populate the dashboard only — the Python recognizer will');
  console.log('   never match them to a webcam. Use register_face.py for real ones.\n');

  await mongoose.disconnect();
}

run().catch(async err => {
  console.error('❌ Failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
