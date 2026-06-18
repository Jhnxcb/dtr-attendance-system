import { Resend } from "resend";
import type { AttendanceRecord } from "@/lib/types";
import { formatReadableDateTime } from "@/lib/utils";

type EmailAttendanceRecord = AttendanceRecord & {
  hours_worked?: string;
  time_in?: string;
  time_in_date?: string;
};

export async function sendAttendanceEmail(record: EmailAttendanceRecord) {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED === "false") return;
  if (!record.email) return;

  const email = buildAttendanceEmail(record);
  const provider = process.env.EMAIL_PROVIDER || "resend";

  if (provider === "google_apps_script") {
    await sendWithGoogleAppsScript(record.email, email);
    return;
  }

  if (!process.env.RESEND_API_KEY) return;
  await sendWithResend(record.email, email);
}

function buildAttendanceEmail(record: EmailAttendanceRecord) {
  const hoursWorkedRow = record.attendance_type === "TIME OUT" && record.hours_worked
    ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Hours Worked</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.hours_worked)} hours</td></tr>`
    : "";
  const timeInRow = record.attendance_type === "TIME OUT" && record.time_in
    ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Time In</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.time_in_date || record.date)} ${escapeHtml(record.time_in)}</td></tr>`
    : "";
  const photos = [
    record.verification_photo_url ? `<p><strong>Verified Evidence Photo</strong><br /><a href="${escapeAttribute(record.verification_photo_url)}">Open verified evidence</a></p><img src="${escapeAttribute(record.verification_photo_url)}" alt="Verified attendance evidence" style="max-width:100%;border:1px solid #d1d5db;border-radius:8px" />` : "",
    record.original_photo_url ? `<p><strong>Original Camera Photo</strong><br /><a href="${escapeAttribute(record.original_photo_url)}">Open original photo</a></p>` : ""
  ].filter(Boolean).join("");

  return {
    subject: `${record.attendance_type} RECORDED - ${record.employee_name}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#333;line-height:1.45">
        <img src="${process.env.NEXT_PUBLIC_APP_URL || ""}/logo.png" width="72" alt="Logo" />
        <h2 style="color:#1C5112">${record.attendance_type} RECORDED</h2>
        <p>Hello ${escapeHtml(record.employee_name)}, your ${record.attendance_type} attendance has been recorded.</p>
        <table style="border-collapse:collapse;width:100%;max-width:680px">
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Employee ID</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.employee_id)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Attendance Type</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${record.attendance_type}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Timestamp</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(formatReadableDateTime(record.timestamp))}</td></tr>
          ${timeInRow}
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>${record.attendance_type === "TIME OUT" ? "Time Out" : "Time In"}</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.date)} ${escapeHtml(record.time)}</td></tr>
          ${hoursWorkedRow}
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Branch</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.branch)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Location</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.address)}</td></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Verification ID</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(record.verification_id)}</td></tr>
        </table>
        <h3 style="color:#1C5112;margin-top:24px">Photo Evidence</h3>
        ${photos || "<p>No photo evidence URL was attached.</p>"}
      </div>
    `,
    text: [
      `${record.attendance_type} RECORDED - ${record.employee_name}`,
      `Employee ID: ${record.employee_id}`,
      `Timestamp: ${formatReadableDateTime(record.timestamp)}`,
      record.attendance_type === "TIME OUT" && record.time_in ? `Time In: ${record.time_in_date || record.date} ${record.time_in}` : "",
      `${record.attendance_type === "TIME OUT" ? "Time Out" : "Time In"}: ${record.date} ${record.time}`,
      record.attendance_type === "TIME OUT" && record.hours_worked ? `Hours Worked: ${record.hours_worked}` : "",
      `Branch: ${record.branch}`,
      `Location: ${record.address}`,
      `Verification ID: ${record.verification_id}`,
      record.verification_photo_url ? `Verified Evidence: ${record.verification_photo_url}` : "",
      record.original_photo_url ? `Original Photo: ${record.original_photo_url}` : ""
    ].filter(Boolean).join("\n")
  };
}

async function sendWithResend(to: string, email: { subject: string; html: string; text: string }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "DTR <noreply@example.com>",
    to,
    subject: email.subject,
    html: email.html,
    text: email.text
  });
}

async function sendWithGoogleAppsScript(to: string, email: { subject: string; html: string; text: string }) {
  const url = process.env.GOOGLE_APPS_SCRIPT_EMAIL_URL;
  if (!url) return;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "sendAttendanceEmail",
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      token: process.env.GOOGLE_APPS_SCRIPT_EMAIL_TOKEN || ""
    })
  });

  const body = await response.text();
  if (!response.ok || !body.includes("\"ok\":true")) {
    throw new Error(`Google Apps Script email failed: ${body || response.statusText}`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
