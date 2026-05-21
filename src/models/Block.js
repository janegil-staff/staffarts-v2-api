// src/models/Block.js
//
// A directed block: `blocker` has blocked `blocked`. Enforcement is MUTUAL —
// if EITHER user has blocked the other, messaging between them is prevented and
// their conversation is hidden from both. We still store the direction so we
// know who initiated it (and so a user can unblock only their own block).

import mongoose from 'mongoose';

const blockSchema = new mongoose.Schema(
  {
    blocker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    blocked: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// One block record per (blocker, blocked) pair — blocking twice is a no-op.
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

// Returns true if a OR b has blocked the other (mutual enforcement).
blockSchema.statics.existsBetween = async function (a, b) {
  const found = await this.findOne({
    $or: [
      { blocker: a, blocked: b },
      { blocker: b, blocked: a },
    ],
  }).lean();
  return !!found;
};

// All user ids that `userId` should not see — anyone they've blocked, plus
// anyone who has blocked them. Used to filter conversation lists.
blockSchema.statics.hiddenUserIdsFor = async function (userId) {
  const rows = await this.find({
    $or: [{ blocker: userId }, { blocked: userId }],
  })
    .select('blocker blocked')
    .lean();

  const ids = new Set();
  for (const r of rows) {
    const other = String(r.blocker) === String(userId) ? r.blocked : r.blocker;
    ids.add(String(other));
  }
  return [...ids];
};

const Block = mongoose.models.Block || mongoose.model('Block', blockSchema);
export default Block;