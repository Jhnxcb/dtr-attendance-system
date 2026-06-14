const video = document.getElementById("video");
const snapshotCanvas = document.getElementById("snapshotCanvas");
const cameraStatus = document.getElementById("cameraStatus");
const clock = document.getElementById("clock");
const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const exportButton = document.getElementById("exportButton");
const manualButton = document.getElementById("manualButton");
const refreshCamerasButton = document.getElementById("refreshCamerasButton");
const autoStartCamera = document.getElementById("autoStartCamera");
const manualCode = document.getElementById("manualCode");
const uploadUrl = document.getElementById("uploadUrl");
const supabaseUrl = document.getElementById("supabaseUrl");
const supabaseKey = document.getElementById("supabaseKey");
const supabaseBucket = document.getElementById("supabaseBucket");
const branchSite = document.getElementById("branchSite");
const emailFunctionUrl = document.getElementById("emailFunctionUrl");
const cameraSelect = document.getElementById("cameraSelect");
const recordsEl = document.getElementById("records");
const lastScan = document.getElementById("lastScan");
const scanCount = document.getElementById("scanCount");
const photoDialog = document.getElementById("photoDialog");
const photoDialogImage = document.getElementById("photoDialogImage");
const closePhotoDialog = document.getElementById("closePhotoDialog");

let stream;
let scannerTimer;
let detector;
let scannerMode = "";
const scanCanvas = document.createElement("canvas");
const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
const verificationCanvas = document.createElement("canvas");
let lastCode = "";
let lastScanAt = 0;
let framesWithoutQr = 0;

const STORAGE_KEY = "dtr-records";
const UPLOAD_URL_KEY = "dtr-upload-url";
const SUPABASE_URL_KEY = "dtr-supabase-url";
const SUPABASE_KEY_KEY = "dtr-supabase-key";
const SUPABASE_BUCKET_KEY = "dtr-supabase-bucket";
const BRANCH_SITE_KEY = "dtr-branch-site";
const EMAIL_FUNCTION_URL_KEY = "dtr-email-function-url";
const CAMERA_ID_KEY = "dtr-camera-id";
const AUTO_START_KEY = "dtr-auto-start-camera";
const DUPLICATE_WINDOW_MS = 60_000;

uploadUrl.value = localStorage.getItem(UPLOAD_URL_KEY) || "";
supabaseUrl.value = localStorage.getItem(SUPABASE_URL_KEY) || "";
supabaseKey.value = localStorage.getItem(SUPABASE_KEY_KEY) || "";
supabaseBucket.value = localStorage.getItem(SUPABASE_BUCKET_KEY) || "attendance-evidence";
branchSite.value = localStorage.getItem(BRANCH_SITE_KEY) || "";
emailFunctionUrl.value = localStorage.getItem(EMAIL_FUNCTION_URL_KEY) || "";
cameraSelect.value = localStorage.getItem(CAMERA_ID_KEY) || "";
autoStartCamera.checked = localStorage.getItem(AUTO_START_KEY) !== "false";

function nowParts() {
  const date = new Date();
  return {
    date,
    iso: date.toISOString(),
    localDate: date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    localTime: date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    compactDate: date.toISOString().slice(0, 10).replaceAll("-", ""),
  };
}

function getRecords() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveRecords(records) {
  const lightRecords = records.map(({ originalPhotoDataUrl, verificationPhotoDataUrl, ...record }) => record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lightRecords));
}

function setStatus(message) {
  cameraStatus.textContent = message;
}

function updateClock() {
  clock.textContent = new Date().toLocaleTimeString();
}

function saveSettings() {
  localStorage.setItem(UPLOAD_URL_KEY, uploadUrl.value.trim());
  localStorage.setItem(SUPABASE_URL_KEY, supabaseUrl.value.trim());
  localStorage.setItem(SUPABASE_KEY_KEY, supabaseKey.value.trim());
  localStorage.setItem(SUPABASE_BUCKET_KEY, supabaseBucket.value.trim() || "attendance-evidence");
  localStorage.setItem(BRANCH_SITE_KEY, branchSite.value.trim());
  localStorage.setItem(EMAIL_FUNCTION_URL_KEY, emailFunctionUrl.value.trim());
}

async function loadCameraSources() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    setStatus("Camera list is not available in this browser.");
    return;
  }

  const selectedId = localStorage.getItem(CAMERA_ID_KEY) || cameraSelect.value;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");

  cameraSelect.innerHTML = '<option value="">Default camera</option>';
  cameras.forEach((camera, index) => {
    const option = document.createElement("option");
    option.value = camera.deviceId;
    option.textContent = camera.label || `Camera ${index + 1}`;
    cameraSelect.appendChild(option);
  });

  if (selectedId && cameras.some((camera) => camera.deviceId === selectedId)) {
    cameraSelect.value = selectedId;
  }
}

function parseStaffCode(rawCode) {
  const trimmed = rawCode.trim();

  try {
    const parsed = JSON.parse(trimmed);
    return {
      employeeId: parsed.employeeId || parsed.staffId || parsed.id || trimmed,
      employeeName: parsed.name || parsed.employeeName || parsed.staffName || "",
      email: parsed.email || "",
      registeredPhotoUrl: parsed.photoUrl || parsed.registeredPhotoUrl || "",
      rawCode: trimmed,
    };
  } catch {
    return {
      employeeId: trimmed,
      employeeName: "",
      email: "",
      registeredPhotoUrl: "",
      rawCode: trimmed,
    };
  }
}

function decideInOrOut(employeeId, records) {
  const lastRecord = records.find((record) => record.employeeId === employeeId);
  return lastRecord?.attendanceType === "TIME IN" ? "TIME OUT" : "TIME IN";
}

function generateVerificationId(time, count) {
  return `ATT-${time.compactDate}-${String(count + 1).padStart(4, "0")}`;
}

function getDeviceInfo() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Unknown platform";
  return `${platform} | ${navigator.userAgent}`;
}

function captureOriginalPhoto() {
  if (!stream || video.readyState < 2) {
    throw new Error("Camera evidence photo is required before attendance can be accepted.");
  }

  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  snapshotCanvas.width = width;
  snapshotCanvas.height = height;

  const context = snapshotCanvas.getContext("2d");
  context.drawImage(video, 0, 0, width, height);
  return snapshotCanvas.toDataURL("image/jpeg", 0.9);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(" ");
  let line = "";
  let currentY = y;

  words.forEach((word) => {
    const testLine = `${line}${word} `;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line.trim(), x, currentY);
      line = `${word} `;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  });

  if (line) {
    context.fillText(line.trim(), x, currentY);
  }

  return currentY + lineHeight;
}

function createVerificationPhoto(originalPhotoDataUrl, record) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      verificationCanvas.width = width;
      verificationCanvas.height = height;

      const context = verificationCanvas.getContext("2d");
      context.drawImage(image, 0, 0, width, height);

      const padding = Math.max(24, Math.round(width * 0.025));
      const boxWidth = Math.min(width - padding * 2, Math.round(width * 0.72));
      const lineHeight = Math.max(26, Math.round(width * 0.025));
      const overlayLines = [
        record.employeeName || "Unknown Employee",
        `Employee ID: ${record.employeeId}`,
        record.attendanceType,
        `${record.attendanceDate} | ${record.attendanceTime}`,
        record.locationAddress,
        `Lat: ${record.latitude}`,
        `Lng: ${record.longitude}`,
        `Branch: ${record.branchSite}`,
        `Device: ${record.deviceUsed}`,
        `Verification ID: ${record.verificationId}`,
      ];

      context.font = `700 ${Math.max(22, Math.round(width * 0.022))}px Arial`;
      const overlayHeight = padding * 2 + overlayLines.length * lineHeight + lineHeight;
      const boxX = padding;
      const boxY = height - overlayHeight - padding;

      context.fillStyle = "rgba(17, 17, 17, 0.78)";
      context.fillRect(boxX, boxY, boxWidth, overlayHeight);
      context.strokeStyle = "#FCEFA2";
      context.lineWidth = Math.max(3, Math.round(width * 0.004));
      context.strokeRect(boxX, boxY, boxWidth, overlayHeight);

      let y = boxY + padding + lineHeight;
      overlayLines.forEach((line, index) => {
        context.fillStyle = index === 2 ? "#FFBF60" : "#FFFFFF";
        context.font = `${index === 2 ? "800" : "700"} ${Math.max(20, Math.round(width * 0.019))}px Arial`;
        y = wrapText(context, line, boxX + padding, y, boxWidth - padding * 2, lineHeight);
      });

      resolve(verificationCanvas.toDataURL("image/jpeg", 0.9));
    };
    image.onerror = () => reject(new Error("Could not generate verification photo."));
    image.src = originalPhotoDataUrl;
  });
}

function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*);base64/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function getSupabaseConfig() {
  saveSettings();
  const url = supabaseUrl.value.trim().replace(/\/$/, "");
  const key = supabaseKey.value.trim();
  const bucket = supabaseBucket.value.trim() || "attendance-evidence";

  if (!url || !key || !bucket) {
    throw new Error("Supabase URL, anon key, and storage bucket are required before attendance can be accepted.");
  }

  return { url, key, bucket };
}

async function supabaseFetch(path, options = {}) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function findEmployee(staff) {
  const employeeId = encodeURIComponent(staff.employeeId);
  const rows = await supabaseFetch(`/rest/v1/employees?employee_id=eq.${employeeId}&active=eq.true&select=*`);
  const employee = rows[0];
  if (!employee) {
    throw new Error(`Employee ID ${staff.employeeId} is not registered or inactive.`);
  }

  return {
    employeeId: employee.employee_id || staff.employeeId,
    employeeName: employee.full_name || staff.employeeName,
    email: employee.email || staff.email,
    registeredPhotoUrl: employee.registered_photo_url || staff.registeredPhotoUrl,
    branchSite: employee.branch_site || branchSite.value.trim(),
  };
}

function getGpsPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS location is required but this browser has no geolocation support."));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

async function getLocationEvidence() {
  let position;
  try {
    position = await getGpsPosition();
  } catch {
    throw new Error("GPS permission/location is required before attendance can be accepted.");
  }

  const latitude = Number(position.coords.latitude).toFixed(6);
  const longitude = Number(position.coords.longitude).toFixed(6);
  let locationAddress = "Address unavailable";

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`);
    const data = await response.json();
    locationAddress = data.display_name || locationAddress;
  } catch {
    locationAddress = `${latitude}, ${longitude}`;
  }

  return { latitude, longitude, locationAddress };
}

async function uploadSupabaseImage(dataUrl, path) {
  const config = getSupabaseConfig();
  const blob = dataUrlToBlob(dataUrl);
  const response = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${path}`, {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "false",
    },
    body: blob,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Evidence photo upload failed.");
  }

  return `${config.url}/storage/v1/object/public/${config.bucket}/${path}`;
}

async function saveAttendanceRecord(record) {
  const payload = {
    verification_id: record.verificationId,
    employee_id: record.employeeId,
    employee_name: record.employeeName,
    email: record.email,
    attendance_type: record.attendanceType,
    attendance_date: record.attendanceDate,
    attendance_time: record.attendanceTime,
    timestamp: record.iso,
    latitude: record.latitude,
    longitude: record.longitude,
    location_address: record.locationAddress,
    branch_site: record.branchSite,
    device_used: record.deviceUsed,
    registered_photo_url: record.registeredPhotoUrl,
    evidence_photo_url: record.evidencePhotoUrl,
    verification_photo_url: record.verificationPhotoUrl,
    raw_code: record.rawCode,
  };

  await supabaseFetch("/rest/v1/attendance_records", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
}

async function syncGoogleSheets(record) {
  const url = uploadUrl.value.trim();
  localStorage.setItem(UPLOAD_URL_KEY, url);

  if (!url) {
    return "Google Sheets sync skipped";
  }

  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(record),
  });

  return "Synced to Google Sheets";
}

async function sendEmailNotification(record) {
  const url = emailFunctionUrl.value.trim();
  localStorage.setItem(EMAIL_FUNCTION_URL_KEY, url);

  if (!url || !record.email) {
    return "Email notification skipped";
  }

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });

  return "Email notification sent";
}

async function recordScan(rawCode) {
  const currentTime = Date.now();

  if (!stream || video.readyState < 2) {
    setStatus("Attendance rejected: camera evidence is required.");
    return;
  }

  if (rawCode === lastCode && currentTime - lastScanAt < DUPLICATE_WINDOW_MS) {
    setStatus("Duplicate scan ignored. Please wait before scanning again.");
    return;
  }

  lastCode = rawCode;
  lastScanAt = currentTime;

  try {
    getSupabaseConfig();
    setStatus("Validating employee, GPS, and evidence photo...");

    const staff = parseStaffCode(rawCode);
    const records = getRecords();
    const employee = await findEmployee(staff);
    const time = nowParts();
    const attendanceType = decideInOrOut(employee.employeeId, records);
    const verificationId = generateVerificationId(time, records.length);
    const location = await getLocationEvidence();
    const originalPhotoDataUrl = captureOriginalPhoto();

    const record = {
      id: crypto.randomUUID(),
      verificationId,
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      email: employee.email,
      registeredPhotoUrl: employee.registeredPhotoUrl,
      rawCode: staff.rawCode,
      attendanceType,
      date: time.localDate,
      time: time.localTime,
      attendanceDate: time.localDate,
      attendanceTime: time.localTime,
      iso: time.iso,
      latitude: location.latitude,
      longitude: location.longitude,
      locationAddress: location.locationAddress,
      branchSite: employee.branchSite || branchSite.value.trim() || "Unassigned branch",
      deviceUsed: getDeviceInfo(),
      originalPhotoDataUrl,
      evidencePhotoUrl: "",
      verificationPhotoUrl: "",
      uploadStatus: "Preparing verification photo...",
    };

    record.verificationPhotoDataUrl = await createVerificationPhoto(originalPhotoDataUrl, record);
    const folder = `${record.employeeId}/${time.compactDate}`;
    record.evidencePhotoUrl = await uploadSupabaseImage(originalPhotoDataUrl, `${folder}/${verificationId}-original.jpg`);
    record.verificationPhotoUrl = await uploadSupabaseImage(record.verificationPhotoDataUrl, `${folder}/${verificationId}-verified.jpg`);
    record.uploadStatus = "Saving attendance record...";

    await saveAttendanceRecord(record);
    const sheetStatus = await syncGoogleSheets(record);
    const emailStatus = await sendEmailNotification(record);
    record.uploadStatus = `${sheetStatus}; ${emailStatus}`;

    records.unshift(record);
    saveRecords(records);
    render();
    setStatus(`${record.employeeId} ${record.attendanceType} accepted. Verification ID: ${record.verificationId}.`);
  } catch (error) {
    setStatus(`Attendance rejected: ${error.message}`);
  }
}

async function scanFrame() {
  if (!stream || video.readyState < 2) {
    return;
  }

  try {
    const rawValue = scannerMode === "native"
      ? await scanWithNativeDetector()
      : scanWithJsQr();

    if (rawValue) {
      framesWithoutQr = 0;
      await recordScan(rawValue);
      return;
    }

    framesWithoutQr += 1;
    if (framesWithoutQr % 8 === 0) {
      setStatus("Scanning... no QR found yet. Hold the QR steady inside the square.");
    }
  } catch (error) {
    setStatus(`QR scan failed: ${error.message || "browser cannot read this camera frame"}. Try another camera or enter staff ID manually.`);
    stopCamera();
  }
}

async function scanWithNativeDetector() {
  const codes = await detector.detect(video);
  const qr = codes.find((code) => code.rawValue);
  return qr?.rawValue || "";
}

function scanWithJsQr() {
  if (!window.jsQR) {
    return "";
  }

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  scanCanvas.width = width;
  scanCanvas.height = height;
  scanContext.drawImage(video, 0, 0, width, height);

  const imageData = scanContext.getImageData(0, 0, width, height);
  const result = window.jsQR(imageData.data, width, height, {
    inversionAttempts: "attemptBoth",
  });

  return result?.data || "";
}

async function browserCanScanQr() {
  if (window.loadQrFallback) {
    await window.loadQrFallback;
  }

  if (window.jsQR) {
    return true;
  }

  if (!("BarcodeDetector" in window)) {
    return false;
  }

  if (!BarcodeDetector.getSupportedFormats) {
    return true;
  }

  const formats = await BarcodeDetector.getSupportedFormats();
  return formats.includes("qr_code");
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Camera is not available. Use a modern browser and open through HTTPS or localhost.");
    return;
  }

  stopCamera(false);
  const selectedCameraId = cameraSelect.value;

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        ...(selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: { ideal: "environment" } }),
      },
      audio: false,
    });
  } catch (error) {
    const message = error.name === "NotAllowedError"
      ? "Camera permission was blocked. Attendance cannot be accepted without camera evidence."
      : "No webcam was found or it is being used by another app.";
    setStatus(message);
    return;
  }

  video.srcObject = stream;
  await video.play();
  await loadCameraSources();

  const activeTrack = stream.getVideoTracks()[0];
  const activeCameraName = activeTrack?.label || "selected camera";
  const activeCameraId = activeTrack?.getSettings?.().deviceId || cameraSelect.value || "";
  if (activeCameraId) {
    cameraSelect.value = activeCameraId;
    localStorage.setItem(CAMERA_ID_KEY, activeCameraId);
  }

  const canScanQr = await browserCanScanQr();
  if (!canScanQr) {
    setStatus(`${activeCameraName} is visible, but the cross-browser QR reader did not load. Check internet or enter staff ID manually.`);
    return;
  }

  if (window.jsQR) {
    scannerMode = "jsqr";
    detector = undefined;
  } else {
    scannerMode = "native";
    detector = new BarcodeDetector({ formats: ["qr_code"] });
  }

  framesWithoutQr = 0;
  const readerName = scannerMode === "jsqr" ? "cross-browser QR reader" : "browser QR reader";
  setStatus(`${activeCameraName} is visible and scanning with ${readerName}. Attendance requires camera, GPS, and Supabase evidence upload.`);
  scannerTimer = setInterval(scanFrame, scannerMode === "jsqr" ? 700 : 450);
}

function stopCamera(showMessage = true) {
  clearInterval(scannerTimer);
  scannerTimer = undefined;

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  stream = undefined;
  video.srcObject = null;
  if (showMessage) {
    setStatus("Camera stopped.");
  }
}

function exportCsv() {
  const records = getRecords();
  const headers = [
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
    "Device Information",
    "Date",
    "Time",
    "Verification ID",
  ];
  const rows = records.map((record) => [
    record.iso,
    record.employeeName,
    record.employeeId,
    record.email,
    record.attendanceType,
    record.locationAddress,
    record.latitude,
    record.longitude,
    record.registeredPhotoUrl,
    record.evidencePhotoUrl,
    record.verificationPhotoUrl,
    record.deviceUsed,
    record.attendanceDate,
    record.attendanceTime,
    record.verificationId,
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell || "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `dtr-records-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function previewPhoto(url) {
  if (!url) {
    return;
  }

  photoDialogImage.src = url;
  photoDialog.showModal();
}

function render() {
  const records = getRecords();
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  scanCount.textContent = records.filter((record) => record.attendanceDate === today || record.date === today).length;

  if (records[0]) {
    const record = records[0];
    lastScan.innerHTML = `
      <strong>${record.employeeId || record.staffId} ${record.attendanceType || record.type}</strong>
      <p>${record.employeeName || record.staffName || "No employee name"}</p>
      <p>${record.attendanceDate || record.date} ${record.attendanceTime || record.time}</p>
      <p class="muted">${record.locationAddress || "No location"}</p>
      <p class="muted">${record.verificationId || ""}</p>
    `;
  } else {
    lastScan.innerHTML = '<p class="muted">Waiting for first scan</p>';
  }

  recordsEl.innerHTML = records
    .slice(0, 25)
    .map((record, index) => {
      const type = record.attendanceType || record.type || "";
      const failed = record.uploadStatus === "Upload failed";
      const verified = record.verificationPhotoUrl ? `<button type="button" data-photo="${record.verificationPhotoUrl}">View Verified</button>` : "";
      const original = record.evidencePhotoUrl ? `<button type="button" data-photo="${record.evidencePhotoUrl}">View Original</button>` : "";
      const profile = record.registeredPhotoUrl ? `<a href="${record.registeredPhotoUrl}" target="_blank" rel="noreferrer">Profile</a>` : "";

      return `
        <article class="record" data-record="${index}">
          <span class="badge ${failed ? "failed" : ""}">${type}</span>
          <strong>${record.employeeId || record.staffId}</strong>
          <small>${record.employeeName || record.staffName || "No employee name"}</small>
          <small>${record.attendanceDate || record.date} ${record.attendanceTime || record.time}</small>
          <small>${record.locationAddress || ""}</small>
          <small>${record.verificationId || ""}</small>
          <small>${record.uploadStatus || "Saved"}</small>
          <div class="record-actions">${verified}${original}${profile}</div>
        </article>
      `;
    })
    .join("");

  recordsEl.querySelectorAll("[data-photo]").forEach((button) => {
    button.addEventListener("click", () => previewPhoto(button.dataset.photo));
  });
}

startButton.addEventListener("click", () => startCamera().catch((error) => setStatus(error.message)));
stopButton.addEventListener("click", stopCamera);
exportButton.addEventListener("click", exportCsv);
refreshCamerasButton.addEventListener("click", () => loadCameraSources().catch((error) => setStatus(error.message)));
autoStartCamera.addEventListener("change", () => {
  localStorage.setItem(AUTO_START_KEY, autoStartCamera.checked ? "true" : "false");
});
cameraSelect.addEventListener("change", () => {
  localStorage.setItem(CAMERA_ID_KEY, cameraSelect.value);
  if (stream) {
    startCamera().catch((error) => setStatus(error.message));
  }
});
[uploadUrl, supabaseUrl, supabaseKey, supabaseBucket, branchSite, emailFunctionUrl].forEach((input) => {
  input.addEventListener("change", saveSettings);
});
manualButton.addEventListener("click", () => {
  const code = manualCode.value.trim();
  if (!code) {
    setStatus("Enter an employee ID for manual scan.");
    return;
  }
  recordScan(code);
  manualCode.value = "";
});
closePhotoDialog.addEventListener("click", () => photoDialog.close());

setInterval(updateClock, 1000);
updateClock();
loadCameraSources().catch(() => {});
render();

if (autoStartCamera.checked) {
  setStatus("Opening camera for automatic QR scanning...");
  startCamera().catch((error) => setStatus(error.message));
}
