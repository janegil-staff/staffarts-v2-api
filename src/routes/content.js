// src/routes/content.js
//
// Stub routes for resources not yet built (exhibitions, tracks).
// Artworks and events now have real routers (routes/artworks.js,
// routes/events.js) and have been removed from here.
// Replace each remaining stub with a real model + controller as built.

import { Router } from 'express';

const router = Router();

const ok = (data = []) => ({ success: true, data });

// ── Exhibitions ────────────────────────────────────────────────────────
router.get('/exhibitions', (req, res) => res.json(ok([])));
router.get('/exhibitions/:id', (req, res) =>
  res.status(404).json({ success: false, error: 'Exhibition not found' }),
);

// ── Tracks ─────────────────────────────────────────────────────────────
router.get('/tracks', (req, res) => res.json({ success: true, tracks: [] }));

export default router;