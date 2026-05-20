// src/utils/socialVerify.js
//
// Server-side verification of social-provider tokens. Never trust the client.
//
// Google: verifies the ID token's signature against Google's public keys,
//   validates audience (client ID) and issuer.
//
// Apple: fetches Apple's published JWKs, verifies the identity token's
//   signature, then validates issuer (https://appleid.apple.com) and
//   audience (your iOS bundle id).

import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// ── Google ──────────────────────────────────────────────────────────────

// Accept multiple Google client IDs (iOS, Android, Web, Expo proxy). All are
// issued under the same Google Cloud project, so any can produce a token;
// we validate against the union.
const GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_EXPO_CLIENT_ID,
].filter(Boolean);

const googleClient = new OAuth2Client();

/**
 * Verifies a Google ID token.
 * @param {string} idToken - id_token from expo-auth-session Google provider
 * @returns {Promise<{ sub: string, email: string, emailVerified: boolean, name: string, picture: string|null }>}
 * @throws if the token is invalid, expired, or from a wrong audience.
 */
export async function verifyGoogleIdToken(idToken) {
  if (GOOGLE_CLIENT_IDS.length === 0) {
    throw new Error(
      'No Google client IDs configured. Set GOOGLE_*_CLIENT_ID env vars.',
    );
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_IDS,
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('Google token payload empty');

  // Defense in depth: explicit issuer check (verifyIdToken already does this
  // internally, but we keep it visible).
  if (
    payload.iss !== 'accounts.google.com' &&
    payload.iss !== 'https://accounts.google.com'
  ) {
    throw new Error(`Unexpected Google iss: ${payload.iss}`);
  }

  if (!payload.email) {
    throw new Error('Google token missing email');
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase().trim(),
    emailVerified: Boolean(payload.email_verified),
    name: payload.name || payload.given_name || '',
    picture: payload.picture || null,
  };
}

// ── Apple ───────────────────────────────────────────────────────────────

const APPLE_ISS = 'https://appleid.apple.com';

// Audience = the client identifier Apple used to issue the token. For native
// iOS Sign in with Apple, that's the app's bundle ID. (For web/Android via
// Services ID, it would be the Services ID string instead.)
const APPLE_AUDIENCES = [
  process.env.APPLE_BUNDLE_ID,
  process.env.APPLE_SERVICES_ID,
].filter(Boolean);

const appleJwks = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000, // 24h
  rateLimit: true,
});

function getAppleSigningKey(header, cb) {
  appleJwks.getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err);
    cb(null, key.getPublicKey());
  });
}

/**
 * Verifies an Apple identity token.
 * @param {string} identityToken - JWT from expo-apple-authentication
 * @returns {Promise<{ sub: string, email: string|null, emailVerified: boolean }>}
 * @throws if the token is invalid, expired, or from a wrong audience.
 *
 * Note: Apple only includes the user's email in the first sign-in. Subsequent
 * sign-ins from the same user return a token with no email claim. That's why
 * the client also sends the `fullName`/`email` it received once, which we
 * store on the User document the first time.
 */
export async function verifyAppleIdentityToken(identityToken) {
  if (APPLE_AUDIENCES.length === 0) {
    throw new Error(
      'No Apple audience configured. Set APPLE_BUNDLE_ID (and/or APPLE_SERVICES_ID).',
    );
  }

  const decoded = await new Promise((resolve, reject) => {
    jwt.verify(
      identityToken,
      getAppleSigningKey,
      {
        algorithms: ['RS256'],
        issuer: APPLE_ISS,
        audience: APPLE_AUDIENCES,
      },
      (err, payload) => {
        if (err) return reject(err);
        resolve(payload);
      },
    );
  });

  return {
    sub: decoded.sub,
    email:
      typeof decoded.email === 'string'
        ? decoded.email.toLowerCase().trim()
        : null,
    emailVerified:
      decoded.email_verified === true || decoded.email_verified === 'true',
  };
}