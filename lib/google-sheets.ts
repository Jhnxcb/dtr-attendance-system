import { google } from "googleapis";
import type { AttendanceRecord, Employee } from "@/lib/types";
import { formatReadableDateTime } from "@/lib/utils";

type SheetAttendanceRecord = AttendanceRecord & {
  hours_worked?: string;
  time_in?: string;
  time_in_date?: string;
  role?: string;
  department?: string;
};

function getSheetsClient() {
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED === "false") {
    return null;
  }

  const credentials = getGoogleCredentials();
  const email = credentials?.email || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = credentials?.key || normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!email || !key || !spreadsheetId) {
    return null;
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

function getGoogleCredentials() {
  const rawJson = getServiceAccountJson();
  if (!rawJson) return null;

  try {
    const parsed = JSON.parse(rawJson) as { client_email?: string; private_key?: string };
    if (parsed.client_email && parsed.private_key) {
      return {
        email: parsed.client_email,
        key: normalizeKeyLineBreaks(parsed.private_key)
      };
    }
  } catch {
    return null;
  }

  return null;
}

function getServiceAccountJson() {
  const rawBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (rawBase64) {
    try {
      return Buffer.from(rawBase64.trim(), "base64").toString("utf8");
    } catch {
      return null;
    }
  }

  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON || null;
}

function normalizePrivateKey(rawKey?: string) {
  if (!rawKey) return undefined;

  const trimmed = rawKey.trim();
  const unquoted = (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )
    ? trimmed.slice(1, -1)
    : trimmed;

  try {
    const parsed = JSON.parse(unquoted) as { private_key?: string };
    if (parsed.private_key) {
      return normalizeKeyLineBreaks(parsed.private_key);
    }
  } catch {
    // The env value is usually just the private_key string, not the full JSON file.
  }

  const privateKeyMatch = unquoted.match(/["']?private_key["']?\s*:\s*["']([\s\S]*?)["']\s*,?$/);
  if (privateKeyMatch?.[1]) {
    return normalizeKeyLineBreaks(privateKeyMatch[1]);
  }

  return normalizeKeyLineBreaks(unquoted);
}

function normalizeKeyLineBreaks(value: string) {
  return value
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");
}

async function ensureSheet(title: string, headers: string[]) {
  const client = getSheetsClient();
  if (!client) return;
  const meta = await client.sheets.spreadsheets.get({ spreadsheetId: client.spreadsheetId });
  const exists = meta.data.sheets?.some((sheet) => sheet.properties?.title === title);
  if (!exists) {
    await client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: client.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] }
    });
  }

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${title}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: [headers] }
  });
}

export async function syncAttendanceToSheets(record: SheetAttendanceRecord) {
  const client = getSheetsClient();
  if (!client) return;

  try {
    const month = new Date(record.timestamp).toLocaleString("en-US", { month: "long" }).toUpperCase();
    const year = new Date(record.timestamp).getFullYear();
    const monthlySheet = `${year}_${toTitleCase(month)}`;
    const employeeNameKey = record.employee_name.replace(/[^a-z0-9]+/gi, "_").toUpperCase();
    const employeeSheets = Array.from(new Set([
      `${record.role === "Volunteer" ? "Volunteers" : "Staff"}_${employeeNameKey}`,
      `EMP_${employeeNameKey}`
    ]));

    const masterHeaders = ["Timestamp", "Date", "Month", "Employee ID", "Name", "Email", "Attendance Type", "Branch", "Location", "Latitude", "Longitude", "Verification ID", "Original Photo URL", "Verification Photo URL", "Hours Worked", "Role", "Department"];
    await ensureSheet("MASTER_ATTENDANCE", masterHeaders);
    await ensureSheet(monthlySheet, masterHeaders);
    for (const employeeSheet of employeeSheets) {
      await ensureSheet(employeeSheet, ["Date", "Time In", "Time Out", "Hours Worked", "Branch", "Location", "Status"]);
    }
    await ensureSheet("ATTENDANCE_EVIDENCE", ["Timestamp", "Employee ID", "Employee Name", "Attendance Type", "Original Photo URL", "Verification Photo URL", "Location"]);

    const readableTimestamp = formatReadableDateTime(record.timestamp);
    const masterRow = [readableTimestamp, record.date, toTitleCase(month), record.employee_id, record.employee_name, record.email, record.attendance_type, record.branch, record.address, record.latitude, record.longitude, record.verification_id, record.original_photo_url, record.verification_photo_url, record.hours_worked || "", record.role || "", record.department || ""];
    await append(client, "MASTER_ATTENDANCE", masterRow);
    await append(client, monthlySheet, masterRow);
    for (const employeeSheet of employeeSheets) {
      await upsertEmployeeAttendanceRow(client, employeeSheet, record);
    }
    await append(client, "ATTENDANCE_EVIDENCE", [readableTimestamp, record.employee_id, record.employee_name, record.attendance_type, record.original_photo_url, record.verification_photo_url, record.address]);
  } catch (error) {
    return { warning: error instanceof Error ? error.message : "Google Sheets sync failed." };
  }
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export async function syncEmployeeToSheets(employee: Employee) {
  const client = getSheetsClient();
  if (!client) return;
  try {
    await ensureSheet("EMPLOYEES", ["Employee ID", "Name", "Email", "Position", "Department", "Branch", "Status"]);
    await ensureSheet(`EMP_${employee.full_name.replace(/[^a-z0-9]+/gi, "_").toUpperCase()}`, ["Date", "Time In", "Time Out", "Hours Worked", "Branch", "Location", "Status"]);
    await append(client, "EMPLOYEES", [employee.employee_id, employee.full_name, employee.email, employee.position, employee.department, employee.branch_name, employee.status]);
  } catch (error) {
    return { warning: error instanceof Error ? error.message : "Google Sheets sync failed." };
  }
}

async function append(client: NonNullable<ReturnType<typeof getSheetsClient>>, sheet: string, row: unknown[]) {
  await client.sheets.spreadsheets.values.append({
    spreadsheetId: client.spreadsheetId,
    range: `${sheet}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] }
  });
}

async function upsertEmployeeAttendanceRow(
  client: NonNullable<ReturnType<typeof getSheetsClient>>,
  sheet: string,
  record: SheetAttendanceRecord
) {
  if (record.attendance_type === "TIME IN") {
    await append(client, sheet, [record.date, record.time, "", "", record.branch, record.address, "Open"]);
    return;
  }

  const rowsResponse = await client.sheets.spreadsheets.values.get({
    spreadsheetId: client.spreadsheetId,
    range: `${sheet}!A2:G`
  });
  const rows = rowsResponse.data.values || [];
  const rowIndex = findOpenEmployeeRow(rows, record.time_in_date || record.date);

  if (rowIndex === -1) {
    await append(client, sheet, [record.time_in_date || record.date, record.time_in || "", record.time, record.hours_worked || "", record.branch, record.address, record.time_in ? "Complete" : "Missing TIME IN"]);
    return;
  }

  await client.sheets.spreadsheets.values.update({
    spreadsheetId: client.spreadsheetId,
    range: `${sheet}!C${rowIndex + 2}:G${rowIndex + 2}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[record.time, record.hours_worked || "", record.branch, record.address, "Complete"]]
    }
  });
}

function findOpenEmployeeRow(rows: unknown[][], date: string) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const rowDate = String(row[0] || "");
    const timeOut = String(row[2] || "");
    if (rowDate === date && !timeOut) {
      return index;
    }
  }

  return -1;
}
