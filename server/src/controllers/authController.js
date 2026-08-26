import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Student from "../models/Student.js";
import RefreshSession from "../models/RefreshSession.js";
import PasswordResetToken from "../models/PasswordResetToken.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  issueTokens,
  setAuthCookies,
  clearAuthCookies,
} from "../services/authService.js";
import { env } from "../config/env.js";
import { durationMs } from "../utils/duration.js";
import { strongPassword } from "../utils/password.js";
import { logActivity } from "../services/activityService.js";
async function resolveUser(identifier) {
  let u = await User.findOne({
    $or: [{ email: identifier.toLowerCase() }, { username: identifier }],
  }).select("+passwordHash");
  if (!u) {
    const s = await Student.findOne({ studentNumber: identifier });
    if (s) u = await User.findById(s.userId).select("+passwordHash");
  }
  return u;
}
export const login = asyncHandler(async (req, res) => {
  const { identifier, password, rememberMe } = req.body;
  const user = await resolveUser(identifier);
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new ApiError(
      401,
      "Invalid email/username or password",
      "INVALID_CREDENTIALS",
    );
  if (user.status !== "ACTIVE")
    throw new ApiError(403, "Your account is not active", "USER_SUSPENDED");
  await RefreshSession.updateMany(
    { userId: user._id, revokedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date() } },
  );
  const tokens = await issueTokens(user);
  setAuthCookies(res, tokens, rememberMe !== false);
  user.lastLogin = new Date();
  await user.save();
  await logActivity(req, {
    action: "USER_LOGIN",
    module: "AUTH",
    description: `${user.name} logged in`,
    entityType: "User",
    entityId: user._id,
  });
  const clean = await User.findById(user._id);
  res.json({
    success: true,
    message: "Login successful",
    data: { user: clean },
  });
});
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) throw new ApiError(401, "Refresh token required", "UNAUTHORIZED");
  let p;
  try {
    p = jwt.verify(token, env.refreshSecret);
  } catch {
    throw new ApiError(401, "Refresh session expired", "UNAUTHORIZED");
  }
  const session = await RefreshSession.findOne({
    jti: p.jti,
    userId: p.sub,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session)
    throw new ApiError(401, "Refresh session is invalid", "UNAUTHORIZED");
  session.revokedAt = new Date();
  await session.save();
  const user = await User.findById(p.sub);
  if (!user || user.status !== "ACTIVE")
    throw new ApiError(401, "Account unavailable", "UNAUTHORIZED");
  const tokens = await issueTokens(user);
  setAuthCookies(res, tokens, true);
  res.json({ success: true, message: "Session refreshed" });
});
export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const p = jwt.verify(token, env.refreshSecret);
      await RefreshSession.updateOne(
        { jti: p.jti },
        { $set: { revokedAt: new Date() } },
      );
    } catch {}
  }
  clearAuthCookies(res);
  if (req.user)
    await logActivity(req, {
      action: "USER_LOGOUT",
      module: "AUTH",
      description: `${req.user.name} logged out`,
      entityType: "User",
      entityId: req.user._id,
    });
  res.json({ success: true, message: "Logged out" });
});
export const me = asyncHandler(async (req, res) =>
  res.json({ success: true, data: { user: req.user } }),
);
export const forgotPassword = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  const generic = "If the email exists, a reset link has been created.";
  if (!user) return res.json({ success: true, message: generic, data: {} });
  await PasswordResetToken.deleteMany({ userId: user._id, usedAt: null });
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + env.resetMinutes * 60000),
  });
  const resetUrl = `${env.clientUrl}/reset-password?token=${token}`;
  await logActivity(req, {
    action: "RESET_PASSWORD_REQUEST",
    module: "AUTH",
    description: "Password reset requested",
    entityType: "User",
    entityId: user._id,
  });
  res.json({
    success: true,
    message: generic,
    data: env.nodeEnv === "production" ? {} : { resetUrl },
  });
});
export const resetPassword = asyncHandler(async (req, res) => {
  if (!strongPassword(req.body.password))
    throw new ApiError(
      400,
      "Password must contain at least 8 characters, uppercase, lowercase and a number",
      "VALIDATION_ERROR",
    );
  const hash = crypto.createHash("sha256").update(req.body.token).digest("hex");
  const row = await PasswordResetToken.findOne({
    tokenHash: hash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!row)
    throw new ApiError(
      400,
      "Password reset token is invalid or expired",
      "PASSWORD_RESET_TOKEN_INVALID",
    );
  const user = await User.findById(row.userId).select("+passwordHash");
  user.passwordHash = await bcrypt.hash(req.body.password, 12);
  await user.save();
  row.usedAt = new Date();
  await row.save();
  await RefreshSession.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  res.json({ success: true, message: "Password reset successfully" });
});
export const changePassword = asyncHandler(async (req, res) => {
  if (!strongPassword(req.body.newPassword))
    throw new ApiError(
      400,
      "New password must contain at least 8 characters, uppercase, lowercase and a number",
      "VALIDATION_ERROR",
    );
  const user = await User.findById(req.user._id).select("+passwordHash");
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash)))
    throw new ApiError(
      400,
      "Current password is incorrect",
      "INVALID_CREDENTIALS",
    );
  user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  user.mustChangePassword = false;
  await user.save();
  await RefreshSession.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  const tokens = await issueTokens(user);
  setAuthCookies(res, tokens, true);
  await logActivity(req, {
    action: "CHANGE_PASSWORD",
    module: "AUTH",
    description: "Password changed",
    entityType: "User",
    entityId: user._id,
  });
  res.json({ success: true, message: "Password updated successfully" });
});
