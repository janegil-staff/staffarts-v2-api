// src/routes/auth.js
//
// Email + PIN auth routes with per-IP rate limiting on the abuse-prone
// endpoints (login + forgot/reset-pin). Per-account lockout lives in the
// controller for finer-grained control. All async handlers are wrapped
// in asyncHandler so thrown errors reach the global errorHandler middleware.

import { Router } from 'express';
import {
  register,
  login,
  forgotPin,
  resetPin,
  refresh,
  me,
  logout,
} from '../controllers/authController.js';
import authenticate from '../middleware/authenticate.js';
import {
  loginRateLimiter,
  pinResetRateLimiter,
} from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', loginRateLimiter, asyncHandler(login));
router.post('/forgot-pin', pinResetRateLimiter, asyncHandler(forgotPin));
router.post('/reset-pin', pinResetRateLimiter, asyncHandler(resetPin));
router.post('/refresh', asyncHandler(refresh));
router.get('/me', authenticate, asyncHandler(me));
router.post('/logout', asyncHandler(logout));

export default router;