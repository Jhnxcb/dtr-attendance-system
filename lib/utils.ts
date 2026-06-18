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
  if (Number.isNaN(first.getTime())) return false;

  return first.getFullYear() === date.getFullYear() &&
    first.getMonth() === date.getMonth() &&
    first.getDate() === date.getDate();
}
