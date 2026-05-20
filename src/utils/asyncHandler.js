// src/utils/asyncHandler.js
//
// Wraps async route handlers so thrown errors hit Express's error middleware
// instead of becoming unhandled promise rejections that crash the process.
//
// Use it in your route definitions:
//   router.post('/register', asyncHandler(register));

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);