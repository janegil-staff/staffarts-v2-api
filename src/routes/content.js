// src/routes/content.js
//
// Stub routes for resources not yet built (events, exhibitions, tracks).
// Artworks now have a real router (routes/artworks.js) — removed from here.
// Replace each remaining stub with a real model + controller as built.

import { Router } from 'express';

const router = Router();

const ok = (data = []) => ({ success: true, data });

// ── Events ─────────────────────────────────────────────────────────────
router.get('/events', (req, res) => res.json(ok([])));
router.get('/events/:id', (req, res) =>
  res.status(404).json({ success: false, error: 'Event not found' }),
);

// ── Exhibitions ────────────────────────────────────────────────────────
router.get('/exhibitions', (req, res) => res.json(ok([])));
router.get('/exhibitions/:id', (req, res) =>
  res.status(404).json({ success: false, error: 'Exhibition not found' }),
);

// ── Tracks ─────────────────────────────────────────────────────────────
router.get('/tracks', (req, res) => res.json({ success: true, tracks: [] }));

export default router;