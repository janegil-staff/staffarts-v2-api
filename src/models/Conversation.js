// src/models/Conversation.js
//
// A 1:1 conversation thread between two users (one thread per PAIR — all
// their messages live here regardless of which artwork sparked them).
//
// Two design choices defend against the badge bugs we want to avoid:
//
//   1. `participants` is stored SORTED, with a unique compound index. This
//      makes it physically impossible to create two threads for the same
//      pair — the classic source of split/duplicate unread counts. Always
//      build the pair via Conversation.findOrCreate() below, never by hand.
//
//   2. `unread` is a per-user Map kept on the document and mutated atomically
//      in the message route. Badges are READ from this number — never
//      recomputed by counting socket events on the client.

import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    // Exactly two user ids, stored in ascending string order so the pair is
    // canonical. Enforced by findOrCreate + the unique index below.
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === 2,
        message: 'A conversation must have exactly two participants',
      },
      index: true,
    },

    // Denormalized snapshot of the most recent message for the conversation
    // list view, so rendering the list never needs to query Messages.
    lastMessage: {
      body: { type: String, default: '' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },

    // Per-participant unread count, keyed by userId string. The source of
    // truth for badges. Map<userIdString, Number>.
    unread: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },
  },
  { timestamps: true },
);

// The guard against duplicate pair-threads. Because participants is always
// stored sorted, [A,B] and [B,A] collapse to the same key.
conversationSchema.index({ participants: 1 }, { unique: true });

// Conversation list is "my threads, newest activity first".
conversationSchema.index({ updatedAt: -1 });

// ── Statics ────────────────────────────────────────────────────────────

// Canonical sort for a participant pair: ascending by string id.
function sortedPair(a, b) {
  return [String(a), String(b)].sort();
}

// Find the single thread for a pair, creating it if absent. Uses an atomic
// upsert so two simultaneous "first messages" can't race into two documents.
conversationSchema.statics.findOrCreate = async function (userA, userB) {
  const participants = sortedPair(userA, userB);
  return this.findOneAndUpdate(
    { participants },
    { $setOnInsert: { participants } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
};

conversationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  // Map serializes to a plain object for JSON; keep it but drop internals.
  if (obj.unread instanceof Map) obj.unread = Object.fromEntries(obj.unread);
  delete obj.__v;
  return obj;
};

export default mongoose.models.Conversation ||
  mongoose.model('Conversation', conversationSchema);