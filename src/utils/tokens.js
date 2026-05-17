import jwt from 'jsonwebtoken';

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || '30d';

function getSecret(kind) {
  const key = kind === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
  const secret = process.env[key];
  if (!secret) throw new Error(`${key} not set in environment`);
  return secret;
}

export function signAccessToken(payload) {
  return jwt.sign(payload, getSecret('access'), { expiresIn: ACCESS_TTL });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, getSecret('refresh'), { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getSecret('access'));
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, getSecret('refresh'));
}