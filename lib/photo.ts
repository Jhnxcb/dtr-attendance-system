import path from "path";
import { Readable, Writable } from "stream";
import * as PImage from "pureimage";
import type { Bitmap } from "pureimage";
import type { AttendanceType } from "@/lib/types";

export interface OverlayInput {
  originalPhoto: Buffer;
  employeeName: string;
  employeeId: string;
  role?: string | null;
  department?: string | null;
  attendanceType: AttendanceType;
  date: string;
  time: string;
  latitude: number;
  longitude: number;
  address: string;
  branch: string;
  verificationId: string;
}

const WIDTH = 1280;
const HEIGHT = 720;
let fontLoaded = false;

export async function createVerificationImage(input: OverlayInput) {
  loadFont();

  const source = await PImage.decodeJPEGFromStream(Readable.from(input.originalPhoto));
  const image = PImage.make(WIDTH, HEIGHT);
  const ctx = image.getContext("2d");
  drawCoverImage(ctx, source);
  drawEvidencePanel(ctx, input);

  return encodePng(image);
}

export function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid photo data.");
  return Buffer.from(base64, "base64");
}

function loadFont() {
  if (fontLoaded) return;
  PImage.registerFont(path.join(process.cwd(), "public", "fonts", "Fredoka.ttf"), "Fredoka").loadSync();
  fontLoaded = true;
}

function drawCoverImage(ctx: ReturnType<Bitmap["getContext"]>, source: Bitmap) {
  const scale = Math.max(WIDTH / source.width, HEIGHT / source.height);
  const sourceWidth = WIDTH / scale;
  const sourceHeight = HEIGHT / scale;
  const sourceX = Math.max(0, (source.width - sourceWidth) / 2);
  const sourceY = Math.max(0, (source.height - sourceHeight) / 2);
  ctx.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, WIDTH, HEIGHT);
}

function drawEvidencePanel(ctx: ReturnType<Bitmap["getContext"]>, input: OverlayInput) {
  const panelX = 70;
  const panelY = 330;
  const panelW = 760;
  const panelH = 330;

  ctx.fillStyle = "rgba(10, 12, 14, 0.82)";
  ctx.strokeStyle = "#FCEFA2";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = input.attendanceType === "TIME OUT" ? "#F87171" : "#FFBF60";
  ctx.font = "700 23pt Fredoka";
  ctx.fillText(input.attendanceType, panelX + 28, panelY + 48);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "700 25pt Fredoka";
  fitText(ctx, input.employeeName, panelX + 28, panelY + 88, 500);

  ctx.fillStyle = "#DDE9D4";
  ctx.font = "600 15pt Fredoka";
  fitText(ctx, `${input.role || "Staff"}${input.department ? ` | ${input.department}` : ""}`, panelX + 28, panelY + 120, 500);

  const rows = [
    ["Date", input.date],
    ["Time", input.time],
    ["Branch", input.branch],
    ["GPS", `${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`],
    ["Location", input.address],
    ["Employee ID", input.employeeId],
    ["Verification", input.verificationId]
  ];

  let y = panelY + 162;
  for (const [label, value] of rows) {
    ctx.fillStyle = "#FFBF60";
    ctx.font = "700 12pt Fredoka";
    ctx.fillText(label.toUpperCase(), panelX + 30, y);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "600 14pt Fredoka";
    fitText(ctx, value, panelX + 172, y, panelW - 205);
    y += 31;
  }
}

function fitText(ctx: ReturnType<Bitmap["getContext"]>, value: string, x: number, y: number, maxWidth: number) {
  if (ctx.measureText(value).width <= maxWidth) {
    ctx.fillText(value, x, y);
    return;
  }

  let trimmed = value;
  while (trimmed.length > 4 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  ctx.fillText(`${trimmed}...`, x, y);
}

function encodePng(image: Bitmap) {
  const chunks: Buffer[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    }
  });

  return PImage.encodePNGToStream(image, stream).then(() => Buffer.concat(chunks));
}
