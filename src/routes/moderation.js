// src/routes/moderation.js
//
// Block / unblock / list-blocks and report endpoints.
// Mounted at /api (e.g. app.use('/api', moderationRouter)) so paths are:
//   POST   /api/blocks            { userId }            -> block a user
//   DELETE /api/blocks/:userId                          -> unblock a user
//   GET    /api/blocks                                  -> list users I've blocked
//   POST   /api/reports           { userId, messageId?, conversationId?, reason?, detail? }
//
// All responses use the shared { success, data } envelope.
//
// NOTE: adjust the auth import to match your project. Other routes import the
// same middleware that sets req.userId — use that exact path here.

import express from 'express';
import mongoose from 'mongoose';
import Block from '../models/Block.js';
import Report, { REPORT_REASONS } from '../models/Report.js';

// Same auth middleware the messages routes use: default export, sets req.userId.
import authenticate from '../middleware/authenticate.js';

const router = express.Router();

const ok = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const fail = (res, error, status = 400) =>
  res.status(status).json({ success: false, error });

const isId = (v) => mongoose.Types.ObjectId.isValid(v);

// ── Block a user ──────────────────────────────────────────────────────────
router.post('/blocks', authenticate, async (req, res) => {
  try {
    const me = req.userId;
    const { userId } = req.body || {};
    if (!isId(userId)) return fail(res, 'Invalid userId');
    if (String(userId) === String(me)) return fail(res, 'You cannot block yourself');

    // Idempotent: upsert so blocking twice is a no-op.
    await Block.updateOne(
      { blocker: me, blocked: userId },
      { $setOnInsert: { blocker: me, blocked: userId } },
      { upsert: true },
    );

    return ok(res, { blocked: String(userId) }, 201);
  } catch (e) {
    return fail(res, 'Could not block user', 500);
  }
});

// ── Unblock a user ────────────────────────────────────────────────────────
router.delete('/blocks/:userId', authenticate, async (req, res) => {
  try {
    const me = req.userId;
    const { userId } = req.params;
    if (!isId(userId)) return fail(res, 'Invalid userId');

    await Block.deleteOne({ blocker: me, blocked: userId });
    return ok(res, { unblocked: String(userId) });
  } catch (e) {
    return fail(res, 'Could not unblock user', 500);
  }
});

// ── List users I've blocked ─────────────────────────────────────────────────
router.get('/blocks', authenticate, async (req, res) => {
  try {
    const me = req.userId;
    const rows = await Block.find({ blocker: me })
      .populate('blocked', 'displayName profileImage')
      .sort({ createdAt: -1 })
      .lean();

    const data = rows
      .filter((r) => r.blocked) // guard against deleted users
      .map((r) => ({
        userId: String(r.blocked._id),
        displayName: r.blocked.displayName,
        profileImage: r.blocked.profileImage || '',
        blockedAt: r.createdAt,
      }));

    return ok(res, data);
  } catch (e) {
    return fail(res, 'Could not load blocked users', 500);
  }
});

// ── Report a user (optionally a specific message) ───────────────────────────
router.post('/reports', authenticate, async (req, res) => {
  try {
    const me = req.userId;
    const { userId, messageId, conversationId, reason, detail } = req.body || {};

    if (!isId(userId)) return fail(res, 'Invalid userId');
    if (String(userId) === String(me)) return fail(res, 'You cannot report yourself');
    if (messageId && !isId(messageId)) return fail(res, 'Invalid messageId');
    if (conversationId && !isId(conversationId)) return fail(res, 'Invalid conversationId');

    const safeReason = REPORT_REASONS.includes(reason) ? reason : 'other';
    const safeDetail = typeof detail === 'string' ? detail.slice(0, 1000) : '';

    const report = await Report.create({
      reporter: me,
      reportedUser: userId,
      message: messageId || null,
      conversation: conversationId || null,
      reason: safeReason,
      detail: safeDetail,
    });

    return ok(res, { reportId: String(report._id) }, 201);
  } catch (e) {
    return fail(res, 'Could not submit report', 500);
  }
});

export default router;