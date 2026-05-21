// src/server.js
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from './config/index.js';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import artworkRoutes from './routes/artworks.js';
import eventRoutes from './routes/events.js';
import contentRoutes from './routes/content.js';
import messagesRoutes from './routes/messages.js';
import errorHandler from './middleware/errorHandler.js';
import { initSocket } from './socket/index.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.length === 0) return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS not allowed for origin: ' + origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// ── Routes ────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'staffarts2-api',
    env: config.env,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api', usersRoutes); // /users/:id, /uploads/avatar/sign
app.use('/api', artworkRoutes); // /artworks, /uploads/artwork/sign
app.use('/api', eventRoutes); // /events, /uploads/event/sign  (real — must precede content stubs)
app.use('/api', messagesRoutes); // /conversations, /messages  (real — precede content stubs)
app.use('/api', contentRoutes); // exhibitions, tracks (stubs)

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// Global error handler
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────

// Create the HTTP server explicitly so Socket.io can share it with Express.
// (We no longer call app.listen() — the http server owns the port.)
const httpServer = http.createServer(app);

// Attach Socket.io and make `io` available to route handlers via app.get('io').
const io = initSocket(httpServer, { corsOrigins: config.corsOrigins });
app.set('io', io);

async function start() {
  try {
    await connectDB();
  } catch (e) {
    if (config.env !== 'development') throw e;
    console.warn('[startup] DB not reachable, continuing in dev mode.');
  }

  httpServer.listen(config.port, () => {
    console.log(
      `[staffarts2-api] listening on http://localhost:${config.port}`,
    );
    console.log(
      `[staffarts2-api] try: curl http://localhost:${config.port}/health`,
    );
  });
}

start();