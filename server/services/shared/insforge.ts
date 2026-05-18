import { createClient } from '@insforge/sdk';

export type ServerEnv = Record<string, string | undefined>;

// 读配置
function readInsforgeConfig(env: ServerEnv): { baseUrl: string; anonKey: string } {
  const baseUrl = env.INSFORGE_BASE_URL;
  const anonKey = env.ANON_KEY;

  if (!baseUrl) throw new Error('Missing INSFORGE_BASE_URL');
  if (!anonKey) throw new Error('Missing ANON_KEY');

  return { baseUrl, anonKey };
}

// 建客户端
export function createInsforgeClient<T>(env: ServerEnv): T {
  const { baseUrl, anonKey } = readInsforgeConfig(env);
  return createClient({
    baseUrl,
    anonKey,
    edgeFunctionToken: anonKey,
    autoRefreshToken: false,
  }) as unknown as T;
}
