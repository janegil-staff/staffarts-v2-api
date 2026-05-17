import { Router } from 'express';
import {
  register,
  login,
  refresh,
  me,
  logout,
} from '../controllers/authController.js';
import authenticate from '../middleware/authenticate.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authenticate, me);
router.post('/logout', authenticate, logout);

export default router;