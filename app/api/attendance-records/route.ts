import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") || "500");
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 2000) : 500;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("attendance_records")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(safeLimit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Attendance records could not be loaded." }, { status: 500 });
  }
}
