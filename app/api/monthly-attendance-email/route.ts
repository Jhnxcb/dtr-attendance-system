import { NextResponse } from "next/server";
import { buildAttendanceSessions, getTotalHours } from "@/lib/attendance-summary";
import { sendMonthlyAttendanceSummaryEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { AttendanceRecord, Employee } from "@/lib/types";

const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Asia/Manila";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = authorizeCron(request);
  if (authResult) return authResult;

  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("force") !== "true" && !isFirstLocalDayOfMonth()) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Monthly email runs only after the previous local month is complete." });
    }

    const period = getPreviousMonthPeriod();
    const supabase = createSupabaseAdminClient();
    const { data: employees, error: employeeError } = await supabase
      .from("employees")
      .select("*")
      .eq("status", "active")
      .not("email", "is", null);

    if (employeeError) throw employeeError;

    const sent: string[] = [];
    const skipped: string[] = [];

    for (const employee of (employees || []) as Employee[]) {
      if (!employee.email) {
        skipped.push(employee.employee_id);
        continue;
      }

      const archiveKey = `${employee.employee_id}:${period.monthKey}`;
      const alreadySent = await wasMonthlyEmailSent(supabase, archiveKey);
      if (alreadySent) {
        skipped.push(employee.employee_id);
        continue;
      }

      const { data: records, error: recordsError } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("employee_id", employee.employee_id)
        .gte("timestamp", period.startIso)
        .lt("timestamp", period.endIso)
        .order("timestamp", { ascending: true });

      if (recordsError) throw recordsError;

      const sessions = buildAttendanceSessions((records || []) as AttendanceRecord[]);
      await sendMonthlyAttendanceSummaryEmail({
        to: employee.email,
        employeeName: employee.full_name,
        employeeId: employee.employee_id,
        monthLabel: period.monthLabel,
        sessions,
        totalHours: getTotalHours(sessions)
      });
      await markMonthlyEmailSent(supabase, archiveKey, employee, period, records?.length || 0);
      sent.push(employee.employee_id);
    }

    return NextResponse.json({
      ok: true,
      month: period.monthLabel,
      sent,
      skipped
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeMessage = "message" in error ? String(error.message || "") : "";
    const maybeDetails = "details" in error ? String(error.details || "") : "";
    const maybeHint = "hint" in error ? String(error.hint || "") : "";
    return [maybeMessage, maybeDetails, maybeHint].filter(Boolean).join(" ") || JSON.stringify(error);
  }
  return "Monthly email failed.";
}

function isFirstLocalDayOfMonth() {
  const now = new Date();
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const day = Number(localDate.split("-")[2]);
  return day === 1;
}

function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;

  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (authHeader === expected) return null;

  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function getPreviousMonthPeriod() {
  const now = new Date();
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now);
  const currentYear = Number(localParts.find((part) => part.type === "year")?.value || now.getUTCFullYear());
  const currentMonth = Number(localParts.find((part) => part.type === "month")?.value || now.getUTCMonth() + 1);
  const previousMonthDate = new Date(Date.UTC(currentYear, currentMonth - 2, 1));
  const previousYear = previousMonthDate.getUTCFullYear();
  const previousMonth = previousMonthDate.getUTCMonth() + 1;
  const start = localMidnightToUtc(previousYear, previousMonth, 1);
  const endMonthDate = new Date(Date.UTC(previousYear, previousMonth, 1));
  const end = localMidnightToUtc(endMonthDate.getUTCFullYear(), endMonthDate.getUTCMonth() + 1, 1);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(previousYear, previousMonth - 1, 1)));

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    monthKey: `${previousYear}_${String(previousMonth).padStart(2, "0")}`,
    monthLabel
  };
}

function localMidnightToUtc(year: number, month: number, day: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(utcGuess);
  const actualLocalAsUtc = Date.UTC(
    Number(localParts.find((part) => part.type === "year")?.value || year),
    Number(localParts.find((part) => part.type === "month")?.value || month) - 1,
    Number(localParts.find((part) => part.type === "day")?.value || day),
    Number(localParts.find((part) => part.type === "hour")?.value || 0),
    Number(localParts.find((part) => part.type === "minute")?.value || 0),
    Number(localParts.find((part) => part.type === "second")?.value || 0)
  );
  const desiredLocalAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = actualLocalAsUtc - utcGuess.getTime();
  return new Date(desiredLocalAsUtc - offset);
}

async function wasMonthlyEmailSent(supabase: ReturnType<typeof createSupabaseAdminClient>, archiveKey: string) {
  const { data, error } = await supabase
    .from("monthly_email_archives")
    .select("id")
    .eq("archive_key", archiveKey)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  return Boolean(data);
}

async function markMonthlyEmailSent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  archiveKey: string,
  employee: Employee,
  period: ReturnType<typeof getPreviousMonthPeriod>,
  recordCount: number
) {
  const { error } = await supabase
    .from("monthly_email_archives")
    .insert({
      archive_key: archiveKey,
      employee_id: employee.employee_id,
      employee_name: employee.full_name,
      email: employee.email,
      month_key: period.monthKey,
      month_label: period.monthLabel,
      record_count: recordCount
    });

  if (error) throw error;
}
