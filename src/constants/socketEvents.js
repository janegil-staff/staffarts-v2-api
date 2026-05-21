// src/constants/socketEvents.js
//
// Single source of truth for socket event names. The server emits/listens
// using these constants, and the client imports the SAME strings (copy this
// file into the app, or publish it). This prevents the camelCase-vs-snake_case
// drift that silently breaks real-time delivery — the #1 cause of "messages
// don't arrive" and phantom badge bugs.
//
// Rule: every event name is snake_case. No exceptions.

export const SOCKET_EVENTS = Object.freeze({
  // ── Server → client ───────────────────────────────────────────────────
  // A new message was persisted; delivered to the recipient's user room.
  MESSAGE_NEW: 'message_new',
  // A conversation was marked read by the other party (clears their unread,
  // lets the sender show read receipts).
  CONVERSATION_READ: 'conversation_read',
  // Relayed typing indicator.
  USER_TYPING: 'user_typing',

  // ── Client → server ───────────────────────────────────────────────────
  // Client signals it is (or stopped) typing in a conversation.
  TYPING_START: 'typing_start',
  TYPING_STOP: 'typing_stop',

  // ── Connection lifecycle (Socket.io built-ins, named here for clarity) ─
  CONNECT: 'connection',
  DISCONNECT: 'disconnect',
});

export default SOCKET_EVENTS;