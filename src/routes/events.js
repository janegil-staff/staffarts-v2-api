// src/routes/events.js
//
// Event CRUD + cover-image signing. Mounted at /api.
//
// Public:  GET  /api/events
//          GET  /api/events/:id
// Auth:    POST   /api/events
//          PATCH  /api/events/:id    (owner only — enforced in controller)
//          DELETE /api/events/:id    (owner only — enforced in controller)
//          POST   /api/uploads/event/sign

import { Router } from 'express';
import {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  signEventUpload,
} from '../controllers/eventController.js';
import authenticate from '../middleware/authenticate.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/events', asyncHandler(listEvents));
router.get('/events/:id', asyncHandler(getEvent));
router.post('/events', authenticate, asyncHandler(createEvent));
router.patch('/events/:id', authenticate, asyncHandler(updateEvent));
router.delete('/events/:id', authenticate, asyncHandler(deleteEvent));
router.post(
  '/uploads/event/sign',
  authenticate,
  asyncHandler(signEventUpload),
);

export default router;