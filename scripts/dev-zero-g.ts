import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createZeroGProofApp } from '../server/services/zero-g/app.js';

const DEFAULT_PORT = 8790;
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

// 读取端口
function readPort(): number {
  const port = Number(process.env.PORT || process.env.MURMRAY_ZERO_G_PORT || DEFAULT_PORT);
  if (!Number.isFinite(port)) throw new Error('Invalid local 0G port.');
  return Math.trunc(port);
}

loadEnvFiles();

const port = readPort();
const app = createZeroGProofApp();

const server = serve(
  {
    fetch: app.fetch,
    hostname: HOST,
    port,
  },
  () => {
    console.log(`[murmray-0g] listening on http://${HOST}:${port}`);
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
