// src/routes/users.js
//
// Public user profile + image upload signing endpoints. Mounted at /api.

import { Router } from 'express';
import {
  getPublicProfile,
  signAvatarUpload,
} from '../controllers/profileController.js';
import authenticate from '../middleware/authenticate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// GET /api/users/:id — public profile
router.get('/users/:id', asyncHandler(getPublicProfile));

// POST /api/uploads/avatar/sign — auth required, returns Cloudinary signature
router.post(
  '/uploads/avatar/sign',
  authenticate,
  asyncHandler(signAvatarUpload),
);

export default router;