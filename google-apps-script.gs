const DRIVE_FOLDER_NAME = "DTR Evidence Photos";
const SHEET_NAME = "DTR Logs";

function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  const sheet = getOrCreateSheet_(SHEET_NAME);

  const imageBytes = Utilities.base64Decode(payload.photoDataUrl.split(",")[1]);
  const safeStaffId = String(payload.staffId || "unknown").replace(/[^\w-]/g, "_");
  const fileName = `${safeStaffId}_${payload.type}_${payload.iso}.jpg`.replace(/[:.]/g, "-");
  const blob = Utilities.newBlob(imageBytes, "image/jpeg", fileName);
  const file = folder.createFile(blob);

  sheet.appendRow([
    payload.iso,
    payload.date,
    payload.time,
    payload.staffId,
    payload.staffName || "",
    payload.type,
    file.getUrl(),
    payload.rawCode || "",
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, fileUrl: file.getUrl() }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function getOrCreateSheet_(name) {
  const files = DriveApp.getFilesByName(name);
  const spreadsheet = files.hasNext()
    ? SpreadsheetApp.open(files.next())
    : SpreadsheetApp.create(name);

  const sheet = spreadsheet.getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["ISO Time", "Date", "Time", "Staff ID", "Name", "Type", "Photo URL", "Raw QR"]);
  }
  return sheet;
}
