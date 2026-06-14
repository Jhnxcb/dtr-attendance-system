# DTR QR Scanner

This is a simple computer-based DTR starter app.

## What it does

- Uses the computer webcam to scan staff QR codes.
- Takes a photo after every valid scan.
- Records Time In / Time Out automatically.
- Saves recent records in the browser.
- Can upload the evidence photo to Google Drive using Google Apps Script.
- Can export records to CSV.

## QR code format

The QR code can contain just the staff ID:

```text
EMP-001
```

Or JSON with name:

```json
{"staffId":"EMP-001","name":"Juan Dela Cruz"}
```

## Generating staff QR codes

Open:

```text
http://localhost:8080/qr-generator.html
```

Type the staff ID and staff name, then print or download the QR code.

This generator uses an online QR image service, so the computer needs internet while generating QR codes. After the QR codes are printed, daily scanning can continue from the local scanner page.

## Camera notes

Open the scanner through:

```text
http://localhost:8080
```

Use Chrome or Microsoft Edge. When the browser asks for permission, choose Allow camera.

Use the `Camera source` dropdown to choose a different webcam. Press `Refresh Cameras` after plugging in a new USB camera.

If the camera still does not start:

- close Zoom, Teams, CCTV viewers, or other apps using the webcam
- check that Windows camera privacy allows browser access
- refresh the scanner page and press Start Camera again

## Google Drive upload setup

1. Go to Google Apps Script.
2. Create a new project.
3. Paste the code from `google-apps-script.gs`.
4. Deploy it as a Web App.
5. Set access to the Google account/users you want to allow.
6. Copy the Web App URL.
7. Paste that URL into the app field named `Google Apps Script upload URL`.

The script creates:

- a Google Drive folder named `DTR Evidence Photos`
- a Google Sheet named `DTR Logs`

The app sends each photo to Drive and keeps only the attendance details in the browser. The Google Sheet contains the photo link.

## Running locally

Camera access works best through `localhost`, not by opening the file directly.

If Python is installed:

```powershell
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

Use Chrome or Edge for QR scanning because the app uses the browser's built-in QR detector.
"# DTR" 
