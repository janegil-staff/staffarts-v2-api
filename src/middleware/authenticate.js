import { verifyAccessToken } from '../utils/tokens.js';
import { AppError } from './errorHandler.js';

const authenticate = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('Missing authorization header', 401);
  }

  const token = header.slice(7).trim();
  if (!token) {
    throw new AppError('Missing token', 401);
  }

  // verifyAccessToken throws JsonWebTokenError or TokenExpiredError on failure;
  // the global errorHandler converts those to 401 responses.
  const decoded = verifyAccessToken(token);

  if (!decoded.userId) {
    throw new AppError('Invalid token payload', 401);
  }

  req.userId = decoded.userId;
  next();
};

export default authenticate;