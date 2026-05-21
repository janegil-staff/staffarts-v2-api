// src/socket/auth.js
//
// Socket.io handshake authentication. Mirrors the REST `authenticate`
// middleware EXACTLY (same verifyAccessToken, same userId field) so a token
// that works for the API works for the socket and vice versa — no divergence.
//
// The client must send the access token in the handshake auth payload:
//   io(url, { auth: { token: accessToken } })
// We also accept the Authorization header as a fallback.

import { verifyAccessToken } from '../utils/tokens.js';

export default function socketAuth(socket, next) {
  try {
    const fromAuth = socket.handshake?.auth?.token;
    const header = socket.handshake?.headers?.authorization;
    const fromHeader = header?.startsWith('Bearer ')
      ? header.slice(7).trim()
      : null;

    const token = fromAuth || fromHeader;
    if (!token) {
      return next(new Error('unauthorized'));
    }

    const decoded = verifyAccessToken(token);
    if (!decoded?.userId) {
      return next(new Error('unauthorized'));
    }

    // Attach the same identity the REST layer uses.
    socket.userId = String(decoded.userId);
    next();
  } catch {
    // verifyAccessToken throws on invalid/expired tokens.
    next(new Error('unauthorized'));
  }
}