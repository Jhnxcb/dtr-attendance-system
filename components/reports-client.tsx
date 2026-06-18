"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { hasSupabaseBrowserConfig } from "@/lib/supabase-browser";
import { formatReadableDateTime } from "@/lib/utils";
import type { AttendanceRecord } from "@/lib/types";

export function ReportsClient() {
  const hasBackend = hasSupabaseBrowserConfig();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    fetch("/api/attendance-records?limit=1000")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setRecords((data || []) as AttendanceRecord[]));
  }, []);

  const filtered = records.filter((record) => {
    const text = `${record.employee_name} ${record.employee_id} ${record.branch} ${record.address}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (!type || record.attendance_type === type);
  });

  function exportCsv() {
    const headers = ["Timestamp", "Date", "Time", "Employee ID", "Name", "Email", "Type", "Branch", "Location", "Latitude", "Longitude", "Verification ID", "Original Photo", "Verification Photo"];
    const csv = [headers, ...filtered.map((record) => [formatReadableDateTime(record.timestamp), record.date, record.time, record.employee_id, record.employee_name, record.email, record.attendance_type, record.branch, record.address, record.latitude, record.longitude, record.verification_id, record.original_photo_url, record.verification_photo_url])]
      .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `dtr-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <AppShell active="Reports">
      <div className="grid gap-5">
        <div>
          <p className="text-xs font-black uppercase text-brand-hill">Reporting</p>
          <h1 className="text-3xl font-black text-brand-dark">Attendance Reports</h1>
        </div>
        {hasBackend ? (
          <Card>
            <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
              <Label>Search<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee, branch, location" /></Label>
              <Label>Type<Select value={type} onChange={(event) => setType(event.target.value)}><option value="">All</option><option value="TIME IN">TIME IN</option><option value="TIME OUT">TIME OUT</option></Select></Label>
              <Button type="button" onClick={exportCsv}><Download size={16} /> Export CSV</Button>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Supabase setup required</CardTitle></CardHeader>
            <p className="text-slate-600">Add your Supabase URL and anon key in .env.local, then restart the app to load reports.</p>
          </Card>
        )}
        <Card>
          <CardHeader><CardTitle>{filtered.length} Records</CardTitle></CardHeader>
          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-brand-yellow/40">
                <tr>{["Date", "Employee", "Type", "Branch", "Location", "Evidence"].map((header) => <th key={header} className="p-3">{header}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((record) => (
                  <tr key={record.id} className="border-b">
                    <td className="p-3">{formatReadableDateTime(record.timestamp)}</td>
                    <td className="p-3">{record.employee_name}<br /><span className="text-slate-500">{record.employee_id}</span></td>
                    <td className="p-3">{record.attendance_type}</td>
                    <td className="p-3">{record.branch}</td>
                    <td className="p-3">{record.address}</td>
                    <td className="p-3"><a className="font-bold text-brand-hill" href={record.verification_photo_url} target="_blank">Open</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
