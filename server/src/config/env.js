import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Always load SERVER .env (server/.env) even if you run from repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({
  path: path.resolve(__dirname, "../../.env"),
  override: true,
});

const required = [
  "MONGODB_URI",
  "CLIENT_URL",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];
for (const k of required) {
  if (!process.env[k]) throw new Error(`Missing environment variable: ${k}`);
}

if (
  process.env.JWT_ACCESS_SECRET.length < 32 ||
  process.env.JWT_REFRESH_SECRET.length < 32
) {
  throw new Error("JWT secrets must contain at least 32 characters");
}

const normalizeUrl = (v) => (v ? v.trim().replace(/\/+$/, "") : v);

const rawClientUrl = String(process.env.CLIENT_URL || "").trim();
if (/^CLIENT_URL\s*=/.test(rawClientUrl)) {
  throw new Error(
    "CLIENT_URL value is invalid. Use only the URL like https://itms-new.vercel.app (do not include CLIENT_URL=).",
  );
}

// Optional CSV support
const clientUrls = rawClientUrl
  .split(",")
  .map((x) => normalizeUrl(x))
  .filter(Boolean);

export const env = {
  port: Number(process.env.PORT || 5000),
  nodeEnv: process.env.NODE_ENV || "development",

  mongoUri: process.env.MONGODB_URI,

  clientUrl: normalizeUrl(clientUrls[0]),
  clientUrls,

  accessSecret: process.env.JWT_ACCESS_SECRET,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpires: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  refreshExpires: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

  cookieSecure:
    process.env.COOKIE_SECURE != null
      ? String(process.env.COOKIE_SECURE) === "true"
      : process.env.NODE_ENV === "production",

  uploadDir: process.env.UPLOAD_DIR || "src/uploads",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 10),
  resetMinutes: Number(process.env.PASSWORD_RESET_EXPIRES_MINUTES || 30),
};
