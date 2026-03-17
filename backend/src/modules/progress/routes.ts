import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

interface SSEClient {
  id: string;
  res: Response;
}

const clients: Map<string, SSEClient> = new Map();

router.get('/stream/:sessionId', (req: Request, res: Response) => {
  const sessionId = req.params.sessionId;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const clientId = uuidv4();
  clients.set(clientId, { id: clientId, res });
  
  console.log(`[SSE] 客户端连接: ${clientId}, sessionId: ${sessionId}`);
  
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, sessionId })}\n\n`);
  
  req.on('close', () => {
    clients.delete(clientId);
    console.log(`[SSE] 客户端断开: ${clientId}`);
  });
});

export function sendProgress(sessionId: string, data: any) {
  const message = JSON.stringify({ type: 'progress', ...data });
  
  clients.forEach((client, clientId) => {
    try {
      client.res.write(`data: ${message}\n\n`);
    } catch (e) {
      clients.delete(clientId);
    }
  });
}

export function sendComplete(sessionId: string, data: any) {
  const message = JSON.stringify({ type: 'complete', ...data });
  
  clients.forEach((client, clientId) => {
    try {
      client.res.write(`data: ${message}\n\n`);
      client.res.end();
    } catch (e) {
      clients.delete(clientId);
    }
  });
  
  setTimeout(() => {
    clients.forEach((client, clientId) => {
      if (Object.values(clients).length > 5) {
        clients.delete(clientId);
      }
    });
  }, 60000);
}

export function sendError(sessionId: string, error: string) {
  const message = JSON.stringify({ type: 'error', error });
  
  clients.forEach((client, clientId) => {
    try {
      client.res.write(`data: ${message}\n\n`);
      client.res.end();
    } catch (e) {
      clients.delete(clientId);
    }
  });
}

export default router;
