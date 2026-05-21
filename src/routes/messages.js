// src/routes/messages.js
//
// Conversation + message REST API. This is the ONLY place messages are
// created and unread counts are mutated. The socket layer just broadcasts
// what these handlers persist.
//
// Responses use the same envelope as the rest of the API:
//   single:     { success: true, data: <obj|array> }
//   paginated:  { success: true, data: [...], limit, hasMore, nextBefore }
//
// Mounted as: app.use('/api', messagesRoutes)  ->  /api/conversations...
//
// Endpoints:
//   GET    /conversations                  list my threads (newest first)
//   GET    /conversations/unread           total unread across all threads
//   GET    /conversations/with/:userId     find my existing thread with a user
//   GET    /conversations/:id/messages     paginated thread (newest first)
//   POST   /conversations/:id/read         mark a thread read (clears my badge)
//   POST   /messages                       send a message (create-once)

import { Router } from 'express';
import mongoose from 'mongoose';

import authenticate from '../middleware/authenticate.js';
import { AppError } from '../middleware/errorHandler.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { emitNewMessage, emitConversationRead } from '../socket/index.js';

const router = Router();

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Resolve the "other" participant of a conversation given the current user.
function otherParticipant(conversation, meId) {
  return conversation.participants
    .map(String)
    .find((p) => p !== String(meId));
}

// Canonical sorted pair (matches Conversation.findOrCreate ordering).
function sortedPair(a, b) {
  return [String(a), String(b)].sort();
}

// -- List my conversations --------------------------------------------------
router.get('/conversations', authenticate, async (req, res, next) => {
  try {
    const me = req.userId;
    const conversations = await Conversation.find({ participants: me })
      .sort({ updatedAt: -1 })
      .populate('participants', 'displayName profileImage role')
      .lean();

    const data = conversations.map((c) => {
      const unreadMap = c.unread || {};
      const myUnread = Number(unreadMap[String(me)] || 0);
      const other = (c.participants || []).find(
        (p) => String(p._id) !== String(me),
      );
      return {
        _id: c._id,
        participant: other || null,
        lastMessage: c.lastMessage || null,
        unread: myUnread,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      };
    });

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// -- Total unread across all my threads (drives the app/tab badge) ----------
router.get('/conversations/unread', authenticate, async (req, res, next) => {
  try {
    const me = String(req.userId);
    const conversations = await Conversation.find(
      { participants: me },
      { unread: 1 },
    ).lean();

    let total = 0;
    for (const c of conversations) {
      const map = c.unread || {};
      total += Number(map[me] || 0);
    }
    res.json({ success: true, data: { total } });
  } catch (e) {
    next(e);
  }
});

// -- Find my existing thread with a given user (does NOT create one) --------
// Used by entry points that only know the recipient (Message artist / profile)
// so they can load existing history instead of starting a blank 'new' thread.
// Returns { conversationId: <id|null> }.
router.get('/conversations/with/:userId', authenticate, async (req, res, next) => {
  try {
    const me = req.userId;
    const { userId } = req.params;
    if (!isValidId(userId)) throw new AppError('Invalid user id', 400);
    if (String(userId) === String(me)) {
      // No self-conversations; nothing to find.
      return res.json({ success: true, data: { conversationId: null } });
    }

    const participants = sortedPair(me, userId);
    const convo = await Conversation.findOne({ participants }, { _id: 1 }).lean();

    res.json({
      success: true,
      data: { conversationId: convo ? String(convo._id) : null },
    });
  } catch (e) {
    next(e);
  }
});

// -- Get a thread's messages (paginated, newest first) ----------------------
router.get('/conversations/:id/messages', authenticate, async (req, res, next) => {
  try {
    const me = req.userId;
    const { id } = req.params;
    if (!isValidId(id)) throw new AppError('Invalid conversation id', 400);

    const convo = await Conversation.findById(id);
    if (!convo) throw new AppError('Conversation not found', 404);
    if (!convo.participants.map(String).includes(String(me))) {
      throw new AppError('Forbidden', 403);
    }

    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = { conversation: id };
    if (before && !Number.isNaN(before.getTime())) {
      filter.createdAt = { $lt: before };
    }

    const rows = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('artworkRef', 'title images price currency')
      .lean();

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    res.json({
      success: true,
      data,
      limit,
      hasMore,
      nextBefore: data.length ? data[data.length - 1].createdAt : null,
    });
  } catch (e) {
    next(e);
  }
});

// -- Mark a thread read (clears MY unread count) ----------------------------
router.post('/conversations/:id/read', authenticate, async (req, res, next) => {
  try {
    const me = String(req.userId);
    const { id } = req.params;
    if (!isValidId(id)) throw new AppError('Invalid conversation id', 400);

    const convo = await Conversation.findById(id);
    if (!convo) throw new AppError('Conversation not found', 404);
    if (!convo.participants.map(String).includes(me)) {
      throw new AppError('Forbidden', 403);
    }

    convo.unread.set(me, 0);
    await convo.save();

    await Message.updateMany(
      { conversation: id, sender: { $ne: me }, readBy: { $ne: me } },
      { $addToSet: { readBy: me } },
    );

    const io = req.app.get('io');
    const other = otherParticipant(convo, me);
    if (io && other) {
      emitConversationRead(io, {
        toUserId: other,
        conversationId: String(convo._id),
        readerId: me,
      });
    }

    res.json({ success: true, data: { ok: true, unread: 0 } });
  } catch (e) {
    next(e);
  }
});

// -- Send a message (THE ONE AND ONLY message-creation path) ----------------
router.post('/messages', authenticate, async (req, res, next) => {
  try {
    const me = String(req.userId);
    const { toUserId, body, artworkRef } = req.body || {};

    const text = typeof body === 'string' ? body.trim() : '';
    if (!text) throw new AppError('Message body is required', 400);
    if (!isValidId(toUserId)) throw new AppError('Invalid recipient', 400);
    if (String(toUserId) === me) {
      throw new AppError('Cannot message yourself', 400);
    }
    if (artworkRef && !isValidId(artworkRef)) {
      throw new AppError('Invalid artworkRef', 400);
    }

    const recipient = await User.findById(toUserId).select('_id');
    if (!recipient) throw new AppError('Recipient not found', 404);

    const convo = await Conversation.findOrCreate(me, toUserId);

    const message = await Message.create({
      conversation: convo._id,
      sender: me,
      body: text,
      artworkRef: artworkRef || null,
      readBy: [me],
    });

    const recipientKey = String(toUserId);
    const prevUnread = Number(convo.unread.get(recipientKey) || 0);
    convo.unread.set(recipientKey, prevUnread + 1);
    convo.lastMessage = { body: text, sender: me, at: message.createdAt };
    await convo.save();

    const io = req.app.get('io');
    const populated = await message.populate(
      'artworkRef',
      'title images price currency',
    );
    if (io) {
      emitNewMessage(io, {
        toUserId: recipientKey,
        message: populated.toJSON(),
        conversation: {
          _id: String(convo._id),
          lastMessage: convo.lastMessage,
          unread: prevUnread + 1,
        },
      });
    }

    res.status(201).json({ success: true, data: populated.toJSON() });
  } catch (e) {
    if (e?.code === 11000) {
      return next(new AppError('Conversation conflict, retry', 409));
    }
    next(e);
  }
});

export default router;