import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

const GRACE_SECONDS = Number(process.env.REFRESH_GRACE_SECONDS) || 30;

/**
 * Builds the response payload returned by register, login, and refresh.
 * Issues both tokens, stores the new refresh on the user (with the old one
 * preserved for the grace window), and returns the user + tokens.
 */
async function issueTokens(user) {
  const payload = { userId: user._id.toString() };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Rotate: keep the existing currentRefreshToken as the previous one,
  // valid for the grace window. Then store the new token as current.
  user.previousRefreshToken = user.currentRefreshToken || null;
  user.previousRefreshExpiresAt = user.currentRefreshToken
    ? new Date(Date.now() + GRACE_SECONDS * 1000)
    : null;
  user.currentRefreshToken = refreshToken;
  user.lastSeenAt = new Date();

  await user.save({ validateBeforeSave: false });

  return {
    user: user.toJSON(),
    accessToken,
    refreshToken,
  };
}

// ─── POST /api/auth/register ────────────────────────────────────────────────

export const register = async (req, res) => {
  const { email, password, displayName } = req.body || {};

  if (!email || !password || !displayName) {
    throw new AppError('Email, password, and display name are required', 400);
  }
  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400);
  }

  // Mongoose will throw a duplicate-key error if email already exists;
  // the global errorHandler converts that to a 409.
  const user = new User({
    email: email.toLowerCase().trim(),
    password,
    displayName: displayName.trim(),
  });
  await user.save();

  const data = await issueTokens(user);
  res.status(201).json({ success: true, data });
};

// ─── POST /api/auth/login ────────────────────────────────────────────────────

export const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    throw new AppError('Email and password are required', 400);
  }

  // Password is select: false on the schema, so we explicitly include it here.
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    '+password +currentRefreshToken'
  );

  if (!user) {
    throw new AppError('Invalid credentials', 401);
  }

  const valid = await user.comparePassword(password);
  if (!valid) {
    throw new AppError('Invalid credentials', 401);
  }

  const data = await issueTokens(user);
  res.json({ success: true, data });
};

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────

export const refresh = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    throw new AppError('Refresh token required', 400);
  }

  // Verify the JWT itself first (signature + expiry). If invalid, no point
  // looking it up in the database.
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await User.findById(decoded.userId).select(
    '+currentRefreshToken +previousRefreshToken +previousRefreshExpiresAt'
  );
  if (!user) {
    throw new AppError('User not found', 401);
  }

  // Accept either:
  //   (a) the current refresh token, or
  //   (b) the previous one within the grace window.
  const isCurrent = user.currentRefreshToken === refreshToken;
  const isPreviousAndStillValid =
    user.previousRefreshToken === refreshToken &&
    user.previousRefreshExpiresAt &&
    user.previousRefreshExpiresAt.getTime() > Date.now();

  if (!isCurrent && !isPreviousAndStillValid) {
    throw new AppError('Refresh token mismatch', 401);
  }

  // If they presented the *previous* token during grace, don't rotate again
  // (the rotation already happened). Return the existing current token info.
  if (isPreviousAndStillValid) {
    // Re-issue an access token from the current refresh's identity.
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

  // Normal case: current token presented. Rotate.
  const data = await issueTokens(user);
  res.json({ success: true, data });
};

// ─── GET /api/auth/me ────────────────────────────────────────────────────────

export const me = async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }
  user.lastSeenAt = new Date();
  await user.save({ validateBeforeSave: false });
  res.json({ success: true, data: { user: user.toJSON() } });
};

// ─── POST /api/auth/logout ───────────────────────────────────────────────────

export const logout = async (req, res) => {
  const user = await User.findById(req.userId);
  if (user) {
    user.currentRefreshToken = null;
    user.previousRefreshToken = null;
    user.previousRefreshExpiresAt = null;
    await user.save({ validateBeforeSave: false });
  }
  res.json({ success: true });
};