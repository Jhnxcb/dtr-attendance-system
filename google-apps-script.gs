const SHEET_NAME = "DTR Logs";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);

  if (payload.action === "sendAttendanceEmail") {
    return sendAttendanceEmail_(payload);
  }

  const sheet = getOrCreateSheet_(SHEET_NAME);

  sheet.appendRow([
    payload.iso || payload.timestamp || "",
    payload.employeeName || payload.staffName || "",
    payload.employeeId || payload.staffId || "",
    payload.email || "",
    payload.attendanceType || payload.type || "",
    payload.locationAddress || "",
    payload.latitude || "",
    payload.longitude || "",
    payload.registeredPhotoUrl || "",
    payload.evidencePhotoUrl || "",
    payload.verificationPhotoUrl || "",
    payload.attendanceDate || payload.date || "",
    payload.attendanceTime || payload.time || "",
    payload.branchSite || "",
    payload.deviceUsed || "",
    payload.verificationId || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet_(name) {
  const files = DriveApp.getFilesByName(name);
  const spreadsheet = files.hasNext()
    ? SpreadsheetApp.open(files.next())
    : SpreadsheetApp.create(name);

  const sheet = spreadsheet.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Timestamp",
      "Employee Name",
      "Employee ID Code",
      "Email Address",
      "Attendance Type",
      "GPS Location",
      "Latitude",
      "Longitude",
      "Registered Photo URL",
      "Attendance Evidence Photo URL",
      "Verification Photo URL",
      "Attendance Date",
      "Attendance Time",
      "Branch / Site Location",
      "Device Information",
      "Verification ID",
    ]);
  }
  return sheet;
}

function sendAttendanceEmail_(payload) {
  const expectedToken = PropertiesService.getScriptProperties().getProperty("DTR_EMAIL_TOKEN") || "";

  if (expectedToken && payload.token !== expectedToken) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!payload.to || !payload.subject || !payload.html) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "Missing email fields" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  GmailApp.sendEmail(payload.to, payload.subject, payload.text || "", {
    htmlBody: payload.html,
    name: "DTR Attendance",
    attachments: buildEmailAttachments_(payload.attachments || [])
  });

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function buildEmailAttachments_(attachments) {
  return attachments.map(function (attachment) {
    return Utilities.newBlob(
      Utilities.base64Decode(attachment.content || ""),
      attachment.contentType || "application/octet-stream",
      attachment.filename || "attachment"
    );
  });
}

function testEmailSetup() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), "DTR Gmail setup test", "DTR Gmail sending is authorized.", {
    name: "DTR Attendance"
  });
}
