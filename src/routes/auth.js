// src/routes/auth.js

import { Router } from 'express';
import {
  register,
  login,
  forgotPin,
  resetPin,
  refresh,
  me,
  logout,
  changeEmail,
  deleteAccount,
} from '../controllers/authController.js';
import {
  updateProfile,
  updateAvatar,
  signAvatarUpload,
} from '../controllers/profileController.js';
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
router.patch('/email', authenticate, asyncHandler(changeEmail));
router.delete('/account', authenticate, asyncHandler(deleteAccount));

// Profile management
router.patch('/profile', authenticate, asyncHandler(updateProfile));
router.patch('/avatar', authenticate, asyncHandler(updateAvatar));

export default router;