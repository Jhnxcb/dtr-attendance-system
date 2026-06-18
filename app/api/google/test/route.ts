import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET() {
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED === "false") {
    return NextResponse.json({
      ok: false,
      disabled: true,
      error: "Google Sheets sync is disabled."
    });
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const rawJson = getServiceAccountJson();
  const fallbackEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const fallbackKey = process.env.GOOGLE_PRIVATE_KEY;

  const parsedJson = parseServiceAccountJson(rawJson);
  const email = parsedJson?.client_email || fallbackEmail;
  const key = normalizePrivateKey(parsedJson?.private_key || fallbackKey);

  const diagnostic = {
    spreadsheetIdSet: Boolean(spreadsheetId),
    serviceAccountJsonSet: Boolean(rawJson),
    serviceAccountJsonValid: Boolean(parsedJson),
    usingJsonCredential: Boolean(parsedJson?.client_email && parsedJson.private_key),
    serviceAccountEmail: email || null,
    privateKeyDetected: Boolean(key),
    privateKeyLooksValid: Boolean(key?.includes("BEGIN PRIVATE KEY") && key.includes("END PRIVATE KEY")),
    privateKeyId: parsedJson?.private_key_id || null
  };

  if (!spreadsheetId || !email || !key) {
    return NextResponse.json({
      ok: false,
      diagnostic,
      error: "Missing Google Sheets spreadsheet ID, service account email, or private key."
    });
  }

  try {
    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({ version: "v4", auth });
    const response = await sheets.spreadsheets.get({ spreadsheetId });

    return NextResponse.json({
      ok: true,
      diagnostic,
      spreadsheetTitle: response.data.properties?.title || null,
      sheetNames: response.data.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean) || []
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      diagnostic,
      error: error instanceof Error ? error.message : "Google Sheets test failed."
    });
  }
}

function parseServiceAccountJson(rawJson?: string) {
  if (!rawJson) return null;

  try {
    return JSON.parse(rawJson.trim()) as {
      client_email?: string;
      private_key?: string;
      private_key_id?: string;
    };
  } catch {
    return null;
  }
}

function getServiceAccountJson() {
  const rawBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (rawBase64) {
    try {
      return Buffer.from(rawBase64.trim(), "base64").toString("utf8");
    } catch {
      return undefined;
    }
  }

  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

function normalizePrivateKey(rawKey?: string) {
  if (!rawKey) return undefined;

  return rawKey
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n");
}
