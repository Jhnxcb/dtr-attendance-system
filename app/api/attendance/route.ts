import { NextResponse } from "next/server";
import { format } from "date-fns";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { dataUrlToBuffer, createVerificationImage } from "@/lib/photo";
import { generateVerificationId } from "@/lib/utils";
import { sendAttendanceEmail } from "@/lib/email";
import { syncAttendanceToSheets } from "@/lib/google-sheets";
import type { AttendanceRecord, AttendanceType, Employee } from "@/lib/types";

interface AttendanceRequest {
  code: string;
  branch?: string;
  device: string;
  photoDataUrl: string;
  latitude: number;
  longitude: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AttendanceRequest;
    if (!body.code || !body.photoDataUrl || !body.latitude || !body.longitude) {
      return NextResponse.json({ error: "Camera photo, GPS, and employee code are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const parsed = parseEmployeeCode(body.code);
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*, branches(name)")
      .eq("employee_id", parsed.employeeId)
      .eq("status", "active")
      .single();

    if (employeeError || !employee) {
      return NextResponse.json({ error: "Employee ID is not registered or inactive." }, { status: 404 });
    }

    const { data: latest } = await supabase
      .from("attendance_records")
      .select("attendance_type,timestamp")
      .eq("employee_id", employee.employee_id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest && Date.now() - new Date(latest.timestamp).getTime() < 60_000) {
      return NextResponse.json({ error: "Duplicate scan blocked. Please wait before scanning again." }, { status: 409 });
    }

    const attendanceType: AttendanceType = latest?.attendance_type === "TIME IN" ? "TIME OUT" : "TIME IN";
    const timestamp = new Date();
    const date = format(timestamp, "MMMM d, yyyy");
    const time = format(timestamp, "hh:mm:ss a");
    const verificationId = generateVerificationId(timestamp, Math.floor(Math.random() * 9999) + 1);
    const address = await reverseGeocode(body.latitude, body.longitude);
    const branchName = body.branch || employee.branches?.name || "Unassigned branch";
    const originalPhoto = dataUrlToBuffer(body.photoDataUrl);

    const verificationPhoto = await createVerificationImage({
      originalPhoto,
      employeeName: employee.full_name,
      employeeId: employee.employee_id,
      attendanceType,
      date,
      time,
      latitude: body.latitude,
      longitude: body.longitude,
      address,
      branch: branchName,
      verificationId
    });

    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "attendance-evidence";
    const folder = `${employee.employee_id}/${format(timestamp, "yyyyMMdd")}`;
    const originalPath = `${folder}/${verificationId}-original.jpg`;
    const verifiedPath = `${folder}/${verificationId}-verified.svg`;

    await uploadObject(bucket, originalPath, originalPhoto, "image/jpeg");
    await uploadObject(bucket, verifiedPath, verificationPhoto, "image/svg+xml");

    const { data: originalPublic } = supabase.storage.from(bucket).getPublicUrl(originalPath);
    const { data: verifiedPublic } = supabase.storage.from(bucket).getPublicUrl(verifiedPath);

    const recordPayload = {
      timestamp: timestamp.toISOString(),
      date,
      time,
      employee_id: employee.employee_id,
      employee_name: employee.full_name,
      email: employee.email,
      attendance_type: attendanceType,
      branch: branchName,
      latitude: body.latitude,
      longitude: body.longitude,
      address,
      device: body.device,
      profile_photo_url: employee.profile_photo_url,
      original_photo_url: originalPublic.publicUrl,
      verification_photo_url: verifiedPublic.publicUrl,
      verification_id: verificationId
    };

    const { data: saved, error: insertError } = await supabase
      .from("attendance_records")
      .insert(recordPayload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    const record = saved as AttendanceRecord;
    await Promise.allSettled([
      syncAttendanceToSheets(record),
      sendAttendanceEmail(record)
    ]);

    return NextResponse.json({
      attendanceType,
      verificationId,
      employee: normalizeEmployee(employee),
      record
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attendance failed." }, { status: 500 });
  }
}

function parseEmployeeCode(code: string) {
  try {
    const parsed = JSON.parse(code) as { employeeId?: string; staffId?: string; id?: string };
    return { employeeId: parsed.employeeId || parsed.staffId || parsed.id || code };
  } catch {
    return { employeeId: code.trim() };
  }
}

async function reverseGeocode(latitude: number, longitude: number) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`, {
      headers: { "User-Agent": "DTR Attendance System" }
    });
    const payload = await response.json();
    return payload.display_name || `${latitude}, ${longitude}`;
  } catch {
    return `${latitude}, ${longitude}`;
  }
}

async function uploadObject(bucket: string, path: string, body: Buffer, contentType: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false
  });
  if (error) throw error;
}

function normalizeEmployee(employee: any): Pick<Employee, "employee_id" | "full_name" | "email" | "profile_photo_url"> & { branch_name: string | null } {
  return {
    employee_id: employee.employee_id,
    full_name: employee.full_name,
    email: employee.email,
    profile_photo_url: employee.profile_photo_url,
    branch_name: employee.branches?.name || employee.branch || null
  };
}
