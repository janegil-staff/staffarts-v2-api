// src/controllers/authController.js
//
// Email + 4-digit PIN authentication with refresh-token rotation and a
// forgot-PIN email reset flow. Lockout after too many failed attempts.

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import { sendPinResetEmail } from "../services/mailer.js";

const GRACE_SECONDS = Number(process.env.REFRESH_GRACE_SECONDS) || 30;

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_CODE_TTL_MINUTES = 15;
const BCRYPT_ROUNDS = 10;

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

async function issueTokens(user) {
  const payload = { userId: user._id.toString() };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  user.previousRefreshToken = user.currentRefreshToken || null;
  user.previousRefreshExpiresAt = user.currentRefreshToken
    ? new Date(Date.now() + GRACE_SECONDS * 1000)
    : null;
  user.currentRefreshToken = refreshToken;
  user.lastSeenAt = new Date();
  user.lastLoginAt = new Date();
  user.failedPinAttempts = 0;
  user.lockedUntil = null;

  await user.save({ validateBeforeSave: false });

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
}

function generateResetCode() {
  // 6-digit numeric code, zero-padded.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function isValidPin(pin) {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

// Only the register function shown here — the rest of authController.js
// stays the same. Just replace the `register` export.

export const register = async (req, res) => {
  const { email, pin, displayName, language } = req.body || {};

  if (!email || !pin || !displayName) {
    throw new AppError("Email, PIN, and display name are required", 400);
  }
  if (!isValidPin(pin)) {
    throw new AppError("PIN must be exactly 4 digits", 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError("An account with that email already exists", 409);
  }

  const user = new User({
    email: normalizedEmail,
    displayName: displayName.trim(),
  });

  // Optional language — validated by the schema's enum. Silently fall back
  // to 'en' if the client sends an unsupported code.
  if (language && SUPPORTED_LANGUAGES.includes(language)) {
    user.language = language;
  }

  await user.setPin(pin);
  await user.save();

  const data = await issueTokens(user);
  res.status(201).json({ success: true, data });
};
// ────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ────────────────────────────────────────────────────────────────────────

export const login = async (req, res) => {
  const { email, pin } = req.body || {};

  if (!email || !pin) {
    throw new AppError("Email and PIN are required", 400);
  }
  if (!isValidPin(pin)) {
    throw new AppError("PIN must be exactly 4 digits", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+pinHash +currentRefreshToken +failedPinAttempts +lockedUntil",
  );

  // Constant-time-ish: even if user doesn't exist, do a bcrypt compare so
  // attackers can't enumerate accounts by response timing.
  if (!user) {
    await bcrypt.compare(
      pin,
      "$2a$10$invalidinvalidinvalidinvalidinvalidinvalid",
    );
    throw new AppError("Invalid credentials", 401);
  }

  if (user.isLocked()) {
    const minutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000,
    );
    throw new AppError(
      `Account locked. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      429,
    );
  }

  const valid = await user.comparePin(pin);
  if (!valid) {
    user.failedPinAttempts = (user.failedPinAttempts || 0) + 1;
    if (user.failedPinAttempts >= MAX_FAILED_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
      user.failedPinAttempts = 0;
      await user.save({ validateBeforeSave: false });
      throw new AppError(
        `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.`,
        429,
      );
    }
    await user.save({ validateBeforeSave: false });
    throw new AppError("Invalid credentials", 401);
  }

  const data = await issueTokens(user);
  res.json({ success: true, data });
};

// ────────────────────────────────────────────────────────────────────────
// POST /api/auth/forgot-pin
// Body: { email }
// Always responds 200 (no account enumeration).
// ────────────────────────────────────────────────────────────────────────

export const forgotPin = async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    throw new AppError("Email is required", 400);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+pinResetCodeHash +pinResetExpiresAt",
  );

  if (user) {
    const code = generateResetCode();
    user.pinResetCodeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    user.pinResetExpiresAt = new Date(
      Date.now() + RESET_CODE_TTL_MINUTES * 60_000,
    );
    await user.save({ validateBeforeSave: false });

    try {
      await sendPinResetEmail({
        to: user.email,
        displayName: user.displayName,
        code,
        ttlMinutes: RESET_CODE_TTL_MINUTES,
      });
    } catch (err) {
      // Log but don't surface — we don't want to confirm or deny accounts.
      console.error("[forgotPin] email send failed:", err.message);
    }
  }

  // Always-200 response to avoid leaking which emails are registered.
  res.json({
    success: true,
    data: { message: "If an account exists, a reset code has been sent." },
  });
};

// ────────────────────────────────────────────────────────────────────────
// POST /api/auth/reset-pin
// Body: { email, code, newPin }
// ────────────────────────────────────────────────────────────────────────

export const resetPin = async (req, res) => {
  const { email, code, newPin } = req.body || {};

  if (!email || !code || !newPin) {
    throw new AppError("Email, code, and new PIN are required", 400);
  }
  if (!isValidPin(newPin)) {
    throw new AppError("PIN must be exactly 4 digits", 400);
  }
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
    throw new AppError("Invalid reset code format", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+pinResetCodeHash +pinResetExpiresAt +currentRefreshToken +previousRefreshToken",
  );

  if (
    !user ||
    !user.pinResetCodeHash ||
    !user.pinResetExpiresAt ||
    user.pinResetExpiresAt.getTime() < Date.now()
  ) {
    throw new AppError("Invalid or expired reset code", 401);
  }

  const codeValid = await bcrypt.compare(code, user.pinResetCodeHash);
  if (!codeValid) {
    throw new AppError("Invalid or expired reset code", 401);
  }

  // Set the new PIN, clear the reset state and any lockout.
  await user.setPin(newPin);
  user.pinResetCodeHash = null;
  user.pinResetExpiresAt = null;
  user.failedPinAttempts = 0;
  user.lockedUntil = null;
  // Revoke any existing sessions — force re-login with new PIN.
  user.currentRefreshToken = null;
  user.previousRefreshToken = null;
  user.previousRefreshExpiresAt = null;
  await user.save();

  res.json({
    success: true,
    data: { message: "PIN has been reset. Please sign in." },
  });
};

// ────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ────────────────────────────────────────────────────────────────────────

export const refresh = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    throw new AppError("Refresh token required", 400);
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const user = await User.findById(decoded.userId).select(
    "+currentRefreshToken +previousRefreshToken +previousRefreshExpiresAt",
  );
  if (!user) {
    throw new AppError("User not found", 401);
  }

  const isCurrent = user.currentRefreshToken === refreshToken;
  const isPreviousAndStillValid =
    user.previousRefreshToken === refreshToken &&
    user.previousRefreshExpiresAt &&
    user.previousRefreshExpiresAt.getTime() > Date.now();

  if (!isCurrent && !isPreviousAndStillValid) {
    throw new AppError("Refresh token mismatch", 401);
  }

  if (isPreviousAndStillValid) {
    const accessToken = signAccessToken({ userId: user._id.toString() });
    return res.json({
      success: true,
      data: {
        user: user.toJSON(),
        accessToken,
        refreshToken: user.currentRefreshToken,
      },
    });
  }

  const data = await issueTokens(user);
  res.json({ success: true, data });
};

// ────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ────────────────────────────────────────────────────────────────────────

export const me = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }
  user.lastSeenAt = new Date();
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: { user: user.toJSON() } });
};

// ────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ────────────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.json({ success: true });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.userId).select(
      "+currentRefreshToken +previousRefreshToken +previousRefreshExpiresAt",
    );
    if (user) {
      user.currentRefreshToken = null;
      user.previousRefreshToken = null;
      user.previousRefreshExpiresAt = null;
      await user.save({ validateBeforeSave: false });
    }
  } catch {
    // ignore — invalid/expired tokens are treated as already-revoked
  }

  res.json({ success: true });
};
