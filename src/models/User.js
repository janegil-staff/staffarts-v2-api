// src/models/User.js
//
// Email + 4-digit PIN authentication. PIN is bcrypt-hashed. Brute-force is
// mitigated by rate limiting in the route layer.

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

const SUPPORTED_LANGUAGES = [
  'no', 'en', 'nl', 'fr', 'de', 'it',
  'sv', 'da', 'fi', 'es', 'pl', 'pt',
];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // Bcrypt hash of the user's 4-digit PIN. select:false so it never leaks.
    pinHash: { type: String, required: true, select: false },

    displayName: { type: String, required: true, trim: true },

    profileImage: { type: String, default: null },
    bio: { type: String, default: '' },

    // ── Preferences ───────────────────────────────────────────────────
    // ISO 639-1 code; restricted to languages the app supports. Used for
    // PIN reset emails, future welcome emails, and multi-device sync.
    language: {
      type: String,
      enum: SUPPORTED_LANGUAGES,
      default: 'en',
    },

    role: {
      type: String,
      enum: ['collector', 'artist'],
      default: 'collector',
    },

    // ── Refresh-token rotation ────────────────────────────────────────
    currentRefreshToken: { type: String, default: null, select: false },
    previousRefreshToken: { type: String, default: null, select: false },
    previousRefreshExpiresAt: { type: Date, default: null, select: false },

    // ── Forgot-PIN reset codes ────────────────────────────────────────
    pinResetCodeHash: { type: String, default: null, select: false },
    pinResetExpiresAt: { type: Date, default: null, select: false },

    // ── Login rate limiting (per-account) ─────────────────────────────
    failedPinAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },

    emailVerified: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: () => new Date() },
    lastLoginAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

// ── Instance methods ────────────────────────────────────────────────────
userSchema.methods.setPin = async function (pin) {
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  this.pinHash = await bcrypt.hash(pin, BCRYPT_ROUNDS);
};

userSchema.methods.comparePin = async function (pin) {
  if (!this.pinHash || typeof pin !== 'string') return false;
  return bcrypt.compare(pin, this.pinHash);
};

userSchema.methods.isLocked = function () {
  return this.lockedUntil && this.lockedUntil.getTime() > Date.now();
};

// Strip sensitive fields from JSON.
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.pinHash;
  delete obj.currentRefreshToken;
  delete obj.previousRefreshToken;
  delete obj.previousRefreshExpiresAt;
  delete obj.pinResetCodeHash;
  delete obj.pinResetExpiresAt;
  delete obj.failedPinAttempts;
  delete obj.lockedUntil;
  delete obj.__v;
  return obj;
};

// Export the supported list so the controller can validate before save.
export { SUPPORTED_LANGUAGES };

export default mongoose.models.User || mongoose.model('User', userSchema);