import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const fromEmail = Deno.env.get("FROM_EMAIL") || "DTR <noreply@example.com>";

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY is not configured" }), { status: 500 });
  }

  const record = await request.json();
  if (!record.email) {
    return new Response(JSON.stringify({ ok: true, skipped: true }));
  }

  const subject = `${record.attendanceType} confirmation - ${record.attendanceDate}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#333">
      <h2 style="color:#1C5112">Attendance Confirmation</h2>
      <p>Hello ${record.employeeName},</p>
      <p>Your attendance has been recorded successfully.</p>
      <table>
        <tr><td><strong>Type</strong></td><td>${record.attendanceType}</td></tr>
        <tr><td><strong>Date & Time</strong></td><td>${record.attendanceDate} ${record.attendanceTime}</td></tr>
        <tr><td><strong>Location</strong></td><td>${record.locationAddress}</td></tr>
        <tr><td><strong>Branch</strong></td><td>${record.branchSite}</td></tr>
        <tr><td><strong>Verification ID</strong></td><td>${record.verificationId}</td></tr>
      </table>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: record.email,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    return new Response(await response.text(), { status: response.status });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
