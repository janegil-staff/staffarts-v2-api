// src/controllers/eventController.js
//
// CRUD for events. List + detail are public; create requires auth (any
// logged-in user); update + delete require auth AND ownership.
//
// Cover image upload reuses the Cloudinary signed-upload pattern (one
// image per event).

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Event, { EVENT_CATEGORIES } from '../models/Event.js';
import { AppError } from '../middleware/errorHandler.js';

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const EVENT_FOLDER =
  process.env.CLOUDINARY_EVENT_FOLDER || 'staffarts/events';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── List ──────────────────────────────────────────────────────────────
// GET /api/events?limit=&page=&category=&createdBy=&q=&upcoming=&sort=
//
// Defaults to upcoming events (date >= now) sorted soonest-first. Pass
// upcoming=false to include past events. Returns a paginated envelope.
export const listEvents = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const skip = (page - 1) * limit;

  const filter = {};

  // Upcoming by default.
  if (req.query.upcoming !== 'false') {
    filter.date = { $gte: new Date() };
  }

  if (req.query.category && EVENT_CATEGORIES.includes(req.query.category)) {
    filter.category = req.query.category;
  }
  if (req.query.createdBy && mongoose.isValidObjectId(req.query.createdBy)) {
    filter.createdBy = req.query.createdBy;
  }

  const q = (req.query.q || '').trim();
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: rx }, { location: rx }, { description: rx }];
  }

  // Upcoming: soonest first. Otherwise newest first.
  const sort =
    req.query.sort ||
    (req.query.upcoming === 'false' ? '-date' : 'date');

  const [data, total] = await Promise.all([
    Event.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'displayName profileImage')
      .lean(),
    Event.countDocuments(filter),
  ]);

  const hasMore = skip + data.length < total;
  res.json({ success: true, data, page, limit, total, hasMore });
};

// ── Detail ────────────────────────────────────────────────────────────
// GET /api/events/:id
export const getEvent = async (req, res) => {
  const event = await Event.findById(req.params.id).populate(
    'createdBy',
    'displayName profileImage bio',
  );
  if (!event) throw new AppError('Event not found', 404);
  res.json({ success: true, data: event });
};

// ── Create ──────────────────────────────────────────────────────────────
// POST /api/events  (auth)
export const createEvent = async (req, res) => {
  const {
    title,
    description,
    category,
    date,
    location,
    coverImage,
    isFree,
    ticketPrice,
    currency,
  } = req.body || {};

  if (!title || !title.trim()) throw new AppError('Title is required', 400);
  if (!date) throw new AppError('Date is required', 400);
  const when = new Date(date);
  if (isNaN(when.getTime())) throw new AppError('Invalid date', 400);

  if (coverImage && CLOUD_NAME) {
    const expectedHost = `res.cloudinary.com/${CLOUD_NAME}/`;
    if (typeof coverImage !== 'string' || !coverImage.includes(expectedHost)) {
      throw new AppError('Invalid image URL', 400);
    }
  }

  const event = await Event.create({
    createdBy: req.userId,
    title: title.trim(),
    description: description?.trim() || '',
    category:
      category && EVENT_CATEGORIES.includes(category) ? category : 'other',
    date: when,
    location: location?.trim() || '',
    coverImage: coverImage || '',
    isFree: !!isFree,
    ticketPrice: isFree ? null : (ticketPrice ?? null),
    currency: currency || 'NOK',
  });

  const populated = await event.populate('createdBy', 'displayName profileImage');
  res.status(201).json({ success: true, data: populated });
};

// ── Update ──────────────────────────────────────────────────────────────
// PATCH /api/events/:id  (auth + owner)
export const updateEvent = async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new AppError('Event not found', 404);
  if (event.createdBy.toString() !== req.userId) {
    throw new AppError('You can only edit your own events', 403);
  }

  const {
    title,
    description,
    category,
    date,
    location,
    coverImage,
    isFree,
    ticketPrice,
    currency,
  } = req.body || {};

  if (title !== undefined) {
    if (!title.trim()) throw new AppError('Title cannot be empty', 400);
    event.title = title.trim();
  }
  if (description !== undefined) event.description = description.trim();
  if (category !== undefined) {
    if (!EVENT_CATEGORIES.includes(category)) {
      throw new AppError('Invalid category', 400);
    }
    event.category = category;
  }
  if (date !== undefined) {
    const when = new Date(date);
    if (isNaN(when.getTime())) throw new AppError('Invalid date', 400);
    event.date = when;
  }
  if (location !== undefined) event.location = location.trim();
  if (isFree !== undefined) {
    event.isFree = !!isFree;
    // Free entry clears any ticket price.
    if (isFree) event.ticketPrice = null;
  }
  if (ticketPrice !== undefined && !event.isFree) {
    event.ticketPrice = ticketPrice === null || ticketPrice === ''
      ? null
      : Number(ticketPrice);
  }
  if (currency !== undefined) event.currency = currency || 'NOK';

  if (coverImage !== undefined) {
    if (coverImage && CLOUD_NAME) {
      const expectedHost = `res.cloudinary.com/${CLOUD_NAME}/`;
      if (typeof coverImage !== 'string' || !coverImage.includes(expectedHost)) {
        throw new AppError('Invalid image URL', 400);
      }
    }
    event.coverImage = coverImage || '';
  }

  await event.save();
  const populated = await event.populate('createdBy', 'displayName profileImage');
  res.json({ success: true, data: populated });
};

// ── Delete ──────────────────────────────────────────────────────────────
// DELETE /api/events/:id  (auth + owner)
export const deleteEvent = async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) throw new AppError('Event not found', 404);
  if (event.createdBy.toString() !== req.userId) {
    throw new AppError('You can only delete your own events', 403);
  }
  await Event.deleteOne({ _id: event._id });
  res.json({ success: true, data: { id: event._id } });
};

// ── Sign cover upload ─────────────────────────────────────────────────────
// POST /api/uploads/event/sign  (auth)
export const signEventUpload = async (req, res) => {
  if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
    throw new AppError('Cloudinary credentials are not configured', 500);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const rand = crypto.randomBytes(6).toString('hex');
  const publicId = `${EVENT_FOLDER}/${req.userId}_${timestamp}_${rand}`;

  const paramsToSign = {
    folder: EVENT_FOLDER,
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
      folder: EVENT_FOLDER,
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