import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";

import RefreshSession from "../models/RefreshSession.js";

import { env } from "../config/env.js";

import { durationMs } from "../utils/duration.js";

/* =========================================================
   COOKIE CONFIG
========================================================= */

function getCookieOptions() {
  /*
   * localhost HTTP cannot use Secure cookies.
   *
   * Production HTTPS requires them.
   */
  const clientUrl = String(env.clientUrl || "").toLowerCase();

  const clientUsesHttps = clientUrl.startsWith("https://");

  const secure = Boolean(env.cookieSecure) && clientUsesHttps;

  return {
    httpOnly: true,

    secure,

    /*
     * Cross-site deployed frontend/backend:
     * SameSite=None + Secure
     *
     * localhost:
     * SameSite=Lax
     */
    sameSite: secure ? "none" : "lax",

    path: "/",
  };
}

/* =========================================================
   ISSUE TOKENS
========================================================= */

export async function issueTokens(user) {
  const access = jwt.sign(
    {
      sub: String(user._id),

      role: user.role,

      type: "access",
    },

    env.accessSecret,

    {
      expiresIn: env.accessExpires,
    },
  );

  const jti = uuid();

  const refresh = jwt.sign(
    {
      sub: String(user._id),

      jti,

      type: "refresh",
    },

    env.refreshSecret,

    {
      expiresIn: env.refreshExpires,
    },
  );

  await RefreshSession.create({
    userId: user._id,

    jti,

    expiresAt: new Date(Date.now() + durationMs(env.refreshExpires)),
  });

  return {
    access,
    refresh,
  };
}

/* =========================================================
   SET COOKIES
========================================================= */

export function setAuthCookies(res, { access, refresh }, remember = true) {
  const base = getCookieOptions();

  res.cookie("accessToken", access, {
    ...base,

    maxAge: durationMs(env.accessExpires),
  });

  const refreshOptions = {
    ...base,
  };

  /*
   * Remember me:
   * persistent cookie.
   *
   * Otherwise:
   * browser-session cookie.
   */
  if (remember) {
    refreshOptions.maxAge = durationMs(env.refreshExpires);
  }

  res.cookie("refreshToken", refresh, refreshOptions);
}

/* =========================================================
   CLEAR COOKIES
========================================================= */

export function clearAuthCookies(res) {
  const options = getCookieOptions();

  res.clearCookie("accessToken", options);

  res.clearCookie("refreshToken", options);
}
