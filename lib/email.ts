import { Resend } from "resend";
import type { AttendanceRecord } from "@/lib/types";

export async function sendAttendanceEmail(record: AttendanceRecord) {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED === "false") return;
  if (!record.email || !process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "DTR <noreply@example.com>",
    to: record.email,
    subject: `${record.attendance_type} RECORDED`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#333">
        <img src="${process.env.NEXT_PUBLIC_APP_URL || ""}/logo.png" width="72" alt="Logo" />
        <h2 style="color:#1C5112">${record.attendance_type} RECORDED</h2>
        <p>Hello ${record.employee_name}, your attendance has been recorded.</p>
        <table>
          <tr><td><strong>Employee ID</strong></td><td>${record.employee_id}</td></tr>
          <tr><td><strong>Date</strong></td><td>${record.date}</td></tr>
          <tr><td><strong>Time</strong></td><td>${record.time}</td></tr>
          <tr><td><strong>Location</strong></td><td>${record.address}</td></tr>
          <tr><td><strong>Verification ID</strong></td><td>${record.verification_id}</td></tr>
        </table>
      </div>
    `
  });
}
