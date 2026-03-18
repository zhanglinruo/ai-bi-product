import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../config/database';
import { jwtConfig } from '../../config/index';
import jwt from 'jsonwebtoken';
import { logAudit } from '../../services/audit';

const router = Router();

// 登录失败锁定配置
const MAX_LOGIN_FAILURES = 5;
const LOCK_DURATION_MINUTES = 30;

router.post('/register', async (_req: Request, res: Response) => {
  try {
    const { username, password, email, role = 'user' } = _req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
    }
    
    // 只允许管理员创建管理员账号
    // if (role === 'admin') {
    //   return res.status(403).json({ success: false, message: '无权创建管理员账号' });
    // }

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
    
    // 记录审计日志
    await logAudit({
      action: 'user.register',
      resourceType: 'user',
      resourceId: id,
      details: { username, email, role },
    });

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
      // 记录失败尝试
      await logAudit({
        action: 'login.failed',
        details: { username, reason: 'user_not_found' },
        ipAddress: _req.ip,
      });
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const user = users[0];
    
    // 检查账号状态
    if (user.status === 'disabled') {
      await logAudit({
        userId: user.id,
        action: 'login.blocked',
        details: { reason: 'account_disabled' },
        ipAddress: _req.ip,
      });
      return res.status(401).json({ success: false, message: '账号已被禁用' });
    }
    
    // 检查是否被锁定
    if (user.status === 'locked' && user.locked_until) {
      const lockUntil = new Date(user.locked_until);
      if (lockUntil > new Date()) {
        await logAudit({
          userId: user.id,
          action: 'login.blocked',
          details: { reason: 'account_locked', lockedUntil: user.locked_until },
          ipAddress: _req.ip,
        });
        return res.status(401).json({ 
          success: false, 
          message: `账号已被锁定，请 ${Math.ceil((lockUntil.getTime() - Date.now()) / 60000)} 分钟后重试` 
        });
      } else {
        // 锁定已过期，重置状态
        await query('UPDATE users SET status = ?, login_failures = 0, locked_until = NULL WHERE id = ?', ['active', user.id]);
      }
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      // 增加失败计数
      const newFailures = (user.login_failures || 0) + 1;
      
      if (newFailures >= MAX_LOGIN_FAILURES) {
        // 锁定账号
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000);
        await query(
          'UPDATE users SET status = ?, login_failures = ?, locked_until = ? WHERE id = ?',
          ['locked', newFailures, lockUntil, user.id]
        );
        
        await logAudit({
          userId: user.id,
          action: 'account.locked',
          details: { failures: newFailures, lockedUntil: lockUntil },
          ipAddress: _req.ip,
        });
        
        return res.status(401).json({ 
          success: false, 
          message: `密码错误次数过多，账号已被锁定 ${LOCK_DURATION_MINUTES} 分钟` 
        });
      }
      
      await query('UPDATE users SET login_failures = ? WHERE id = ?', [newFailures, user.id]);
      
      await logAudit({
        userId: user.id,
        action: 'login.failed',
        details: { reason: 'wrong_password', attempts: newFailures },
        ipAddress: _req.ip,
      });
      
      return res.status(401).json({ 
        success: false, 
        message: `用户名或密码错误，还剩 ${MAX_LOGIN_FAILURES - newFailures} 次机会` 
      });
    }

    // 登录成功，重置失败计数
    await query('UPDATE users SET last_login_at = NOW(), login_failures = 0, status = ? WHERE id = ?', ['active', user.id]);
    
    // 记录成功登录
    await logAudit({
      userId: user.id,
      action: 'login.success',
      ipAddress: _req.ip,
      userAgent: _req.headers['user-agent'],
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expiresIn as any }
    );

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
