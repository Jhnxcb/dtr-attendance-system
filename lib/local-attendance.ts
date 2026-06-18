"use client";

import type { AttendanceRecord, AttendanceType } from "@/lib/types";
import { formatDeviceInfo, formatReadableDateTime, generateVerificationId } from "@/lib/utils";

const LOCAL_RECORDS_KEY = "dtr.localAttendanceRecords";
const PENDING_SCANS_KEY = "dtr.pendingAttendanceScans";

export type LocalSyncStatus = "local-pending" | "online-backed-up";

export type PendingAttendanceScan = {
  local_id: string;
  code: string;
  branch: string;
  device: string;
  photoDataUrl: string;
  latitude: number;
  longitude: number;
  createdAt: string;
};

export type LocalAttendanceRecord = AttendanceRecord & {
  local_id: string;
  local_sync_status: LocalSyncStatus;
  sync_error?: string;
};

type AttendanceSubmitPayload = {
  code: string;
  branch: string;
  device: string;
  photoDataUrl: string;
  latitude: number;
  longitude: number;
  capturedAt?: string;
};

export function getLocalAttendanceRecords() {
  return readJson<LocalAttendanceRecord[]>(LOCAL_RECORDS_KEY, []);
}

export function getPendingAttendanceScans() {
  return readJson<PendingAttendanceScan[]>(PENDING_SCANS_KEY, []);
}

export function saveOnlineRecordLocally(record: AttendanceRecord) {
  const localRecord: LocalAttendanceRecord = {
    ...record,
    local_id: record.id || record.verification_id,
    local_sync_status: "online-backed-up"
  };
  upsertLocalRecord(localRecord);
}

export function queueLocalAttendanceScan(input: AttendanceSubmitPayload, errorMessage = "Waiting for internet backup.") {
  const pending: PendingAttendanceScan = {
    local_id: `LOCAL-${Date.now()}`,
    code: input.code,
    branch: input.branch,
    device: input.device || formatDeviceInfo(),
    photoDataUrl: input.photoDataUrl,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: new Date().toISOString()
  };
  const records = getLocalAttendanceRecords();
  const employeeId = parseEmployeeId(input.code);
  const attendanceType = getNextLocalAttendanceType(records, employeeId);
  const timestamp = new Date(pending.createdAt);
  const localRecord: LocalAttendanceRecord = {
    id: pending.local_id,
    local_id: pending.local_id,
    timestamp: pending.createdAt,
    date: timestamp.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    time: timestamp.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }),
    employee_id: employeeId,
    employee_name: "Pending online sync",
    email: null,
    attendance_type: attendanceType,
    branch: input.branch || "Pending branch",
    latitude: input.latitude,
    longitude: input.longitude,
    address: `${input.latitude}, ${input.longitude}`,
    device: pending.device,
    profile_photo_url: null,
    original_photo_url: "",
    verification_photo_url: "",
    verification_id: generateVerificationId(timestamp, records.length + 1).replace("ATT-", "LOCAL-"),
    local_sync_status: "local-pending",
    sync_error: errorMessage
  };

  writeJson(PENDING_SCANS_KEY, dedupePending([...getPendingAttendanceScans(), pending]));
  upsertLocalRecord(localRecord);
  window.dispatchEvent(new Event("dtr-local-attendance-change"));
  return localRecord;
}

export async function syncPendingAttendanceScans() {
  const pendingScans = getPendingAttendanceScans();
  if (!pendingScans.length || !navigator.onLine) {
    return { synced: 0, remaining: pendingScans.length };
  }

  let synced = 0;
  const remaining: PendingAttendanceScan[] = [];

  for (const scan of pendingScans) {
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: scan.code,
          branch: scan.branch,
          device: scan.device,
          photoDataUrl: scan.photoDataUrl,
          latitude: scan.latitude,
          longitude: scan.longitude,
          capturedAt: scan.createdAt
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Online backup failed.");
      }

      saveOnlineRecordLocally(payload.record as AttendanceRecord);
      removeLocalPendingRecord(scan.local_id);
      synced += 1;
    } catch (error) {
      remaining.push(scan);
      markLocalRecordError(scan.local_id, error instanceof Error ? error.message : "Online backup failed.");
    }
  }

  writeJson(PENDING_SCANS_KEY, remaining);
  window.dispatchEvent(new Event("dtr-local-attendance-change"));
  return { synced, remaining: remaining.length };
}

export function exportLocalAttendanceExcel(records: Array<AttendanceRecord | LocalAttendanceRecord>, fileNamePrefix = "dtr-local-report") {
  const rows = [
    ["Timestamp", "Date", "Time", "Employee ID", "Name", "Email", "Type", "Branch", "Location", "Latitude", "Longitude", "Verification ID", "Local Status", "Sync Error"],
    ...records.map((record) => [
      formatReadableDateTime(record.timestamp),
      record.date,
      record.time,
      record.employee_id,
      record.employee_name,
      record.email || "",
      record.attendance_type,
      record.branch,
      record.address,
      record.latitude,
      record.longitude,
      record.verification_id,
      "local_sync_status" in record ? record.local_sync_status : "online",
      "sync_error" in record ? record.sync_error || "" : ""
    ])
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell ?? ""))}</td>`).join("")}</tr>`)
    .join("")}</table></body></html>`;
  downloadBlob(html, `${fileNamePrefix}-${new Date().toISOString().slice(0, 10)}.xls`, "application/vnd.ms-excel");
}

function upsertLocalRecord(record: LocalAttendanceRecord) {
  const existing = getLocalAttendanceRecords().filter((item) => item.local_id !== record.local_id && item.id !== record.id);
  writeJson(LOCAL_RECORDS_KEY, [record, ...existing].slice(0, 1000));
  window.dispatchEvent(new Event("dtr-local-attendance-change"));
}

function removeLocalPendingRecord(localId: string) {
  const records = getLocalAttendanceRecords().filter((record) => record.local_id !== localId);
  writeJson(LOCAL_RECORDS_KEY, records);
}

function markLocalRecordError(localId: string, message: string) {
  const records = getLocalAttendanceRecords().map((record) => (
    record.local_id === localId ? { ...record, sync_error: message } : record
  ));
  writeJson(LOCAL_RECORDS_KEY, records);
}

function getNextLocalAttendanceType(records: LocalAttendanceRecord[], employeeId: string): AttendanceType {
  const latest = records
    .filter((record) => record.employee_id === employeeId)
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())[0];
  return latest?.attendance_type === "TIME IN" ? "TIME OUT" : "TIME IN";
}

function parseEmployeeId(code: string) {
  try {
    const parsed = JSON.parse(code) as { employeeId?: string; staffId?: string; id?: string };
    return parsed.employeeId || parsed.staffId || parsed.id || code;
  } catch {
    return code.trim();
  }
}

function dedupePending(scans: PendingAttendanceScan[]) {
  const seen = new Set<string>();
  return scans.filter((scan) => {
    if (seen.has(scan.local_id)) return false;
    seen.add(scan.local_id);
    return true;
  });
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadBlob(content: string, fileName: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}
