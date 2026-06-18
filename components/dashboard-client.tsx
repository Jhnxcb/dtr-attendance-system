"use client";

import { useEffect, useState } from "react";
import { Activity, Building2, Clock, LogIn, LogOut, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { hasSupabaseBrowserConfig } from "@/lib/supabase-browser";
import { formatReadableDate, formatReadableTime, isSameLocalDate } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";

export function DashboardClient() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const hasBackend = hasSupabaseBrowserConfig();

  useEffect(() => {
    loadRecords();
    const timer = window.setInterval(loadRecords, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadRecords() {
    const response = await fetch("/api/attendance-records?limit=200");
    if (!response.ok) return;
    const payload = await response.json();
    setRecords((payload || []) as AttendanceRecord[]);
  }

  const todayRows = records.filter((record) => isSameLocalDate(record.timestamp));
  const timeIns = todayRows.filter((record) => record.attendance_type === "TIME IN");
  const timeOuts = todayRows.filter((record) => record.attendance_type === "TIME OUT");
  const branchCount = new Set(records.map((record) => record.branch)).size;

  if (!hasBackend) {
    return (
      <AppShell active="Dashboard">
        <Card>
          <CardHeader>
            <CardTitle>Supabase setup required</CardTitle>
          </CardHeader>
          <p className="text-slate-600">
            Add your Supabase URL and anon key in .env.local, then restart the app. The scanner page can still open while setup is not finished.
          </p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell active="Dashboard">
      <div className="grid gap-5">
        <div>
          <p className="text-xs font-black uppercase text-brand-hill">Realtime</p>
          <h1 className="text-3xl font-black text-brand-dark">Attendance Dashboard</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric title="Present Today" value={timeIns.length} icon={Users} />
          <Metric title="Time In" value={timeIns.length} icon={LogIn} />
          <Metric title="Time Out" value={timeOuts.length} icon={LogOut} />
          <Metric title="Active Branches" value={branchCount} icon={Building2} />
          <Metric title="Events" value={todayRows.length} icon={Activity} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Latest Attendance</CardTitle>
            <Clock className="text-brand-hill" />
          </CardHeader>
          <div className="grid gap-3">
            {records.map((record) => (
              <article key={record.id} className="grid gap-3 rounded-ui border border-slate-200 p-3 md:grid-cols-[72px_1fr_auto]">
                {record.profile_photo_url ? <img src={record.profile_photo_url} alt="" className="h-16 w-16 rounded-ui object-cover" /> : <div className="h-16 w-16 rounded-ui bg-brand-yellow" />}
                <div>
                  <strong className="block text-brand-dark">{record.employee_name}</strong>
                  <span className="text-sm font-bold text-slate-500">{record.employee_id}</span>
                  <p className="text-sm text-slate-600">{record.branch} - {record.address}</p>
                  <p className="text-xs text-slate-500">{record.verification_id}</p>
                </div>
                <div className="grid justify-items-start gap-2 md:justify-items-end">
                  <span className="rounded-full bg-brand-lime px-3 py-1 text-xs font-black">{record.attendance_type}</span>
                  <TimestampBlock value={record.timestamp} />
                  <a className="text-sm font-bold text-brand-hill" href={record.verification_photo_url} target="_blank">Evidence</a>
                </div>
              </article>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function TimestampBlock({ value }: { value: string | Date }) {
  return (
    <div className="grid gap-0.5 text-left md:text-right">
      <span className="font-bold text-brand-dark">{formatReadableDate(value)}</span>
      <span className="text-sm font-semibold text-slate-500">{formatReadableTime(value)}</span>
    </div>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof Users }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-sm font-bold text-slate-500">{title}</span>
          <strong className="block text-3xl font-black text-brand-hill">{value}</strong>
        </div>
        <Icon className="text-brand-orange" />
      </div>
    </Card>
  );
}
