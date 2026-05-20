// src/middleware/rateLimit.js
//
// Per-IP rate limiting on abuse-prone endpoints. Uses express-rate-limit's
// in-memory store, which is fine for a single-instance Render deployment.
// For multi-instance, switch to a Redis store.

import rateLimit from 'express-rate-limit';

// ── /api/auth/login ────────────────────────────────────────────────────
// Stricter than the per-account lockout; this catches distributed attacks
// from a single IP across many accounts.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many login attempts. Try again later.',
  },
});

// ── /api/auth/forgot-pin and /api/auth/reset-pin ───────────────────────
// Shared bucket; reset emails are expensive (Resend cost) and reset codes
// are short, so we keep this tight.
export const pinResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 attempts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many reset attempts. Try again later.',
  },
});