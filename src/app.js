import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import errorHandler from './middleware/errorHandler.js';
import authRouter from './routes/auth.js';

const app = express();

// ─── Security & logging ──────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN.split(','),
    credentials: true,
  })
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Rate limiting ───────────────────────────────────────────────────────────

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    skip: (req) => req.path.startsWith('/api/auth/refresh'),
    message: { success: false, error: 'Too many requests, please try again later' },
  })
);

// ─── Body parsing ────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health check ────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Staff Arts v2 API is running 🎨',
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// ─── Routes  ────────────────────────────────────────
app.use('/api/auth', authRouter);


// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Error handler (must be last) ────────────────────────────────────────────

app.use(errorHandler);

export default app;