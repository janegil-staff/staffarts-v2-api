// src/services/jwt.service.js
import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

const SESSION_TTL = "30d";

export function signSession(user) {
  return jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: SESSION_TTL },
  );
}

export function verifySession(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}