import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database';
import { jwtConfig } from '../../config/index';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/register', async (_req: Request, res: Response) => {
  try {
    const { username, password, email, role = 'user' } = _req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    const existingUsers = await query<any[]>('SELECT id FROM users WHERE username = ?', [username]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await query(
      'INSERT INTO users (id, username, password_hash, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [id, username, passwordHash, email || null, role, 'active']
    );

    res.status(201).json({ success: true, message: '用户注册成功', data: { id, username, role } });
  } catch (error: any) {
    console.error('注册错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/login', async (_req: Request, res: Response) => {
  try {
    const { username, password } = _req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }

    const users = await query<any[]>('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const user = users[0];
    if (user.status === 'disabled') {
      return res.status(401).json({ success: false, message: '账号已被禁用' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expiresIn as any }
    );

    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error: any) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/profile', async (_req: Request, res: Response) => {
  try {
    const token = _req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: '未授权' });
    }

    const decoded: any = jwt.verify(token, jwtConfig.secret);
    const users = await query<any[]>('SELECT id, username, email, role, status, created_at FROM users WHERE id = ?', [decoded.id]);
    
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error: any) {
    console.error('获取用户信息错误:', error);
    res.status(401).json({ success: false, message: 'Token无效' });
  }
});

export default router;
