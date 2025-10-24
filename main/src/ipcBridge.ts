import express, { Request, Response } from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';

interface BridgeOptions {
  port?: number;
  enableWs?: boolean;
}

// Access the global registry populated in index.ts
const getRegistry = (): Map<string, any> | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (global as any).ipcRegistry as Map<string, any> | undefined;
};

export function startIpcBridge(opts: BridgeOptions = {}) {
  const port = opts.port ?? 8765;
  const enableWs = opts.enableWs ?? true;

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // Health check
  app.get('/status', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // IPC proxy endpoint
  app.post('/ipc/:channel', async (req: Request, res: Response) => {
    const { channel } = req.params;
    const args: unknown[] = Array.isArray(req.body?.args) ? req.body.args : [];

    const registry = getRegistry();
    if (!registry || !registry.has(channel)) {
      return res.status(404).json({ error: `Unknown IPC channel: ${channel}` });
    }

    const handler = registry.get(channel);
    try {
      // Call the original handler with a minimal fake event
      const result = await handler({ fromBridge: true }, ...args);
      res.json({ result });
    } catch (err: any) {
      console.error(`[ipcBridge] Error while invoking ${channel}:`, err);
      res.status(500).json({ error: err?.message ?? 'Internal error' });
    }
  });

  const server = http.createServer(app);

  if (enableWs) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (socket) => {
      socket.on('message', async (raw) => {
        let msg: { channel: string; args?: unknown[] };
        try {
          msg = JSON.parse(raw.toString());
        } catch (_) {
          return socket.send(JSON.stringify({ error: 'Invalid JSON' }));
        }

        const { channel, args = [] } = msg;
        const registry = getRegistry();
        if (!registry || !registry.has(channel)) {
          return socket.send(
            JSON.stringify({ channel, error: `Unknown IPC channel: ${channel}` })
          );
        }
        const handler = registry.get(channel);
        try {
          const result = await handler({ fromBridge: true }, ...(args as unknown[]));
          socket.send(JSON.stringify({ channel, result }));
        } catch (err: any) {
          socket.send(
            JSON.stringify({ channel, error: err?.message ?? 'Internal error' })
          );
        }
      });
    });
  }

  server.listen(port, () => {
    console.log(`[ipcBridge] Listening on port ${port} (ws: ${enableWs})`);
  });

  return { server };
}

