import jpeg from "jpeg-js";
import { PNG } from "pngjs";
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

const FONT: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  "C": ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  "J": ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"]
};

export async function createVerificationImage(input: OverlayInput) {
  const source = jpeg.decode(input.originalPhoto, { useTArray: true });
  const png = new PNG({ width: WIDTH, height: HEIGHT });
  drawCoverImage(png, source);

  drawRect(png, 36, 386, 850, 298, [17, 17, 17, 205]);
  drawBorder(png, 36, 386, 850, 298, [252, 239, 162, 255], 4);

  const lines = [
    input.employeeName,
    `${input.role || "Staff"}${input.department ? ` | ${input.department}` : ""}`,
    input.date,
    input.time,
    input.address,
    input.attendanceType,
    `GPS: ${input.latitude.toFixed(6)}, ${input.longitude.toFixed(6)}`,
    `Branch: ${input.branch}`,
    `Employee ID: ${input.employeeId}`,
    `Verification ID: ${input.verificationId}`
  ];

  lines.forEach((line, index) => {
    const color: Rgba = index === 5 ? [255, 191, 96, 255] : [255, 255, 255, 255];
    const scale = index === 0 || index === 5 ? 4 : 3;
    drawText(png, truncateForPanel(line, scale), 58, 424 + index * 25, scale, color);
  });

  return PNG.sync.write(png, { colorType: 6 });
}

export function dataUrlToBuffer(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Invalid photo data.");
  return Buffer.from(base64, "base64");
}

type Rgba = [number, number, number, number];
type DecodedJpeg = {
  width: number;
  height: number;
  data: Uint8Array | Buffer;
};

function drawCoverImage(png: PNG, source: DecodedJpeg) {
  const scale = Math.max(WIDTH / source.width, HEIGHT / source.height);
  const scaledWidth = source.width * scale;
  const scaledHeight = source.height * scale;
  const offsetX = (scaledWidth - WIDTH) / 2;
  const offsetY = (scaledHeight - HEIGHT) / 2;

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.max(0, Math.floor((x + offsetX) / scale)));
      const sourceY = Math.min(source.height - 1, Math.max(0, Math.floor((y + offsetY) / scale)));
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (y * WIDTH + x) * 4;
      png.data[targetIndex] = source.data[sourceIndex];
      png.data[targetIndex + 1] = source.data[sourceIndex + 1];
      png.data[targetIndex + 2] = source.data[sourceIndex + 2];
      png.data[targetIndex + 3] = 255;
    }
  }
}

function drawRect(png: PNG, x: number, y: number, width: number, height: number, color: Rgba) {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      blendPixel(png, col, row, color);
    }
  }
}

function drawBorder(png: PNG, x: number, y: number, width: number, height: number, color: Rgba, thickness: number) {
  drawRect(png, x, y, width, thickness, color);
  drawRect(png, x, y + height - thickness, width, thickness, color);
  drawRect(png, x, y, thickness, height, color);
  drawRect(png, x + width - thickness, y, thickness, height, color);
}

function drawText(png: PNG, text: string, x: number, y: number, scale: number, color: Rgba) {
  let cursor = x;
  for (const rawChar of text.toUpperCase()) {
    const glyph = FONT[rawChar] || FONT[" "];
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, colIndex) => {
        if (pixel === "1") {
          drawRect(png, cursor + colIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      });
    });
    cursor += 6 * scale;
  }
}

function blendPixel(png: PNG, x: number, y: number, color: Rgba) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 4;
  const alpha = color[3] / 255;
  png.data[index] = Math.round(color[0] * alpha + png.data[index] * (1 - alpha));
  png.data[index + 1] = Math.round(color[1] * alpha + png.data[index + 1] * (1 - alpha));
  png.data[index + 2] = Math.round(color[2] * alpha + png.data[index + 2] * (1 - alpha));
  png.data[index + 3] = 255;
}

function truncateForPanel(value: string, scale: number) {
  const maxChars = Math.floor(790 / (6 * scale));
  return value.length > maxChars ? `${value.slice(0, Math.max(0, maxChars - 3))}...` : value;
}
