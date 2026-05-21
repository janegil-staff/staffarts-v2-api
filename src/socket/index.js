// src/socket/index.js
//
// Socket.io setup and broadcast helpers.
//
// THE GOLDEN RULE: nothing in this file writes to the database. The socket
// layer only ROUTES events between connected clients. Persistence (creating
// messages, incrementing unread counts, marking read) happens in the REST
// routes. After the route saves, it calls emitNewMessage()/emitConversationRead()
// here to broadcast the already-persisted result. One write path, always.
//
// Rooms: each connection joins `user:<userId>`. A user may have several
// sockets (phone + tablet); emitting to the room hits all their devices.

import { Server } from 'socket.io';
import socketAuth from './auth.js';
import { SOCKET_EVENTS } from '../constants/socketEvents.js';

const userRoom = (userId) => `user:${userId}`;

/**
 * Attach Socket.io to an existing HTTP server and wire up handlers.
 * Returns the io instance so server.js can stash it on app (app.set('io', io)).
 */
export function initSocket(httpServer, { corsOrigins = [] } = {}) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins.length ? corsOrigins : true,
      credentials: true,
    },
  });

  // Authenticate every connection at the handshake.
  io.use(socketAuth);

  io.on(SOCKET_EVENTS.CONNECT, (socket) => {
    const { userId } = socket;

    // Join this user's private room — all delivery is room-based.
    socket.join(userRoom(userId));

    // ── Typing relay (pure passthrough, no persistence) ─────────────────
    socket.on(SOCKET_EVENTS.TYPING_START, ({ conversationId, toUserId } = {}) => {
      if (!toUserId) return;
      io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.USER_TYPING, {
        conversationId,
        userId,
        typing: true,
      });
    });

    socket.on(SOCKET_EVENTS.TYPING_STOP, ({ conversationId, toUserId } = {}) => {
      if (!toUserId) return;
      io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.USER_TYPING, {
        conversationId,
        userId,
        typing: false,
      });
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      // Socket.io auto-leaves rooms on disconnect; nothing to clean up.
    });
  });

  return io;
}

// ── Broadcast helpers (called by the REST routes AFTER a successful save) ──

/**
 * Notify the recipient that a new (already-persisted) message exists.
 * @param {Server} io
 * @param {object} args
 * @param {string} args.toUserId    recipient
 * @param {object} args.message     the saved Message (plain object / toJSON)
 * @param {object} args.conversation the updated Conversation (for list refresh + unread)
 */
export function emitNewMessage(io, { toUserId, message, conversation }) {
  if (!io || !toUserId) return;
  io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.MESSAGE_NEW, {
    message,
    conversation,
  });
}

/**
 * Notify the OTHER participant that this conversation was read (clears their
 * "they haven't seen it" state / drives read receipts).
 */
export function emitConversationRead(io, { toUserId, conversationId, readerId }) {
  if (!io || !toUserId) return;
  io.to(userRoom(toUserId)).emit(SOCKET_EVENTS.CONVERSATION_READ, {
    conversationId,
    readerId,
  });
}