// src/models/Event.js
//
// An Event in the Shows feed: openings, workshops, talks, fairs, concerts,
// etc. One image (cover). `createdBy` is the organizer — structured like
// Artwork.artist so ownership checks (and a future "contact organizer"
// chat hook) work the same way across content types.

import mongoose from 'mongoose';

export const EVENT_CATEGORIES = [
  'opening',
  'exhibition',
  'workshop',
  'talk',
  'fair',
  'concert',
  'performance',
  'other',
];

const eventSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    category: {
      type: String,
      enum: EVENT_CATEGORIES,
      default: 'other',
      index: true,
    },
    // Single start datetime (date + time combined, stored as Date).
    date: { type: Date, required: true, index: true },
    location: { type: String, default: '', trim: true, maxlength: 300 },
    coverImage: { type: String, default: '' },
    isFree: { type: Boolean, default: false },
    ticketPrice: { type: Number, default: null },
    currency: { type: String, default: 'NOK' },
  },
  { timestamps: true },
);

// Common query: upcoming events sorted by date.
eventSchema.index({ date: 1 });

const Event = mongoose.model('Event', eventSchema);
export default Event;