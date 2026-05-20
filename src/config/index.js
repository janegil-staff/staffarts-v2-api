// src/config/index.js
import "dotenv/config";

const required = (name) => {
  const v = process.env[name];
  if (!v && process.env.NODE_ENV !== "development") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v || "";
};

export const config = {
  port: Number(process.env.PORT) || 4100,
  env: process.env.NODE_ENV || "development",
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/staffarts2",
  jwtSecret: required("JWT_SECRET") || "dev-only-secret-change-me",
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};