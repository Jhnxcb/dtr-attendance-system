"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, Camera, Download, FileSpreadsheet, QrCode, Settings, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { exportLocalAttendanceExcel, exportStaffAttendanceExcel, getLocalAttendanceRecords, getPendingAttendanceScans, syncPendingAttendanceScans, type LocalAttendanceRecord } from "@/lib/local-attendance";
import { departments, workforceRoles } from "@/lib/organization-options";
import { hasSupabaseBrowserConfig } from "@/lib/supabase-browser";
import { cn, formatReadableDateTime, isSameLocalDate } from "@/lib/utils";
import type { AttendanceRecord, AttendanceType, Employee } from "@/lib/types";

type AdminTab = "overview" | "staff" | "qr" | "reports" | "settings";
type EmployeeRow = Employee & { branches?: { name: string } | null };

const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "staff", label: "Staff Management", icon: Users },
  { id: "qr", label: "QR Generator", icon: QrCode },
  { id: "reports", label: "Reports", icon: FileSpreadsheet },
  { id: "settings", label: "Settings", icon: Settings }
];

export function AdminWorkspace() {
  const hasBackend = hasSupabaseBrowserConfig();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [localRecords, setLocalRecords] = useState<LocalAttendanceRecord[]>([]);
  const [pendingLocalCount, setPendingLocalCount] = useState(0);
  const [status, setStatus] = useState("Ready.");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [department, setDepartment] = useState("");
  const [qrEmployeeId, setQrEmployeeId] = useState("");

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadLocalRecords();
    window.addEventListener("dtr-local-attendance-change", loadLocalRecords);
    window.addEventListener("storage", loadLocalRecords);
    return () => {
      window.removeEventListener("dtr-local-attendance-change", loadLocalRecords);
      window.removeEventListener("storage", loadLocalRecords);
    };
  }, []);

  useEffect(() => {
    function retryLocalBackups() {
      if (!getPendingAttendanceScans().length) return;
      syncPendingAttendanceScans().then((result) => {
        if (result.synced || result.remaining !== pendingLocalCount) {
          loadLocalRecords();
          loadRecords();
          setStatus(`${result.synced} local scan${result.synced === 1 ? "" : "s"} backed up. ${result.remaining} still local.`);
        }
      });
    }

    retryLocalBackups();
    const timer = window.setInterval(retryLocalBackups, 30000);
    window.addEventListener("online", retryLocalBackups);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retryLocalBackups);
    };
  }, [pendingLocalCount]);

  useEffect(() => {
    loadRecords();
    const timer = window.setInterval(loadRecords, 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function loadEmployees() {
    const response = await fetch("/api/employees");
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Could not load employees.");
      return;
    }
    const activeRows = payload.filter((employee: EmployeeRow) => employee.status === "active");
    setEmployees(activeRows);
    if (!qrEmployeeId && activeRows[0]?.employee_id) {
      setQrEmployeeId(activeRows[0].employee_id);
    }
  }

  async function loadRecords() {
    const response = await fetch("/api/attendance-records?limit=500");
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Could not load attendance records.");
      return;
    }
    setRecords((payload || []) as AttendanceRecord[]);
  }

  function loadLocalRecords() {
    setLocalRecords(getLocalAttendanceRecords());
    setPendingLocalCount(getPendingAttendanceScans().length);
  }

  async function backupLocalRecords() {
    setStatus("Backing up local scans online...");
    const result = await syncPendingAttendanceScans();
    loadLocalRecords();
    await loadRecords();
    setStatus(`${result.synced} local scan${result.synced === 1 ? "" : "s"} backed up. ${result.remaining} still local.`);
  }

  async function saveEmployee(formData: FormData) {
    setStatus("Saving staff...");
    const response = await fetch("/api/employees", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Staff save failed.");
      return;
    }
    setStatus(payload.sheetsWarning ? `${payload.full_name} saved. Google Sheets warning: ${payload.sheetsWarning}` : `${payload.full_name} saved.`);
    await loadEmployees();
    setQrEmployeeId(payload.employee_id);
  }

  async function removeEmployee(employeeId: string, fullName: string) {
    const confirmed = window.confirm(`Remove ${fullName} from active staff? Their attendance history will stay in reports.`);
    if (!confirmed) return;

    setStatus(`Removing ${fullName}...`);
    const response = await fetch(`/api/employees?employee_id=${encodeURIComponent(employeeId)}`, {
      method: "DELETE"
    });
    const payload = await response.json();
    if (!response.ok) {
      setStatus(payload.error || "Staff remove failed.");
      return;
    }
    setStatus(`${fullName} removed from active staff.`);
    await loadEmployees();
    if (qrEmployeeId === employeeId) {
      setQrEmployeeId("");
    }
  }

  const todayRows = records.filter((record) => isSameLocalDate(record.timestamp));
  const activeEmployees = employees;
  const selectedQrEmployee = employees.find((employee) => employee.employee_id === qrEmployeeId);
  const qrPayload = selectedQrEmployee
    ? JSON.stringify({ employeeId: selectedQrEmployee.employee_id, name: selectedQrEmployee.full_name })
    : qrEmployeeId;
  const qrUrl = qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&format=png&data=${encodeURIComponent(qrPayload)}`
    : "";
  const filteredRecords = records.filter((record) => {
    const employee = employees.find((row) => row.employee_id === record.employee_id);
    const searchable = `${record.employee_name} ${record.employee_id} ${record.branch} ${record.address} ${employee?.department || ""}`.toLowerCase();
    return (!query || searchable.includes(query.toLowerCase())) &&
      (!type || record.attendance_type === type) &&
      (!department || employee?.department === department);
  });
  const localOnlyRecords = localRecords.filter((localRecord) => (
    localRecord.local_sync_status === "local-pending" &&
    !records.some((record) => record.id === localRecord.id || record.verification_id === localRecord.verification_id)
  ));
  const combinedRecords = [...filteredRecords, ...localOnlyRecords.filter((record) => {
    const employee = employees.find((row) => row.employee_id === record.employee_id);
    const searchable = `${record.employee_name} ${record.employee_id} ${record.branch} ${record.address} ${employee?.department || ""}`.toLowerCase();
    return (!query || searchable.includes(query.toLowerCase())) &&
      (!type || record.attendance_type === type) &&
      (!department || employee?.department === department);
  })];

  function exportCsv() {
    const headers = ["Timestamp", "Date", "Time", "Employee ID", "Name", "Email", "Type", "Branch", "Location", "Latitude", "Longitude", "Verification ID", "Original Photo", "Verification Photo"];
    const csv = [headers, ...combinedRecords.map((record) => [formatReadableDateTime(record.timestamp), record.date, record.time, record.employee_id, record.employee_name, record.email, record.attendance_type, record.branch, record.address, record.latitude, record.longitude, record.verification_id, record.original_photo_url, record.verification_photo_url])]
      .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `dtr-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <main className="min-h-screen bg-[#f6f8ef] p-4 lg:p-8">
      <div className="mx-auto grid max-w-[1500px] gap-5">
        <header className="rounded-ui border border-slate-200 bg-white p-4 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image src="/logo.png" alt="Organization logo" width={56} height={56} className="rounded-ui border object-contain" />
              <div>
                <p className="text-xs font-black uppercase text-brand-hill">Daily Time Record</p>
                <h1 className="text-2xl font-black text-brand-dark">Admin Dashboard</h1>
              </div>
            </div>
            <Link href="/scanner" className="rounded-ui bg-brand-hill px-4 py-2 text-sm font-black text-white">
              Open Scanner
            </Link>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-ui border px-4 text-sm font-black transition",
                    activeTab === tab.id ? "border-brand-hill bg-brand-hill text-white" : "border-slate-200 bg-white text-slate-700"
                  )}
                >
                  <Icon size={17} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        {!hasBackend ? (
          <Card>
            <CardHeader><CardTitle>Supabase setup required</CardTitle></CardHeader>
            <p className="text-slate-600">Add the Supabase environment variables in Vercel to load admin data.</p>
          </Card>
        ) : null}

        {activeTab === "overview" ? (
          <section className="grid gap-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric title="Active Staff" value={activeEmployees.length} icon={Users} />
              <Metric title="Records Today" value={todayRows.length} icon={Activity} />
              <Metric title="Time In Today" value={todayRows.filter((record) => record.attendance_type === "TIME IN").length} icon={QrCode} />
              <Metric title="Evidence Photos" value={records.filter((record) => record.verification_photo_url).length} icon={Camera} />
            </div>
            <LatestRecords records={records.slice(0, 8)} />
          </section>
        ) : null}

        {activeTab === "staff" ? (
          <section className="grid gap-5 xl:grid-cols-[440px_1fr]">
            <Card>
              <CardHeader><CardTitle>Add / Update Staff</CardTitle><Users className="text-brand-hill" /></CardHeader>
              <form action={saveEmployee} className="grid gap-3">
                <Label>Employee ID<Input name="employee_id" required placeholder="GOK-0331" /></Label>
                <Label>Full Name<Input name="full_name" required placeholder="John Doe" /></Label>
                <Label>Email<Input name="email" type="email" placeholder="john@example.com" /></Label>
                <Label>Phone<Input name="phone" placeholder="+63..." /></Label>
                <Label>Role<Select name="position">{workforceRoles.map((role) => <option key={role} value={role}>{role}</option>)}</Select></Label>
                <Label>Department<Select name="department">{departments.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Label>
                <input type="hidden" name="role" value="employee" />
                <Label>Status<Select name="status"><option value="active">Active</option><option value="inactive">Inactive</option></Select></Label>
                <Label>Profile Photo<Input name="photo" type="file" accept="image/*" /></Label>
                <Button type="submit">Save Staff</Button>
              </form>
              <p className="mt-3 text-sm font-bold text-slate-500">{status}</p>
            </Card>
            <StaffGrid
              employees={employees}
              onGenerate={(id) => { setQrEmployeeId(id); setActiveTab("qr"); }}
              onRemove={removeEmployee}
            />
          </section>
        ) : null}

        {activeTab === "qr" ? (
          <section className="grid gap-5 lg:grid-cols-[420px_1fr]">
            <Card>
              <CardHeader><CardTitle>Generate Staff QR</CardTitle><QrCode className="text-brand-hill" /></CardHeader>
              <div className="grid gap-3">
                <Label>
                  Staff
                  <Select value={qrEmployeeId} onChange={(event) => setQrEmployeeId(event.target.value)}>
                    <option value="">Select staff</option>
                    {employees.map((employee) => (
                      <option key={employee.employee_id} value={employee.employee_id}>{employee.full_name} - {employee.employee_id}</option>
                    ))}
                  </Select>
                </Label>
                <Label>Manual ID<Input value={qrEmployeeId} onChange={(event) => setQrEmployeeId(event.target.value)} placeholder="GOK-0331" /></Label>
                <p className="text-sm text-slate-500">This QR contains the staff ID used by the scanner.</p>
              </div>
            </Card>
            <Card className="grid justify-items-center gap-4 text-center">
              {qrUrl ? (
                <>
                  <img src={qrUrl} alt="Generated staff QR code" className="h-72 w-72 rounded-ui border bg-white p-3" />
                  <div>
                    <strong className="block text-2xl text-brand-dark">{selectedQrEmployee?.full_name || "Staff QR"}</strong>
                    <span className="font-bold text-slate-500">{qrEmployeeId}</span>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => window.print()}>Print QR</Button>
                    <a className="rounded-ui border border-slate-200 px-4 py-2 text-sm font-black text-brand-dark" href={qrUrl} target="_blank">Open QR</a>
                  </div>
                </>
              ) : (
                <p className="text-slate-500">Select a staff member to generate a QR code.</p>
              )}
            </Card>
          </section>
        ) : null}

        {activeTab === "reports" ? (
          <section className="grid gap-5">
            <Card>
              <div className="grid gap-3 md:grid-cols-[1fr_220px_240px_auto]">
                <Label>Search<Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee, branch, location" /></Label>
                <Label>Type<Select value={type} onChange={(event) => setType(event.target.value)}><option value="">All</option><option value="TIME IN">TIME IN</option><option value="TIME OUT">TIME OUT</option></Select></Label>
                <Label>Department<Select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="">All departments</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Label>
                <Button type="button" onClick={exportCsv}><Download size={16} /> Export CSV</Button>
              </div>
            </Card>
            <Card>
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
                <div>
                  <strong className="block text-brand-dark">Local backup on this device</strong>
                  <span className="text-sm text-slate-500">{localRecords.length} local records, {pendingLocalCount} waiting for online backup.</span>
                </div>
                <Button type="button" variant="outline" onClick={backupLocalRecords}>Backup Now</Button>
                <Button type="button" onClick={() => exportLocalAttendanceExcel(combinedRecords)}><Download size={16} /> Download Excel</Button>
                <Button type="button" onClick={() => exportStaffAttendanceExcel(combinedRecords)}><Download size={16} /> Staff Excel</Button>
              </div>
            </Card>
            <ReportsTable records={combinedRecords} />
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>External Links</CardTitle><Settings className="text-brand-hill" /></CardHeader>
              <div className="grid gap-2">
                <a className="rounded-ui border p-3 font-bold text-brand-hill" href="https://supabase.com/dashboard" target="_blank">Supabase Dashboard</a>
                <a className="rounded-ui border p-3 font-bold text-brand-hill" href="https://docs.google.com/spreadsheets/d/1HeiszUveI053AbDdOwnU620sIbLZICR76xYKwzUIn-4/edit" target="_blank">Google Sheet</a>
                <a className="rounded-ui border p-3 font-bold text-brand-hill" href="https://vercel.com/john-jacob-tamon-s-projects/dtr-attendance-system" target="_blank">Vercel Project</a>
                <a className="rounded-ui border p-3 font-bold text-brand-hill" href="https://github.com/Jhnxcb/dtr-attendance-system" target="_blank">GitHub Repository</a>
                <a className="rounded-ui border p-3 font-bold text-brand-hill" href="https://dtr-attendance-system.vercel.app" target="_blank">Live App</a>
              </div>
            </Card>
            <Card>
              <CardHeader><CardTitle>System Status</CardTitle><Activity className="text-brand-hill" /></CardHeader>
              <div className="grid gap-3 text-sm text-slate-600">
                <StatusLine label="Supabase browser config" value={hasBackend ? "Connected" : "Missing"} />
                <StatusLine label="Staff loaded" value={`${employees.length}`} />
                <StatusLine label="Attendance records loaded" value={`${records.length}`} />
                <StatusLine label="Google Sheets test" value="/api/google/test" />
              </div>
            </Card>
          </section>
        ) : null}
      </div>
    </main>
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

function StaffGrid({
  employees,
  onGenerate,
  onRemove
}: {
  employees: EmployeeRow[];
  onGenerate: (employeeId: string) => void;
  onRemove: (employeeId: string, fullName: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {employees.map((employee) => (
        <Card key={employee.employee_id} className="grid gap-3">
          {employee.profile_photo_url ? <img src={employee.profile_photo_url} alt="" className="h-44 w-full rounded-ui object-cover" /> : <div className="h-44 rounded-ui bg-brand-light-yellow" />}
          <div>
            <strong className="block text-lg text-brand-dark">{employee.full_name}</strong>
            <span className="text-sm font-bold text-slate-500">{employee.employee_id}</span>
          </div>
          <span className="text-sm text-slate-600">{employee.email}</span>
          <span className="text-sm font-bold text-slate-600">{employee.position || "Staff"} {employee.department ? `| ${employee.department}` : ""}</span>
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-brand-lime px-3 py-1 text-xs font-black uppercase">{employee.status}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onGenerate(employee.employee_id)}>QR</Button>
              <Button
                type="button"
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => onRemove(employee.employee_id, employee.full_name)}
              >
                <Trash2 size={16} />
                Remove
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function LatestRecords({ records }: { records: AttendanceRecord[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Latest Attendance</CardTitle><Camera className="text-brand-hill" /></CardHeader>
      <div className="grid gap-3">
        {records.map((record) => (
          <article key={record.id} className="grid gap-3 rounded-ui border border-slate-200 p-3 md:grid-cols-[72px_1fr_auto]">
            {record.profile_photo_url ? <img src={record.profile_photo_url} alt="" className="h-16 w-16 rounded-ui object-cover" /> : <div className="h-16 w-16 rounded-ui bg-brand-light-yellow" />}
            <div>
              <strong className="block text-brand-dark">{record.employee_name}</strong>
              <span className="text-sm font-bold text-slate-500">{record.employee_id}</span>
              <p className="text-sm text-slate-600">{record.branch} - {record.address}</p>
            </div>
            <div className="grid justify-items-start gap-2 md:justify-items-end">
              <span className="rounded-full bg-brand-lime px-3 py-1 text-xs font-black">{record.attendance_type}</span>
              <a className="text-sm font-bold text-brand-hill" href={record.verification_photo_url} target="_blank">Evidence</a>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ReportsTable({ records }: { records: AttendanceRecord[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{records.length} Records</CardTitle></CardHeader>
      <div className="overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-brand-light-yellow">
            <tr>{["Date", "Employee", "Type", "Branch", "Location", "Evidence"].map((header) => <th key={header} className="p-3">{header}</th>)}</tr>
          </thead>
          <tbody>
            {records.map((record) => (
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
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-ui border border-slate-200 p-3">
      <span>{label}</span>
      <strong className="text-brand-dark">{value}</strong>
    </div>
  );
}
