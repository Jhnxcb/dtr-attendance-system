# DTR Attendance System

Cloud-ready Daily Time Record system with QR/ID scanning, camera evidence, GPS validation, Supabase storage/database, Google Sheets sync, and an admin dashboard.

## Pages

- Scanner: `http://localhost:8080`
- QR Generator: `http://localhost:8080/qr-generator.html`
- Dashboard: `http://localhost:8080/dashboard.html`

## Attendance Rules

Attendance is rejected unless all required evidence is available:

- camera is running
- GPS location is granted
- employee ID exists and is active in Supabase
- original evidence photo is captured
- verification photo with overlay is generated
- original and verification images upload to Supabase Storage

The verification image overlay includes employee name, employee ID, TIME IN/TIME OUT, full date, exact time, address, latitude, longitude, branch/site, device used, and verification ID.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql` in the Supabase SQL editor.
3. Create a public storage bucket named `attendance-evidence`, or use your own bucket name and enter it in the scanner.
4. Add employees to the `employees` table.
5. Enter these settings on the scanner page:
   - Supabase URL
   - Supabase anon key
   - Storage bucket
   - Branch / Site Location
   - Email Edge Function URL, optional but recommended

For production, tighten RLS policies by role and move attendance writes, email notifications, and Google Sheets sync into Supabase Edge Functions. The browser starter uses the anon key and RLS policies.

## Email Notifications

Use `supabase-edge-function-send-attendance-email.ts` as the starter Supabase Edge Function for Resend email notifications.

Set these Edge Function secrets:

```text
RESEND_API_KEY
FROM_EMAIL
```

Deploy the function, then paste its URL into `Email Edge Function URL` on the scanner page.

## Employee QR Format

QR codes can contain only an employee ID:

```text
EMP-00123
```

Or JSON:

```json
{"employeeId":"EMP-00123","name":"John Doe","email":"john@example.com"}
```

The employee must exist in Supabase or the attendance will be rejected.

## Google Sheets Setup

1. Create a Google Apps Script project.
2. Paste `google-apps-script.gs`.
3. Deploy as a Web App.
4. Paste the Web App URL into the scanner page.

Google Sheets columns include timestamp, employee name, employee ID, email, attendance type, GPS location, latitude, longitude, registered photo URL, evidence photo URL, verification photo URL, date, time, branch/site, device information, and verification ID.

## Browser Support

Use a modern browser such as Chrome, Edge, Firefox, or Safari. Camera and GPS permissions are required. The scanner loads a cross-browser QR reader for common browsers; internet is needed when that library first loads.

## Local Run

```powershell
node server.js
```

Then open:

```text
http://localhost:8080
```
