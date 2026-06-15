import type { AttendanceType } from "@/lib/types";

export interface OverlayInput {
  originalPhoto: Buffer;
  employeeName: string;
  employeeId: string;
  attendanceType: AttendanceType;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  address: string;
  branch: string;
  verificationId: string;
}

export async function createVerificationImage(input: OverlayInput) {
  const lines = [
    input.employeeName,
    `Employee ID: ${input.employeeId}`,
    input.attendanceType,
    input.date,
    input.time,
    input.address,
    `Lat: ${input.latitude.toFixed(6)}`,
    `Lng: ${input.longitude.toFixed(6)}`,
    `Branch: ${input.branch}`,
    `Verification ID: ${input.verificationId}`
  ];

  const imageBase64 = input.originalPhoto.toString("base64");
  const lineMarkup = lines
    .map((line, index) => {
      const fill = index === 2 ? "#FFBF60" : "#FFFFFF";
      const weight = index === 2 ? 800 : 700;
      const y = 430 + index * 25;
      return `<text x="58" y="${y}" fill="${fill}" font-size="22" font-weight="${weight}">${escapeXml(line)}</text>`;
    })
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <image href="data:image/jpeg;base64,${imageBase64}" x="0" y="0" width="1280" height="720" preserveAspectRatio="xMidYMid slice"/>
  <rect x="36" y="386" width="850" height="298" rx="10" fill="rgba(17,17,17,0.78)" stroke="#FCEFA2" stroke-width="4"/>
  ${lineMarkup}
</svg>`;

  return Buffer.from(svg, "utf8");
}

export function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid photo data.");
  return Buffer.from(base64, "base64");
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
