// src/routes/artworks.js
//
// Artwork CRUD + image-upload signing. Mounted at /api.
//
// Public:  GET  /api/artworks
//          GET  /api/artworks/:id
// Auth:    POST   /api/artworks
//          PATCH  /api/artworks/:id   (owner only — enforced in controller)
//          DELETE /api/artworks/:id   (owner only — enforced in controller)
//          POST   /api/uploads/artwork/sign

import { Router } from "express";
import {
  listArtworks,
  getArtwork,
  createArtwork,
  updateArtwork,
  deleteArtwork,
  signArtworkUpload,
} from "../controllers/artworkController.js";
import authenticate from "../middleware/authenticate.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/artworks", asyncHandler(listArtworks));
router.get("/artworks/:id", asyncHandler(getArtwork));

router.post("/artworks", authenticate, asyncHandler(createArtwork));
router.patch("/artworks/:id", authenticate, asyncHandler(updateArtwork));
router.delete("/artworks/:id", authenticate, asyncHandler(deleteArtwork));

router.post(
  "/uploads/artwork/sign",
  authenticate,
  asyncHandler(signArtworkUpload),
);

export default router;
