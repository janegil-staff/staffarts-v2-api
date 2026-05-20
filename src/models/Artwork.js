// src/models/Artwork.js
//
// An artwork listed on Staff Arts. Owned by a User (the artist). Images are
// Cloudinary URLs; the first element is treated as the cover. Dimensions are
// stored as a structured sub-object (not a freeform string) so the
// marketplace can filter/sort by size later.

import mongoose from 'mongoose';

const ARTWORK_STATUSES = ['available', 'sold', 'reserved'];
const MAX_IMAGES = 6;

const dimensionsSchema = new mongoose.Schema(
  {
    width: { type: Number, default: null }, // cm
    height: { type: Number, default: null }, // cm
    depth: { type: Number, default: null }, // cm — optional, for 3D work
    unit: { type: String, default: 'cm' },
  },
  { _id: false },
);

const artworkSchema = new mongoose.Schema(
  {
    artist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true, // "all artworks by this user" runs on every profile view
    },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    medium: { type: String, default: '', trim: true, maxlength: 200 },

    dimensions: { type: dimensionsSchema, default: () => ({}) },

    year: { type: Number, default: null },

    // Single price + currency. priceOnRequest left out per current scope —
    // an unset/zero price simply means "not for sale / contact artist".
    price: { type: Number, default: null, min: 0 },
    currency: { type: String, default: 'NOK', uppercase: true, maxlength: 3 },

    // Cloudinary secure URLs. First = cover. Capped at MAX_IMAGES by the
    // controller (schema validator below is a backstop).
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length <= MAX_IMAGES,
        message: `An artwork can have at most ${MAX_IMAGES} images`,
      },
    },

    status: {
      type: String,
      enum: ARTWORK_STATUSES,
      default: 'available',
      index: true,
    },
  },
  { timestamps: true },
);

// Most listings are newest-first; compound index helps the common feed query.
artworkSchema.index({ createdAt: -1 });
artworkSchema.index({ artist: 1, createdAt: -1 });

artworkSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export { ARTWORK_STATUSES, MAX_IMAGES };

export default mongoose.models.Artwork ||
  mongoose.model('Artwork', artworkSchema);