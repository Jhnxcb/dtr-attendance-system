import type { AttendanceRecord } from "@/lib/types";
import { formatLocationName, formatReadableDateTime } from "@/lib/utils";

export type AttendanceSession = {
  date: string;
  timeIn: string;
  timeOut: string;
  hours: number;
  branch: string;
  location: string;
  timeInEvidence: string;
  timeOutEvidence: string;
  timeInId: string;
  timeOutId: string;
};

export function buildAttendanceSessions(records: AttendanceRecord[]) {
  const sorted = [...records].sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  const sessions: AttendanceSession[] = [];
  let openTimeIn: AttendanceRecord | null = null;

  for (const record of sorted) {
    if (record.attendance_type === "TIME IN") {
      if (openTimeIn) {
        sessions.push(createSession(openTimeIn, null));
      }
      openTimeIn = record;
      continue;
    }

    sessions.push(createSession(openTimeIn, record));
    openTimeIn = null;
  }

  if (openTimeIn) {
    sessions.push(createSession(openTimeIn, null));
  }

  return sessions;
}

export function getTotalHours(sessions: AttendanceSession[]) {
  return Number(sessions.reduce((sum, session) => sum + session.hours, 0).toFixed(2));
}

function createSession(timeIn: AttendanceRecord | null, timeOut: AttendanceRecord | null): AttendanceSession {
  const mainRecord = timeOut || timeIn;
  const hours = timeIn && timeOut
    ? Math.max(0, (new Date(timeOut.timestamp).getTime() - new Date(timeIn.timestamp).getTime()) / 3_600_000)
    : 0;

  return {
    date: mainRecord?.date || "",
    timeIn: timeIn ? formatReadableDateTime(timeIn.timestamp) : "Missing TIME IN",
    timeOut: timeOut ? formatReadableDateTime(timeOut.timestamp) : "Missing TIME OUT",
    hours: Number(hours.toFixed(2)),
    branch: mainRecord?.branch || "",
    location: formatLocationName(mainRecord?.address, mainRecord?.branch),
    timeInEvidence: timeIn?.verification_photo_url || "",
    timeOutEvidence: timeOut?.verification_photo_url || "",
    timeInId: timeIn?.verification_id || "",
    timeOutId: timeOut?.verification_id || ""
  };
}
