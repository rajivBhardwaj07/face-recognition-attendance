/**
 * Email notification config using Nodemailer
 */

const nodemailer = require('nodemailer');

const createTransporter = () => {
  if (!process.env.SMTP_USER) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

/**
 * Send attendance confirmation email to student
 */
exports.sendAttendanceEmail = async (email, name, date, time, status) => {
  const transporter = createTransporter();
  if (!transporter) return; // Email not configured

  const statusEmoji = status === 'present' ? '✅' : status === 'late' ? '⚠️' : '❌';
  const statusColor = status === 'present' ? '#22c55e' : status === 'late' ? '#f59e0b' : '#ef4444';

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Smart Attendance <noreply@attendance.app>',
    to: email,
    subject: `${statusEmoji} Attendance Marked — ${date}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: #1e293b; border-radius: 12px; padding: 30px; text-align: center;">
            <h1 style="color: #f8fafc; margin: 0 0 8px;">Smart Attendance</h1>
            <p style="color: #94a3b8; margin: 0;">Attendance Notification</p>
          </div>
          <div style="background: white; border-radius: 12px; padding: 30px; margin-top: 16px; border: 1px solid #e2e8f0;">
            <p style="color: #1e293b; font-size: 18px;">Hi <strong>${name}</strong>,</p>
            <p style="color: #475569;">Your attendance has been recorded:</p>
            
            <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid ${statusColor};">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">Date:</span>
                <strong style="color: #1e293b;">${date}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                <span style="color: #64748b;">Time:</span>
                <strong style="color: #1e293b;">${time}</strong>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="color: #64748b;">Status:</span>
                <strong style="color: ${statusColor}; text-transform: uppercase;">${statusEmoji} ${status}</strong>
              </div>
            </div>
            
            <p style="color: #94a3b8; font-size: 13px; text-align: center;">
              This is an automated notification from Smart Attendance System
            </p>
          </div>
        </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};
