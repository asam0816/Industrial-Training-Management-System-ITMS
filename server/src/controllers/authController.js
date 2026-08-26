import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";

import User from "../models/User.js";
import Student from "../models/Student.js";
import RefreshSession from "../models/RefreshSession.js";
import PasswordResetToken from "../models/PasswordResetToken.js";

import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { strongPassword } from "../utils/password.js";

import {
  issueTokens,
  setAuthCookies,
  clearAuthCookies,
} from "../services/authService.js";

import { env } from "../config/env.js";
import { logActivity } from "../services/activityService.js";

/* =========================================================
   HELPERS
========================================================= */

function normalizeIdentifier(value) {
  return typeof value === "string" ? value.trim() : "";
}

/*
 * Supports different possible authService token object names.
 *
 * Preferred:
 *
 * {
 *   accessToken,
 *   refreshToken
 * }
 */
function getAccessToken(tokens) {
  return tokens?.accessToken || tokens?.access || tokens?.token || null;
}

/* =========================================================
   FIND USER
========================================================= */

async function resolveUser(identifier) {
  const value = normalizeIdentifier(identifier);

  if (!value) {
    return null;
  }

  /*
   * First try email or username.
   */
  let user = await User.findOne({
    $or: [
      {
        email: value.toLowerCase(),
      },
      {
        username: value,
      },
    ],
  }).select("+passwordHash");

  /*
   * If not found, try student number.
   */
  if (!user) {
    const student = await Student.findOne({
      studentNumber: value,
    });

    if (student?.userId) {
      user = await User.findById(student.userId).select("+passwordHash");
    }
  }

  return user;
}

/* =========================================================
   LOGIN
========================================================= */

export const login = asyncHandler(async (req, res) => {
  const { identifier, password, rememberMe } = req.body;

  /* -----------------------------------------------------
       VALIDATION
    ----------------------------------------------------- */

  if (!normalizeIdentifier(identifier) || !password) {
    throw new ApiError(
      400,
      "Email/username/student number and password are required",
      "VALIDATION_ERROR",
    );
  }

  /* -----------------------------------------------------
       FIND USER
    ----------------------------------------------------- */

  const user = await resolveUser(identifier);

  if (!user) {
    throw new ApiError(
      401,
      "Invalid email/username or password",
      "INVALID_CREDENTIALS",
    );
  }

  /* -----------------------------------------------------
       CHECK PASSWORD
    ----------------------------------------------------- */

  if (!user.passwordHash) {
    throw new ApiError(
      401,
      "Invalid email/username or password",
      "INVALID_CREDENTIALS",
    );
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    throw new ApiError(
      401,
      "Invalid email/username or password",
      "INVALID_CREDENTIALS",
    );
  }

  /* -----------------------------------------------------
       CHECK ACCOUNT STATUS
    ----------------------------------------------------- */

  if (user.status !== "ACTIVE") {
    throw new ApiError(403, "Your account is not active", "USER_SUSPENDED");
  }

  /* -----------------------------------------------------
       REVOKE EXISTING REFRESH SESSIONS
    ----------------------------------------------------- */

  await RefreshSession.updateMany(
    {
      userId: user._id,
      revokedAt: null,
      expiresAt: {
        $gt: new Date(),
      },
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );

  /* -----------------------------------------------------
       ISSUE NEW TOKENS
    ----------------------------------------------------- */

  const tokens = await issueTokens(user);

  const accessToken = getAccessToken(tokens);

  if (!accessToken) {
    console.error("issueTokens() did not return an access token");

    throw new ApiError(
      500,
      "Authentication token could not be generated",
      "TOKEN_GENERATION_ERROR",
    );
  }

  /* -----------------------------------------------------
       SET HTTP-ONLY COOKIES
    ----------------------------------------------------- */

  const persistentSession = rememberMe !== false;

  setAuthCookies(res, tokens, persistentSession);

  /* -----------------------------------------------------
       UPDATE LAST LOGIN
    ----------------------------------------------------- */

  user.lastLogin = new Date();

  await user.save();

  /* -----------------------------------------------------
       ACTIVITY LOG
    ----------------------------------------------------- */

  await logActivity(req, {
    action: "USER_LOGIN",
    module: "AUTH",
    description: `${user.name} logged in`,
    entityType: "User",
    entityId: user._id,
  });

  /* -----------------------------------------------------
       CLEAN USER DATA
    ----------------------------------------------------- */

  const cleanUser = await User.findById(user._id);

  /* -----------------------------------------------------
       IMPORTANT

       Return accessToken to frontend.

       api.js will save this as:

       itms_access_token

       and send:

       Authorization: Bearer <token>
    ----------------------------------------------------- */

  return res.status(200).json({
    success: true,
    message: "Login successful",

    accessToken,

    data: {
      user: cleanUser,

      // Also included here so either frontend format works.
      accessToken,
    },
  });
});

/* =========================================================
   REFRESH ACCESS TOKEN
========================================================= */

export const refresh = asyncHandler(async (req, res) => {
  /* -----------------------------------------------------
       GET REFRESH COOKIE
    ----------------------------------------------------- */

  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    throw new ApiError(401, "Refresh token required", "UNAUTHORIZED");
  }

  /* -----------------------------------------------------
       VERIFY REFRESH TOKEN
    ----------------------------------------------------- */

  let payload;

  try {
    payload = jwt.verify(refreshToken, env.refreshSecret);
  } catch (error) {
    throw new ApiError(401, "Refresh session expired", "UNAUTHORIZED");
  }

  /* -----------------------------------------------------
       VALIDATE TOKEN PAYLOAD
    ----------------------------------------------------- */

  if (payload?.type && payload.type !== "refresh") {
    throw new ApiError(401, "Invalid refresh token", "UNAUTHORIZED");
  }

  if (!payload?.sub || !payload?.jti) {
    throw new ApiError(401, "Invalid refresh token payload", "UNAUTHORIZED");
  }

  /* -----------------------------------------------------
       FIND REFRESH SESSION
    ----------------------------------------------------- */

  const session = await RefreshSession.findOne({
    jti: payload.jti,
    userId: payload.sub,
    revokedAt: null,
    expiresAt: {
      $gt: new Date(),
    },
  });

  if (!session) {
    throw new ApiError(401, "Refresh session is invalid", "UNAUTHORIZED");
  }

  /* -----------------------------------------------------
       ROTATE REFRESH SESSION
    ----------------------------------------------------- */

  session.revokedAt = new Date();

  await session.save();

  /* -----------------------------------------------------
       FIND USER
    ----------------------------------------------------- */

  const user = await User.findById(payload.sub);

  if (!user || user.status !== "ACTIVE") {
    throw new ApiError(401, "Account unavailable", "UNAUTHORIZED");
  }

  /* -----------------------------------------------------
       ISSUE NEW TOKENS
    ----------------------------------------------------- */

  const tokens = await issueTokens(user);

  const accessToken = getAccessToken(tokens);

  if (!accessToken) {
    throw new ApiError(
      500,
      "New access token could not be generated",
      "TOKEN_GENERATION_ERROR",
    );
  }

  /* -----------------------------------------------------
       UPDATE COOKIES
    ----------------------------------------------------- */

  setAuthCookies(res, tokens, true);

  /* -----------------------------------------------------
       IMPORTANT

       Return new access token so api.js can update
       localStorage and retry the original request.
    ----------------------------------------------------- */

  return res.status(200).json({
    success: true,
    message: "Session refreshed",

    accessToken,

    data: {
      accessToken,
    },
  });
});

/* =========================================================
   LOGOUT
========================================================= */

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken;

  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.refreshSecret);

      if (payload?.jti) {
        await RefreshSession.updateOne(
          {
            jti: payload.jti,
          },
          {
            $set: {
              revokedAt: new Date(),
            },
          },
        );
      }
    } catch {
      /*
       * Ignore invalid/expired refresh token.
       * Cookies still need to be cleared.
       */
    }
  }

  /* -----------------------------------------------------
       CLEAR COOKIES
    ----------------------------------------------------- */

  clearAuthCookies(res);

  /* -----------------------------------------------------
       ACTIVITY LOG
    ----------------------------------------------------- */

  if (req.user) {
    await logActivity(req, {
      action: "USER_LOGOUT",
      module: "AUTH",
      description: `${req.user.name} logged out`,
      entityType: "User",
      entityId: req.user._id,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Logged out",
  });
});

/* =========================================================
   CURRENT USER
========================================================= */

export const me = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,

    data: {
      user: req.user,
    },
  });
});

/* =========================================================
   FORGOT PASSWORD
========================================================= */

export const forgotPassword = asyncHandler(async (req, res) => {
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const genericMessage = "If the email exists, a reset link has been created.";

  if (!email) {
    return res.status(200).json({
      success: true,
      message: genericMessage,
      data: {},
    });
  }

  const user = await User.findOne({
    email,
  });

  /*
   * Don't reveal whether email exists.
   */
  if (!user) {
    return res.status(200).json({
      success: true,
      message: genericMessage,
      data: {},
    });
  }

  /* -----------------------------------------------------
       INVALIDATE PREVIOUS RESET TOKENS
    ----------------------------------------------------- */

  await PasswordResetToken.deleteMany({
    userId: user._id,
    usedAt: null,
  });

  /* -----------------------------------------------------
       CREATE RESET TOKEN
    ----------------------------------------------------- */

  const token = crypto.randomBytes(32).toString("hex");

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + env.resetMinutes * 60_000),
  });

  /* -----------------------------------------------------
       CREATE RESET URL
    ----------------------------------------------------- */

  const clientUrl = String(env.clientUrl || "")
    .trim()
    .replace(/\/+$/, "");

  const resetUrl = `${clientUrl}/reset-password?token=${token}`;

  /* -----------------------------------------------------
       LOG ACTIVITY
    ----------------------------------------------------- */

  await logActivity(req, {
    action: "RESET_PASSWORD_REQUEST",
    module: "AUTH",
    description: "Password reset requested",
    entityType: "User",
    entityId: user._id,
  });

  return res.status(200).json({
    success: true,
    message: genericMessage,

    data:
      env.nodeEnv === "production"
        ? {}
        : {
            resetUrl,
          },
  });
});

/* =========================================================
   RESET PASSWORD
========================================================= */

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token) {
    throw new ApiError(
      400,
      "Password reset token is required",
      "VALIDATION_ERROR",
    );
  }

  if (!strongPassword(password)) {
    throw new ApiError(
      400,
      "Password must contain at least 8 characters, uppercase, lowercase and a number",
      "VALIDATION_ERROR",
    );
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  /* -----------------------------------------------------
       FIND RESET TOKEN
    ----------------------------------------------------- */

  const resetRow = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: {
      $gt: new Date(),
    },
  });

  if (!resetRow) {
    throw new ApiError(
      400,
      "Password reset token is invalid or expired",
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  }

  /* -----------------------------------------------------
       FIND USER
    ----------------------------------------------------- */

  const user = await User.findById(resetRow.userId).select("+passwordHash");

  if (!user) {
    throw new ApiError(404, "User account not found", "USER_NOT_FOUND");
  }

  /* -----------------------------------------------------
       UPDATE PASSWORD
    ----------------------------------------------------- */

  user.passwordHash = await bcrypt.hash(password, 12);

  await user.save();

  /* -----------------------------------------------------
       MARK RESET TOKEN USED
    ----------------------------------------------------- */

  resetRow.usedAt = new Date();

  await resetRow.save();

  /* -----------------------------------------------------
       REVOKE ALL SESSIONS
    ----------------------------------------------------- */

  await RefreshSession.updateMany(
    {
      userId: user._id,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );

  return res.status(200).json({
    success: true,
    message: "Password reset successfully",
  });
});

/* =========================================================
   CHANGE PASSWORD
========================================================= */

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!strongPassword(newPassword)) {
    throw new ApiError(
      400,
      "New password must contain at least 8 characters, uppercase, lowercase and a number",
      "VALIDATION_ERROR",
    );
  }

  /* -----------------------------------------------------
       GET CURRENT USER
    ----------------------------------------------------- */

  const user = await User.findById(req.user._id).select("+passwordHash");

  if (!user) {
    throw new ApiError(404, "User not found", "USER_NOT_FOUND");
  }

  /* -----------------------------------------------------
       VERIFY CURRENT PASSWORD
    ----------------------------------------------------- */

  const currentPasswordValid = await bcrypt.compare(
    currentPassword,
    user.passwordHash,
  );

  if (!currentPasswordValid) {
    throw new ApiError(
      400,
      "Current password is incorrect",
      "INVALID_CREDENTIALS",
    );
  }

  /* -----------------------------------------------------
       UPDATE PASSWORD
    ----------------------------------------------------- */

  user.passwordHash = await bcrypt.hash(newPassword, 12);

  user.mustChangePassword = false;

  await user.save();

  /* -----------------------------------------------------
       REVOKE PREVIOUS REFRESH SESSIONS
    ----------------------------------------------------- */

  await RefreshSession.updateMany(
    {
      userId: user._id,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    },
  );

  /* -----------------------------------------------------
       CREATE NEW AUTH SESSION
    ----------------------------------------------------- */

  const tokens = await issueTokens(user);

  const accessToken = getAccessToken(tokens);

  if (!accessToken) {
    throw new ApiError(
      500,
      "New authentication token could not be generated",
      "TOKEN_GENERATION_ERROR",
    );
  }

  setAuthCookies(res, tokens, true);

  /* -----------------------------------------------------
       ACTIVITY
    ----------------------------------------------------- */

  await logActivity(req, {
    action: "CHANGE_PASSWORD",
    module: "AUTH",
    description: "Password changed",
    entityType: "User",
    entityId: user._id,
  });

  /*
   * IMPORTANT:
   *
   * Return the replacement token because the frontend
   * may currently be using the old Bearer token.
   */

  return res.status(200).json({
    success: true,
    message: "Password updated successfully",

    accessToken,

    data: {
      accessToken,
    },
  });
});
