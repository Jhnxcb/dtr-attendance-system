import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncEmployeeToSheets } from "@/lib/google-sheets";
import type { Employee } from "@/lib/types";

export async function GET() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("employees")
    .select("*, branches(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const employeeId = String(form.get("employee_id") || "").trim();
    const fullName = String(form.get("full_name") || "").trim();
    if (!employeeId || !fullName) {
      return NextResponse.json({ error: "Employee ID and full name are required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "attendance-evidence";
    let profilePhotoUrl = String(form.get("profile_photo_url") || "");
    const photo = form.get("photo");

    if (photo instanceof File && photo.size > 0) {
      const extension = photo.name.split(".").pop() || "jpg";
      const path = `profiles/${employeeId}-${Date.now()}.${extension}`;
      const bytes = Buffer.from(await photo.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
        contentType: photo.type || "image/jpeg",
        upsert: true
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      profilePhotoUrl = data.publicUrl;
    }

    const payload = {
      employee_id: employeeId,
      full_name: fullName,
      email: String(form.get("email") || ""),
      phone: String(form.get("phone") || ""),
      position: String(form.get("position") || ""),
      department: String(form.get("department") || ""),
      branch_id: String(form.get("branch_id") || "") || null,
      profile_photo_url: profilePhotoUrl,
      status: String(form.get("status") || "active"),
      role: String(form.get("role") || "employee")
    };

    const { data: saved, error } = await supabase
      .from("employees")
      .upsert(payload, { onConflict: "employee_id" })
      .select("*, branches(name)")
      .single();

    if (error) throw error;
    const sheetsResult = await syncEmployeeToSheets({
      ...(saved as Employee),
      branch_name: saved.branches?.name || null
    });

    return NextResponse.json({ ...saved, sheetsWarning: sheetsResult?.warning || null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Employee save failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = String(searchParams.get("employee_id") || "").trim();

    if (!employeeId) {
      return NextResponse.json({ error: "Employee ID is required." }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("employees")
      .update({ status: "inactive" })
      .eq("employee_id", employeeId)
      .select("employee_id,full_name,status")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Employee remove failed." }, { status: 500 });
  }
}
