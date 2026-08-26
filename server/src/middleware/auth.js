import jwt from "jsonwebtoken";

import User from "../models/User.js";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* =========================================================
   EXTRACT BEARER TOKEN
========================================================= */

function getBearerToken(req) {
  const authorization = req.headers?.authorization;

  if (!authorization || typeof authorization !== "string") {
    return null;
  }

  const [scheme, token] = authorization.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

/* =========================================================
   AUTHENTICATE
========================================================= */

export const authenticate = asyncHandler(async (req, res, next) => {
  /* ---------------------------------------------------
         GET AUTH TOKENS
      --------------------------------------------------- */

  const bearerToken = getBearerToken(req);

  const cookieToken = req.cookies?.accessToken || null;

  /*
   * IMPORTANT PRODUCTION FIX
   *
   * Bearer token MUST have priority.
   *
   * Previously you had:
   *
   * req.cookies?.accessToken || bearer
   *
   * That means an old/stale cookie could override the
   * fresh token sent by your frontend.
   *
   * Correct:
   */
  const token = bearerToken || cookieToken;

  /* ---------------------------------------------------
         NO TOKEN
      --------------------------------------------------- */

  if (!token) {
    throw new ApiError(401, "Authentication required", "UNAUTHORIZED");
  }

  /* ---------------------------------------------------
         VERIFY ACCESS TOKEN
      --------------------------------------------------- */

  let payload;

  try {
    payload = jwt.verify(token, env.accessSecret);
  } catch (error) {
    console.warn("Access token verification failed:", error?.name);

    throw new ApiError(401, "Session expired or invalid", "UNAUTHORIZED");
  }

  /* ---------------------------------------------------
         CHECK TOKEN TYPE
      --------------------------------------------------- */

  if (payload?.type && payload.type !== "access") {
    throw new ApiError(401, "Invalid session token", "UNAUTHORIZED");
  }

  /* ---------------------------------------------------
         CHECK USER ID

         authService currently appears to use JWT `sub`.
      --------------------------------------------------- */

  const userId = payload?.sub || payload?.userId || payload?.id;

  if (!userId) {
    throw new ApiError(401, "Invalid authentication token", "UNAUTHORIZED");
  }

  /* ---------------------------------------------------
         LOAD USER
      --------------------------------------------------- */

  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(401, "Account is unavailable", "UNAUTHORIZED");
  }

  /* ---------------------------------------------------
         CHECK STATUS
      --------------------------------------------------- */

  if (user.status !== "ACTIVE") {
    throw new ApiError(401, "Account is unavailable", "UNAUTHORIZED");
  }

  /* ---------------------------------------------------
         ATTACH AUTH USER
      --------------------------------------------------- */

  req.user = user;

  /*
   * Useful if you ever need to debug where
   * authentication came from.
   */
  req.auth = {
    userId: String(user._id),

    source: bearerToken ? "bearer" : "cookie",
  };

  return next();
});
