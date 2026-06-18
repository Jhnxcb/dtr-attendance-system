import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const APP_TIME_ZONE = process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Asia/Manila";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDeviceInfo() {
  if (typeof navigator === "undefined") return "Server";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "Unknown platform";
  return `${platform} | ${navigator.userAgent}`;
}

export function generateVerificationId(date = new Date(), sequence = 1) {
  const compact = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `ATT-${compact}-${String(sequence).padStart(4, "0")}`;
}

export function formatReadableDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: APP_TIME_ZONE
  }).format(date);
}

export function formatReadableDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: APP_TIME_ZONE
  }).format(date);
}

export function formatAttendanceDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: APP_TIME_ZONE
  }).format(date);
}

export function formatReadableTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: APP_TIME_ZONE
  }).format(date);
}

export function isSameLocalDate(value: string | Date, date = new Date()) {
  const first = value instanceof Date ? value : new Date(value);
  const second = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(first.getTime()) || Number.isNaN(second.getTime())) return false;

  return getLocalDateKey(first) === getLocalDateKey(second);
}

export function getLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: APP_TIME_ZONE
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "0000";
  const month = parts.find((part) => part.type === "month")?.value || "00";
  const day = parts.find((part) => part.type === "day")?.value || "00";
  return `${year}-${month}-${day}`;
}
