// src/routes/content.js
//
// Stub routes for the resources Home / Explore / Shows expect. These return
// empty arrays for now so the mobile app renders without 404 spam. Replace
// each one with a real model + controller as those features get built.

import { Router } from 'express';

const router = Router();

// Helper: standard success envelope.
const ok = (data = []) => ({ success: true, data });

// ── Artworks ───────────────────────────────────────────────────────────
router.get('/artworks', (req, res) => res.json(ok([])));
router.get('/artworks/:id', (req, res) =>
  res.status(404).json({ success: false, error: 'Artwork not found' }),
);

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
router.get('/tracks', (req, res) =>
  res.json({ success: true, tracks: [] }),
);

export default router;