type RuntimeApi = {
  sendMessage(message: unknown): Promise<any>;
  onMessage?: {
    addListener(listener: (message: unknown, sender: unknown, sendResponse: (value?: unknown) => void) => boolean): void;
  };
};

type RuntimeSource = {
  runtime?: RuntimeApi | null;
};

type ChromeGlobal = {
  chrome?: {
    runtime?: RuntimeApi | null;
  };
};

// 校验运行时
function hasRuntimeApi(value: unknown): value is RuntimeApi {
  const runtime = value as RuntimeApi | null | undefined;
  return typeof runtime?.sendMessage === 'function';
}

// 读取运行时
export function getContentRuntime(source: RuntimeSource): RuntimeApi {
  if (hasRuntimeApi(source.runtime)) return source.runtime;

  const chromeRuntime = (globalThis as ChromeGlobal).chrome?.runtime;
  if (hasRuntimeApi(chromeRuntime)) return chromeRuntime;

  throw new Error('Extension runtime unavailable.');
}

// 发送消息
export function sendContentRuntimeMessage(source: RuntimeSource, message: unknown) {
  return getContentRuntime(source).sendMessage(message);
}
