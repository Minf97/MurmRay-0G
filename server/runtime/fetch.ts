// 绑定 fetch
export function readRuntimeFetch(): typeof fetch {
  return globalThis.fetch.bind(globalThis) as typeof fetch;
}
