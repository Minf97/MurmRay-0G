import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  EXTENSION_DESCRIPTION,
  EXTENSION_NAME,
  EXTENSION_PERMISSIONS,
  MINIMUM_CHROME_VERSION,
  WEB_PAGE_MATCHES,
} from './src/shared/manifest';

export default defineConfig({
  dev: {
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      origin: 'http://localhost:3000',
    },
  },
  manifest: {
    default_locale: 'en',
    minimum_chrome_version: MINIMUM_CHROME_VERSION,
    name: EXTENSION_NAME,
    description: EXTENSION_DESCRIPTION,
    permissions: [...EXTENSION_PERMISSIONS],
    host_permissions: [...WEB_PAGE_MATCHES],
    action: {
      default_title: EXTENSION_NAME,
    },
  },
  vite: () => ({
    plugins: [react(), tailwindcss()],
  }),
});
