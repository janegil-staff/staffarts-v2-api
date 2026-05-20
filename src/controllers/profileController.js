// src/controllers/profileController.js
//
// Profile management:
//   - PATCH /api/auth/profile         (auth) — update own displayName + bio
//   - GET   /api/users/:id            — fetch any user's public profile
//   - POST  /api/uploads/avatar/sign  (auth) — Cloudinary signature for direct upload
//   - PATCH /api/auth/avatar          (auth) — save the URL of an uploaded avatar
//
// Cloudinary direct-upload flow:
//   1. Mobile asks API for a signed signature (timestamp + folder + public_id + signature)
//   2. Mobile uploads the file directly to Cloudinary using the signature
//   3. Mobile sends the resulting secure_url back to the API via PATCH /avatar
//   4. API saves the URL on the user document

import crypto from 'node:crypto';
import User from '../models/User.js';
import { AppError } from '../middleware/errorHandler.js';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const UPLOAD_FOLDER = process.env.CLOUDINARY_AVATAR_FOLDER || 'staffarts/avatars';

// ────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/profile
// Body: { displayName?, bio? }
// ────────────────────────────────────────────────────────────────────────

export const updateProfile = async (req, res) => {
  const { displayName, bio } = req.body || {};

  if (displayName === undefined && bio === undefined) {
    throw new AppError('Nothing to update', 400);
  }

  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found', 404);

  if (displayName !== undefined) {
    const trimmed = String(displayName).trim();
    if (trimmed.length < 2) {
      throw new AppError('Display name must be at least 2 characters', 400);
    }
    if (trimmed.length > 60) {
      throw new AppError('Display name is too long', 400);
    }
    user.displayName = trimmed;
  }

  if (bio !== undefined) {
    const trimmed = String(bio).trim();
    if (trimmed.length > 1000) {
      throw new AppError('Bio is too long (max 1000 chars)', 400);
    }
    user.bio = trimmed;
  }

  await user.save();
  res.json({ success: true, data: { user: user.toJSON() } });
};

// ────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/avatar
// Body: { url } — the secure_url returned by Cloudinary after a successful
// direct upload using the signature from /api/uploads/avatar/sign
// ────────────────────────────────────────────────────────────────────────

export const updateAvatar = async (req, res) => {
  const { url } = req.body || {};
  if (!url) throw new AppError('URL is required', 400);

  // Basic sanity check — must be a Cloudinary URL belonging to our cloud.
  if (!CLOUD_NAME) {
    throw new AppError('Cloudinary is not configured', 500);
  }
  const expectedHost = `res.cloudinary.com/${CLOUD_NAME}/`;
  if (!url.includes(expectedHost)) {
    throw new AppError('Invalid avatar URL', 400);
  }

  const user = await User.findById(req.userId);
  if (!user) throw new AppError('User not found', 404);

  user.profileImage = url;
  await user.save();
  res.json({ success: true, data: { user: user.toJSON() } });
};

// ────────────────────────────────────────────────────────────────────────
// POST /api/uploads/avatar/sign
// Returns the signature + params the mobile client needs to upload
// directly to Cloudinary's /image/upload endpoint.
// ────────────────────────────────────────────────────────────────────────

export const signAvatarUpload = async (req, res) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new AppError('Cloudinary credentials are not configured', 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // Scope to a per-user folder. Cloudinary auto-overwrites previous avatar
  // by reusing the same public_id.
  const publicId = `${UPLOAD_FOLDER}/${req.userId}`;

  // Parameters that will be sent to Cloudinary. Whatever you sign, the
  // client MUST include exactly those keys+values in the upload form.
  const paramsToSign = {
    folder: UPLOAD_FOLDER,
    public_id: publicId,
    overwrite: true,
    timestamp,
    // Force a square 512x512 crop, centered on faces if any.
    transformation: 'c_fill,g_face,w_512,h_512,q_auto,f_auto',
  };

  const signature = signCloudinary(paramsToSign, API_SECRET);

  res.json({
    success: true,
    data: {
      cloudName: CLOUD_NAME,
      apiKey: API_KEY,
      timestamp,
      folder: UPLOAD_FOLDER,
      publicId,
      transformation: paramsToSign.transformation,
      overwrite: true,
      signature,
    },
  });
};

// Build a Cloudinary signature: sort params alphabetically by key,
// build `key=value&key=value`, append the api_secret, SHA1 hash, hex.
function signCloudinary(params, apiSecret) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(sorted + apiSecret)
    .digest('hex');
}

// ────────────────────────────────────────────────────────────────────────
// GET /api/users/:id
// Public profile fetch — used to view another user's profile (e.g. an
// artist linked from an artwork detail page).
// ────────────────────────────────────────────────────────────────────────

export const getPublicProfile = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) throw new AppError('User not found', 404);

  // toJSON() already strips sensitive fields. Strip a few more for the
  // public view.
  const json = user.toJSON();
  delete json.email;
  delete json.emailVerified;
  delete json.lastSeenAt;
  delete json.lastLoginAt;
  delete json.createdAt;
  delete json.updatedAt;
  res.json({ success: true, data: { user: json } });
};