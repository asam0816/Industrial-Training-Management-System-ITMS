import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import RefreshSession from "../models/RefreshSession.js";
import { env } from "../config/env.js";
import { durationMs } from "../utils/duration.js";
export async function issueTokens(user) {
  const access = jwt.sign(
    { sub: String(user._id), role: user.role, type: "access" },
    env.accessSecret,
    { expiresIn: env.accessExpires },
  );
  const jti = uuid();
  const refresh = jwt.sign(
    { sub: String(user._id), jti, type: "refresh" },
    env.refreshSecret,
    { expiresIn: env.refreshExpires },
  );
  await RefreshSession.create({
    userId: user._id,
    jti,
    expiresAt: new Date(Date.now() + durationMs(env.refreshExpires)),
  });
  return { access, refresh };
}
export function setAuthCookies(res, { access, refresh }, remember = true) {
  const base = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? "none" : "lax",
    path: "/",
  };
  res.cookie("accessToken", access, {
    ...base,
    maxAge: durationMs(env.accessExpires),
  });
  res.cookie("refreshToken", refresh, {
    ...base,
    maxAge: remember ? durationMs(env.refreshExpires) : undefined,
  });
}
export function clearAuthCookies(res) {
  const opts = {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? "none" : "lax",
    path: "/",
  };
  res.clearCookie("accessToken", opts);
  res.clearCookie("refreshToken", opts);
}
