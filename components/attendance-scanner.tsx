"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, MapPin, QrCode, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { queueLocalAttendanceScan, saveOnlineRecordLocally, syncPendingAttendanceScans } from "@/lib/local-attendance";
import { formatDeviceInfo } from "@/lib/utils";
import type { AttendanceType, Employee } from "@/lib/types";

type EmployeePreview = Pick<Employee, "employee_id" | "full_name" | "email" | "profile_photo_url" | "branch_name">;
const branchOptions = ["Camp Goducate", "Doane Baptist Church"];

export function AttendanceScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanRef = useRef<HTMLCanvasElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [manualId, setManualId] = useState("");
  const [branch, setBranch] = useState("");
  const [clock, setClock] = useState("");
  const [status, setStatus] = useState("Start camera to scan attendance.");
  const [employee, setEmployee] = useState<EmployeePreview | null>(null);
  const [lastResult, setLastResult] = useState<{ type: AttendanceType; verificationId: string; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  useEffect(() => {
    loadCameras();
  }, []);

  useEffect(() => {
    function updateClock() {
      setClock(new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(new Date()));
    }

    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!stream) return;
    const timer = window.setInterval(scanFrame, 700);
    return () => window.clearInterval(timer);
  }, [stream, busy]);

  useEffect(() => {
    function syncLocalBackups() {
      syncPendingAttendanceScans().then((result) => {
        if (result.synced) {
          setStatus(`${result.synced} local scan${result.synced === 1 ? "" : "s"} backed up online.`);
        }
      });
    }

    syncLocalBackups();
    window.addEventListener("online", syncLocalBackups);
    return () => window.removeEventListener("online", syncLocalBackups);
  }, []);

  function say(message: string) {
    setStatus(message);
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  function playScanSound(kind: "detected" | "success" | "error" = "success") {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const notes = {
        detected: [740],
        success: [880, 1175],
        error: [220, 165]
      }[kind];

      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const startAt = audio.currentTime + index * 0.12;
        const stopAt = startAt + 0.11;

        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.16, startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(startAt);
        oscillator.stop(stopAt);
      });
    } catch {
      // Sound feedback is optional.
    }
  }

  async function loadCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === "videoinput");
      setCameras(videoDevices);
      if (!cameraId && videoDevices[0]?.deviceId) {
        setCameraId(videoDevices[0].deviceId);
      }
    } catch {
      setStatus("Camera list is unavailable. Start camera or allow camera permission.");
    }
  }

  async function startCamera(nextCameraId = cameraId) {
    try {
      stream?.getTracks().forEach((track) => track.stop());
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: nextCameraId
          ? { deviceId: { exact: nextCameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = cameraStream;
        await videoRef.current.play();
      }
      setStream(cameraStream);
      await loadCameras();
      say("Camera ready. Scan QR or enter ID manually.");
    } catch {
      say("Camera permission is required before attendance can be accepted.");
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("Camera stopped.");
  }

  async function changeCamera(nextCameraId: string) {
    setCameraId(nextCameraId);
    if (stream) {
      await startCamera(nextCameraId);
    }
  }

  function scanFrame() {
    if (busy || !videoRef.current || videoRef.current.readyState < 2) return;
    const video = videoRef.current;
    const canvas = scanRef.current || document.createElement("canvas");
    scanRef.current = canvas;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(data.data, data.width, data.height, { inversionAttempts: "attemptBoth" });
    if (result?.data) {
      submitAttendance(result.data);
    }
  }

  function capturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) throw new Error("Camera evidence photo is required.");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Camera canvas is not available.");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  function getGps() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      });
    });
  }

  async function submitAttendance(code: string) {
    if (busy) return;
    setBusy(true);
    playScanSound("detected");
    try {
      if (!stream) throw new Error("Camera is required.");
      say("Taking photo for evidence.");
      const photoDataUrl = capturePhoto();
      say("Getting GPS location.");
      const position = await getGps();
      say("Saving attendance evidence.");
      const attendancePayload = {
        code,
        branch,
        device: formatDeviceInfo(),
        photoDataUrl,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };

      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attendancePayload)
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Attendance was rejected.");
      }
      setEmployee(payload.employee);
      const warnings = Array.isArray(payload.integrationWarnings) ? payload.integrationWarnings : [];
      setLastResult({ type: payload.attendanceType, verificationId: payload.verificationId, warnings });
      saveOnlineRecordLocally(payload.record);
      playScanSound("success");
      say(warnings.length ? `${payload.employee.full_name} saved, but Google Sheets needs attention.` : `${payload.employee.full_name} ${payload.attendanceType} recorded.`);
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) {
        try {
          const photoDataUrl = canvasRef.current?.toDataURL("image/jpeg", 0.75);
          if (photoDataUrl) {
            const position = await getGps();
            const localRecord = queueLocalAttendanceScan({
              code,
              branch,
              device: formatDeviceInfo(),
              photoDataUrl,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }, error instanceof Error ? error.message : "Waiting for online backup.");
            setLastResult({ type: localRecord.attendance_type, verificationId: localRecord.verification_id, warnings: ["Saved locally. It will backup online when internet returns."] });
            playScanSound("success");
            say("Saved locally. It will backup online when internet returns.");
            return;
          }
        } catch {
          // Fall through to normal error feedback.
        }
      }
      playScanSound("error");
      say(error instanceof Error ? error.message : "Attendance failed.");
    } finally {
      window.setTimeout(() => setBusy(false), 2200);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <div>
            <p className="text-xs font-black uppercase text-brand-hill">Attendance Scanner</p>
            <CardTitle>QR / ID Attendance</CardTitle>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-ui border border-slate-200 bg-white px-3 py-2 text-lg font-black text-brand-dark">{clock}</span>
            <ShieldCheck className="text-brand-hill" />
          </div>
        </CardHeader>
        <div className="relative overflow-hidden rounded-ui bg-brand-dark">
          <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          <div className="absolute inset-0 grid place-items-center">
            <div className="h-64 w-64 rounded-ui border-4 border-brand-orange shadow-[0_0_0_999px_rgba(0,0,0,0.22)]" />
          </div>
          <div className="absolute bottom-4 left-4 right-4 rounded-ui bg-white/95 p-3 text-sm font-bold">{status}</div>
        </div>
        <canvas ref={canvasRef} hidden />
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <Label>
            Branch / Site
            <Select value={branch} onChange={(event) => setBranch(event.target.value)}>
              <option value="">Default branch</option>
              {branchOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
          </Label>
          <Label>
            Camera
            <Select value={cameraId} onChange={(event) => changeCamera(event.target.value)} onFocus={loadCameras}>
              <option value="">Default camera</option>
              {cameras.map((camera, index) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))}
            </Select>
          </Label>
          <Label>
            Manual Employee ID
            <Input value={manualId} onChange={(event) => setManualId(event.target.value)} placeholder="EMP-001" />
          </Label>
          <Button type="button" onClick={() => manualId && submitAttendance(manualId)}>Submit ID</Button>
          <Button type="button" variant="outline" onClick={stream ? stopCamera : () => startCamera()}>
            {stream ? "Stop" : "Start Camera"}
          </Button>
        </div>
      </Card>

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Employee</CardTitle>
            <QrCode className="text-brand-hill" />
          </CardHeader>
          {employee ? (
            <div className="grid gap-3">
              {employee.profile_photo_url ? <img src={employee.profile_photo_url} alt="" className="h-56 w-full rounded-ui object-cover" /> : null}
              <strong className="text-2xl text-brand-dark">{employee.full_name}</strong>
              <span className="font-bold text-slate-600">{employee.employee_id}</span>
              <span>{employee.email}</span>
              <span>{employee.branch_name}</span>
            </div>
          ) : (
            <p className="text-slate-500">Profile appears after scan.</p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Last Result</CardTitle>
            <Camera className="text-brand-hill" />
          </CardHeader>
          {lastResult ? (
            <div className="grid gap-2">
              <span className="w-max rounded-full bg-brand-lime px-3 py-1 text-xs font-black">{lastResult.type}</span>
              <strong>{lastResult.verificationId}</strong>
              <p className="text-sm text-slate-500">Photo evidence, timestamp, and GPS were saved automatically.</p>
              {lastResult.warnings.length ? (
                <p className="rounded-ui border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">
                  Google Sheets warning: {lastResult.warnings.join(" ")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-slate-500">Waiting for attendance.</p>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Validation</CardTitle>
            <MapPin className="text-brand-hill" />
          </CardHeader>
          <p className="text-sm text-slate-600">Camera, GPS, employee validation, photo upload, and verification overlay are required before saving.</p>
        </Card>
      </div>
    </div>
  );
}
