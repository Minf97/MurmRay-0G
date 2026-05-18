import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createBackendApp } from './app.js';

const DEFAULT_PORT = 8789;
const HOST = '127.0.0.1';

// 读取环境
function loadEnvFiles(): void {
  for (const relativePath of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), relativePath);
    if (!existsSync(filePath)) continue;

    const content = readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) continue;

      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, '');

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadEnvFiles();

const port = Number(process.env.MURMRAY_BACKEND_PORT || DEFAULT_PORT);
const app = createBackendApp();

const server = serve(
  {
    fetch: app.fetch,
    port,
    hostname: HOST,
  },
  (info) => {
    console.log(`[murmray-backend] listening on http://${HOST}:${info.port}`);
  },
);

// 平滑退出
function shutdown(): void {
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
