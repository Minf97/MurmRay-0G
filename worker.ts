import { createBackendApp } from './server/app.js';
import { installFetchXMLHttpRequest } from './server/runtime/fetch-xhr.js';

export interface CloudflareEnv {
  [key: string]: string | undefined;
}

installFetchXMLHttpRequest();

// 处理请求
export default {
  fetch(request: Request, env: CloudflareEnv): Response | Promise<Response> {
    return createBackendApp({ env }).fetch(request);
  },
};
