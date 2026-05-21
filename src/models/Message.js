// src/models/Message.js
//
// A single message inside a Conversation. Created in exactly ONE place —
// the POST /messages route. The socket layer NEVER calls Message.create;
// it only broadcasts what the route already saved. This single-write-path
// rule is what prevents duplicate messages / double badge increments.

import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    body: { type: String, required: true, trim: true, maxlength: 5000 },

    // Optional "about this piece" context. Lets a buyer reference a specific
    // artwork inline without splitting the thread into per-artwork threads.
    artworkRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Artwork',
      default: null,
    },

    // Users who have read this message. Used for read receipts; unread COUNTS
    // are tracked on the Conversation, not derived from this array at runtime.
    readBy: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
  },
  { timestamps: true },
);

// Thread view: newest-first pagination within a conversation.
messageSchema.index({ conversation: 1, createdAt: -1 });

messageSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export default mongoose.models.Message ||
  mongoose.model('Message', messageSchema);