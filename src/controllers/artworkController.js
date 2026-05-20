// src/controllers/artworkController.js
//
// CRUD for artworks. List + detail are public; create requires auth (any
// logged-in user); update + delete require auth AND ownership.
//
// Image upload reuses the Cloudinary signed-upload pattern. The signing
// endpoint lives here (signArtworkUpload) and mirrors the avatar flow but
// allows multiple images under a per-artwork-ish folder.

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Artwork, { ARTWORK_STATUSES, MAX_IMAGES } from '../models/Artwork.js';
import { AppError } from '../middleware/errorHandler.js';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const ARTWORK_FOLDER =
  process.env.CLOUDINARY_ARTWORK_FOLDER || 'staffarts/artworks';

// Escape user input before using it in a regex.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── List ────────────────────────────────────────────────────────────────
// GET /api/artworks?limit=&page=&sort=&artist=&status=&available=&q=
//
// Uses an aggregation pipeline so we can search across the artist's
// displayName (a ref) as well as the artwork's own title/medium, and
// return a page slice + total count in a single round-trip via $facet.
//
// Response: { success, data, page, limit, total, hasMore }
export const listArtworks = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  // Sort: default newest first. Accept '-field' or 'field'.
  const sortParam = req.query.sort || '-createdAt';
  const sortField = sortParam.replace(/^-/, '');
  const sortDir = sortParam.startsWith('-') ? -1 : 1;
  const sort = { [sortField]: sortDir };

  // ── Base match (pre-lookup): artist + status filters ──
  const match = {};
  if (req.query.artist && mongoose.isValidObjectId(req.query.artist)) {
    match.artist = new mongoose.Types.ObjectId(req.query.artist);
  }
  if (req.query.status && ARTWORK_STATUSES.includes(req.query.status)) {
    match.status = req.query.status;
  }
  // `available=true` is a convenience flag for the "For sale" toggle.
  if (req.query.available === 'true') {
    match.status = 'available';
  }

  // ── Search match (post-lookup): title / medium / artist.displayName ──
  const q = (req.query.q || '').trim();
  const searchStage = [];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    searchStage.push({
      $match: {
        $or: [
          { title: rx },
          { medium: rx },
          { 'artistDoc.displayName': rx },
        ],
      },
    });
  }

  const pipeline = [
    { $match: match },
    // Join the artist so we can both search and shape the response.
    {
      $lookup: {
        from: 'users',
        localField: 'artist',
        foreignField: '_id',
        as: 'artistDoc',
      },
    },
    { $unwind: { path: '$artistDoc', preserveNullAndEmptyArrays: true } },
    ...searchStage,
    // Re-shape artist to the same subset .populate() returned before.
    {
      $addFields: {
        artist: {
          _id: '$artistDoc._id',
          displayName: '$artistDoc.displayName',
          profileImage: '$artistDoc.profileImage',
        },
      },
    },
    { $project: { artistDoc: 0 } },
    // One round-trip: page slice + total count.
    {
      $facet: {
        data: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        meta: [{ $count: 'total' }],
      },
    },
  ];

  const result = await Artwork.aggregate(pipeline);
  const data = result?.[0]?.data ?? [];
  const total = result?.[0]?.meta?.[0]?.total ?? 0;
  const hasMore = skip + data.length < total;

  res.json({ success: true, data, page, limit, total, hasMore });
};

// ── Detail ──────────────────────────────────────────────────────────────
// GET /api/artworks/:id
export const getArtwork = async (req, res) => {
  const artwork = await Artwork.findById(req.params.id).populate(
    'artist',
    'displayName profileImage bio',
  );
  if (!artwork) throw new AppError('Artwork not found', 404);
  res.json({ success: true, data: artwork });
};

// ── Create ──────────────────────────────────────────────────────────────
// POST /api/artworks  (auth)
export const createArtwork = async (req, res) => {
  const {
    title,
    description,
    medium,
    dimensions,
    year,
    price,
    currency,
    images,
    status,
  } = req.body || {};

  if (!title || !title.trim()) {
    throw new AppError('Title is required', 400);
  }

  if (Array.isArray(images) && images.length > MAX_IMAGES) {
    throw new AppError(`Too many images (max ${MAX_IMAGES})`, 400);
  }

  if (Array.isArray(images) && CLOUD_NAME) {
    const expectedHost = `res.cloudinary.com/${CLOUD_NAME}/`;
    for (const url of images) {
      if (typeof url !== 'string' || !url.includes(expectedHost)) {
        throw new AppError('Invalid image URL', 400);
      }
    }
  }

  const artwork = await Artwork.create({
    artist: req.userId,
    title: title.trim(),
    description: description?.trim() || '',
    medium: medium?.trim() || '',
    dimensions: dimensions || {},
    year: year ?? null,
    price: price ?? null,
    currency: currency || 'NOK',
    images: Array.isArray(images) ? images : [],
    status:
      status && ARTWORK_STATUSES.includes(status) ? status : 'available',
  });

  const populated = await artwork.populate(
    'artist',
    'displayName profileImage',
  );
  res.status(201).json({ success: true, data: populated });
};

// ── Update ──────────────────────────────────────────────────────────────
// PATCH /api/artworks/:id  (auth + owner)
export const updateArtwork = async (req, res) => {
  const artwork = await Artwork.findById(req.params.id);
  if (!artwork) throw new AppError('Artwork not found', 404);

  if (artwork.artist.toString() !== req.userId) {
    throw new AppError('You can only edit your own artwork', 403);
  }

  const {
    title,
    description,
    medium,
    dimensions,
    year,
    price,
    currency,
    images,
    status,
  } = req.body || {};

  if (title !== undefined) {
    if (!title.trim()) throw new AppError('Title cannot be empty', 400);
    artwork.title = title.trim();
  }
  if (description !== undefined) artwork.description = description.trim();
  if (medium !== undefined) artwork.medium = medium.trim();
  if (dimensions !== undefined) artwork.dimensions = dimensions;
  if (year !== undefined) artwork.year = year;
  if (price !== undefined) artwork.price = price;
  if (currency !== undefined) artwork.currency = currency;

  if (images !== undefined) {
    if (!Array.isArray(images)) throw new AppError('Images must be an array', 400);
    if (images.length > MAX_IMAGES) {
      throw new AppError(`Too many images (max ${MAX_IMAGES})`, 400);
    }
    if (CLOUD_NAME) {
      const expectedHost = `res.cloudinary.com/${CLOUD_NAME}/`;
      for (const url of images) {
        if (typeof url !== 'string' || !url.includes(expectedHost)) {
          throw new AppError('Invalid image URL', 400);
        }
      }
    }
    artwork.images = images;
  }

  if (status !== undefined) {
    if (!ARTWORK_STATUSES.includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    artwork.status = status;
  }

  await artwork.save();
  const populated = await artwork.populate(
    'artist',
    'displayName profileImage',
  );
  res.json({ success: true, data: populated });
};

// ── Delete ──────────────────────────────────────────────────────────────
// DELETE /api/artworks/:id  (auth + owner)
export const deleteArtwork = async (req, res) => {
  const artwork = await Artwork.findById(req.params.id);
  if (!artwork) throw new AppError('Artwork not found', 404);

  if (artwork.artist.toString() !== req.userId) {
    throw new AppError('You can only delete your own artwork', 403);
  }

  await Artwork.deleteOne({ _id: artwork._id });
  res.json({ success: true, data: { id: artwork._id } });
};

// ── Sign image upload ─────────────────────────────────────────────────────
// POST /api/uploads/artwork/sign  (auth)
export const signArtworkUpload = async (req, res) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new AppError('Cloudinary credentials are not configured', 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const rand = crypto.randomBytes(6).toString('hex');
  const publicId = `${ARTWORK_FOLDER}/${req.userId}_${timestamp}_${rand}`;

  const paramsToSign = {
    folder: ARTWORK_FOLDER,
    public_id: publicId,
    timestamp,
    transformation: 'c_limit,w_2000,h_2000,q_auto,f_auto',
  };

  const signature = signCloudinary(paramsToSign, API_SECRET);

  res.json({
    success: true,
    data: {
      cloudName: CLOUD_NAME,
      apiKey: API_KEY,
      timestamp,
      folder: ARTWORK_FOLDER,
      publicId,
      transformation: paramsToSign.transformation,
      signature,
    },
  });
};

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