import { Resend } from "resend";
import type { AttendanceRecord } from "@/lib/types";
import type { AttendanceSession } from "@/lib/attendance-summary";
import { formatLocationName, formatReadableDateTime } from "@/lib/utils";

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

export async function sendMonthlyAttendanceSummaryEmail(input: {
  to: string;
  employeeName: string;
  employeeId: string;
  monthLabel: string;
  sessions: AttendanceSession[];
  totalHours: number;
}) {
  if (process.env.EMAIL_NOTIFICATIONS_ENABLED === "false") return;
  if (!input.to) return;

  const email = buildMonthlyAttendanceSummaryEmail(input);
  await sendEmail(input.to, email);
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
  const locationName = formatLocationName(record.address, record.branch);
  const logoUrl = getLogoUrl();

  return {
    subject: `${record.attendance_type} RECORDED - ${record.employee_name}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#333;line-height:1.45">
        <img src="${escapeAttribute(logoUrl)}" width="72" height="72" alt="GOKIDZ logo" style="display:block;object-fit:contain;border:0" />
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
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb"><strong>Location</strong></td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${escapeHtml(locationName)}</td></tr>
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
      `Location: ${locationName}`,
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

async function sendEmail(to: string, email: { subject: string; html: string; text: string }) {
  const provider = process.env.EMAIL_PROVIDER || "resend";

  if (provider === "google_apps_script") {
    await sendWithGoogleAppsScript(to, email);
    return;
  }

  if (!process.env.RESEND_API_KEY) return;
  await sendWithResend(to, email);
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

function buildMonthlyAttendanceSummaryEmail(input: {
  employeeName: string;
  employeeId: string;
  monthLabel: string;
  sessions: AttendanceSession[];
  totalHours: number;
}) {
  const logoUrl = getLogoUrl();
  const rows = input.sessions.length
    ? input.sessions.map((session) => `
      <tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(session.date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(session.timeIn)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(session.timeOut)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right">${session.hours.toFixed(2)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(session.branch)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${escapeHtml(session.location)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb">${session.timeInEvidence ? `<a href="${escapeAttribute(session.timeInEvidence)}">Time In</a>` : ""}${session.timeOutEvidence ? `${session.timeInEvidence ? " / " : ""}<a href="${escapeAttribute(session.timeOutEvidence)}">Time Out</a>` : ""}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" style="padding:12px;border-bottom:1px solid #e5e7eb">No attendance records were found for this month.</td></tr>`;

  return {
    subject: `Monthly Attendance Summary - ${input.monthLabel}`,
    html: `
      <div style="font-family:Arial,sans-serif;color:#333;line-height:1.45">
        <img src="${escapeAttribute(logoUrl)}" width="72" height="72" alt="GOKIDZ logo" style="display:block;object-fit:contain;border:0" />
        <h2 style="color:#1C5112">Monthly Attendance Summary</h2>
        <p>Hello ${escapeHtml(input.employeeName)}, here is your complete attendance record for ${escapeHtml(input.monthLabel)}.</p>
        <p><strong>Employee ID:</strong> ${escapeHtml(input.employeeId)}<br /><strong>Total Hours:</strong> ${input.totalHours.toFixed(2)}</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px">
          <thead>
            <tr style="background:#1C5112;color:#fff">
              <th style="padding:8px 10px;text-align:left">Date</th>
              <th style="padding:8px 10px;text-align:left">Time In</th>
              <th style="padding:8px 10px;text-align:left">Time Out</th>
              <th style="padding:8px 10px;text-align:right">Hours</th>
              <th style="padding:8px 10px;text-align:left">Branch</th>
              <th style="padding:8px 10px;text-align:left">Location</th>
              <th style="padding:8px 10px;text-align:left">Evidence</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `,
    text: [
      `Monthly Attendance Summary - ${input.monthLabel}`,
      `Employee: ${input.employeeName} (${input.employeeId})`,
      `Total Hours: ${input.totalHours.toFixed(2)}`,
      "",
      ...input.sessions.map((session) => `${session.date} | ${session.timeIn} | ${session.timeOut} | ${session.hours.toFixed(2)} hrs | ${session.branch} | ${session.location}`)
    ].join("\n")
  };
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function getLogoUrl() {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "https://dtr-attendance-system.vercel.app"
  ).trim();
  const normalizedAppUrl = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
  return `${normalizedAppUrl.replace(/\/$/, "")}/logo.png`;
}
