/**
 * Custom application error. Throw this from controllers/middleware to
 * return a structured response with a specific HTTP status code.
 *
 * Example:
 *   throw new AppError('User not found', 404);
 */
export class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

/**
 * Global error handler. Must be the LAST middleware registered in app.js.
 * Express recognises error handlers by their 4-argument signature.
 */
const errorHandler = (err, req, res, next) => {
  // Mongoose validation error — bad field values
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: messages.join(', '),
    });
  }

  // Mongoose duplicate key error — unique index violated
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: `${field} already exists`,
    });
  }

  // Mongoose invalid ObjectId in a query
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format',
    });
  }

  // JWT errors — token invalid or expired
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
    });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token expired',
    });
  }

  // Our own AppError instances
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // Unknown / unexpected error — log it server-side, send a generic message
  console.error('Unexpected error:', err);
  return res.status(500).json({
    success: false,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
};

export default errorHandler;