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
  const panelX = 64;
  const panelY = 342;
  const panelW = 590;
  const panelH = 330;
  const pad = 24;
  const textX = panelX + pad;
  const labelX = textX;
  const valueX = panelX + 170;
  const valueW = panelW - 195;

  ctx.fillStyle = "rgba(10, 12, 14, 0.82)";
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.strokeStyle = "#FCEFA2";
  ctx.lineWidth = 4;
  ctx.strokeRect(panelX, panelY, panelW, panelH);

  ctx.fillStyle = input.attendanceType === "TIME OUT" ? "#F87171" : "#FFBF60";
  ctx.font = "24px Fredoka";
  ctx.fillText(input.attendanceType, textX, panelY + 42);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "25px Fredoka";
  fitText(ctx, input.employeeName, textX, panelY + 76, panelW - pad * 2);

  ctx.fillStyle = "#DDE9D4";
  ctx.font = "16px Fredoka";
  fitText(ctx, `${input.role || "Staff"}${input.department ? ` | ${input.department}` : ""}`, textX, panelY + 104, panelW - pad * 2);

  const rows = [
    ["Date", input.date],
    ["Time", input.time],
    ["Branch", input.branch],
    ["Location", input.address],
    ["Employee ID", input.employeeId],
    ["Verification", input.verificationId]
  ];

  let y = panelY + 146;
  for (const [label, value] of rows) {
    y = drawInfoRow(ctx, label, value, labelX, valueX, y, valueW);
  }
}

function drawInfoRow(
  ctx: ReturnType<Bitmap["getContext"]>,
  label: string,
  value: string,
  labelX: number,
  valueX: number,
  y: number,
  valueW: number
) {
  const lineHeight = 18;
  ctx.font = "14px Fredoka";
  const lines = wrapText(ctx, value, valueW, 2);

  ctx.fillStyle = "#FFBF60";
  ctx.font = "12px Fredoka";
  ctx.fillText(label.toUpperCase(), labelX, y);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "14px Fredoka";
  lines.forEach((line, index) => {
    ctx.fillText(line, valueX, y + index * lineHeight);
  });

  return y + Math.max(lineHeight + 6, lines.length * lineHeight + 8);
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

function wrapText(ctx: ReturnType<Bitmap["getContext"]>, value: string, maxWidth: number, maxLines: number) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const nextLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(nextLine).width <= maxWidth) {
      line = nextLine;
      continue;
    }

    if (line) lines.push(line);
    line = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  if (!lines.length) {
    lines.push("");
  }

  const consumedText = lines.join(" ");
  if (consumedText.length < String(value || "").length) {
    lines[lines.length - 1] = ellipsize(ctx, lines[lines.length - 1], maxWidth);
  }

  return lines;
}

function ellipsize(ctx: ReturnType<Bitmap["getContext"]>, value: string, maxWidth: number) {
  let trimmed = value;
  while (trimmed.length > 4 && ctx.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}...`;
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
