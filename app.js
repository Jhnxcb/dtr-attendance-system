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
const cameraSelect = document.getElementById("cameraSelect");
const recordsEl = document.getElementById("records");
const lastScan = document.getElementById("lastScan");
const scanCount = document.getElementById("scanCount");

let stream;
let scannerTimer;
let detector;
let scannerMode = "";
const scanCanvas = document.createElement("canvas");
const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
let lastCode = "";
let lastScanAt = 0;
let framesWithoutQr = 0;

const STORAGE_KEY = "dtr-records";
const UPLOAD_URL_KEY = "dtr-upload-url";
const CAMERA_ID_KEY = "dtr-camera-id";
const AUTO_START_KEY = "dtr-auto-start-camera";
const DUPLICATE_WINDOW_MS = 60_000;

uploadUrl.value = localStorage.getItem(UPLOAD_URL_KEY) || "";
cameraSelect.value = localStorage.getItem(CAMERA_ID_KEY) || "";
autoStartCamera.checked = localStorage.getItem(AUTO_START_KEY) !== "false";

function nowParts() {
  const date = new Date();
  return {
    date,
    iso: date.toISOString(),
    localDate: date.toLocaleDateString(),
    localTime: date.toLocaleTimeString(),
  };
}

function getRecords() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

function saveRecords(records) {
  const lightRecords = records.map(({ photoDataUrl, ...record }) => record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lightRecords));
}

function setStatus(message) {
  cameraStatus.textContent = message;
}

function updateClock() {
  clock.textContent = new Date().toLocaleTimeString();
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
      staffId: parsed.staffId || parsed.id || trimmed,
      staffName: parsed.name || parsed.staffName || "",
      rawCode: trimmed,
    };
  } catch {
    return {
      staffId: trimmed,
      staffName: "",
      rawCode: trimmed,
    };
  }
}

function decideInOrOut(staffId, records) {
  const lastRecord = records.find((record) => record.staffId === staffId);
  return lastRecord?.type === "IN" ? "OUT" : "IN";
}

function capturePhoto() {
  const width = video.videoWidth || 1280;
  const height = video.videoHeight || 720;
  snapshotCanvas.width = width;
  snapshotCanvas.height = height;

  const context = snapshotCanvas.getContext("2d");
  if (video.readyState >= 2) {
    context.drawImage(video, 0, 0, width, height);
  } else {
    context.fillStyle = "#16202a";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.font = "36px Arial";
    context.fillText("No camera photo available", 48, 90);
  }
  return snapshotCanvas.toDataURL("image/jpeg", 0.86);
}

async function uploadEvidence(record) {
  const url = uploadUrl.value.trim();
  localStorage.setItem(UPLOAD_URL_KEY, url);

  if (!url) {
    return { uploaded: false, message: "Saved locally only" };
  }

  await fetch(url, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(record),
  });

  return { uploaded: true, message: "Sent to Google Drive" };
}

async function recordScan(rawCode) {
  const currentTime = Date.now();

  if (rawCode === lastCode && currentTime - lastScanAt < DUPLICATE_WINDOW_MS) {
    setStatus("Duplicate scan ignored. Please wait before scanning again.");
    return;
  }

  lastCode = rawCode;
  lastScanAt = currentTime;

  const staff = parseStaffCode(rawCode);
  const records = getRecords();
  const time = nowParts();
  const photoDataUrl = capturePhoto();

  const record = {
    id: crypto.randomUUID(),
    staffId: staff.staffId,
    staffName: staff.staffName,
    rawCode: staff.rawCode,
    type: decideInOrOut(staff.staffId, records),
    date: time.localDate,
    time: time.localTime,
    iso: time.iso,
    photoDataUrl,
    uploadStatus: "Uploading...",
    driveFileUrl: "",
  };

  records.unshift(record);
  saveRecords(records);
  render();
  setStatus(`${record.staffId} recorded as ${record.type}. Uploading photo...`);

  try {
    const result = await uploadEvidence(record);
    record.uploadStatus = result.fileUrl ? "Uploaded to Google Drive" : result.message || "Saved locally only";
    record.driveFileUrl = result.fileUrl || "";
  } catch (error) {
    record.uploadStatus = "Upload failed";
    record.uploadError = error.message;
  }

  saveRecords(records);
  render();
  setStatus(`${record.staffId} ${record.type} saved. ${record.uploadStatus}. Ready for next QR.`);
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
      ? "Camera permission was blocked. Allow camera access in the browser, then press Start Camera again."
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
  setStatus(`${activeCameraName} is visible and scanning with ${readerName}. Hold the QR steady inside the square.`);
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
  const headers = ["Staff ID", "Name", "Type", "Date", "Time", "Upload Status", "Drive File"];
  const rows = records.map((record) => [
    record.staffId,
    record.staffName,
    record.type,
    record.date,
    record.time,
    record.uploadStatus,
    record.driveFileUrl,
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

function render() {
  const records = getRecords();
  scanCount.textContent = records.filter((record) => record.date === new Date().toLocaleDateString()).length;

  if (records[0]) {
    const record = records[0];
    lastScan.innerHTML = `
      <strong>${record.staffId} ${record.type}</strong>
      <p>${record.staffName || "No staff name in QR"}</p>
      <p>${record.date} ${record.time}</p>
      <p class="muted">${record.uploadStatus}</p>
    `;
  } else {
    lastScan.innerHTML = '<p class="muted">Waiting for first scan</p>';
  }

  recordsEl.innerHTML = records
    .slice(0, 20)
    .map((record) => {
      const failed = record.uploadStatus === "Upload failed";
      const link = record.driveFileUrl ? `<a href="${record.driveFileUrl}" target="_blank" rel="noreferrer">Open photo</a>` : "";
      return `
        <article class="record">
          <span class="badge ${failed ? "failed" : ""}">${record.type}</span>
          <strong>${record.staffId}</strong>
          <small>${record.date} ${record.time}</small>
          <small>${record.uploadStatus || "Saved locally"}</small>
          ${link}
        </article>
      `;
    })
    .join("");
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
manualButton.addEventListener("click", () => {
  const code = manualCode.value.trim();
  if (!code) {
    setStatus("Enter a staff ID for manual scan.");
    return;
  }
  recordScan(code);
  manualCode.value = "";
});

setInterval(updateClock, 1000);
updateClock();
loadCameraSources().catch(() => {});
render();

if (autoStartCamera.checked) {
  setStatus("Opening camera for automatic QR scanning...");
  startCamera().catch((error) => setStatus(error.message));
}
