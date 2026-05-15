import { defineConfig } from 'wxt';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {
  EXTENSION_DESCRIPTION,
  EXTENSION_ICONS,
  EXTENSION_NAME,
  EXTENSION_PERMISSIONS,
  MINIMUM_CHROME_VERSION,
  WEB_PAGE_MATCHES,
} from './src/shared/manifest';

export default defineConfig({
  dev: {
    server: {
      host: '0.0.0.0',
      port: 3003,
      strictPort: true,
      origin: 'http://localhost:3003',
    },
  },
  webExt: {
    disabled: process.env.WXT_MANUAL === '1',
  },
  manifest: {
    default_locale: 'en',
    minimum_chrome_version: MINIMUM_CHROME_VERSION,
    name: EXTENSION_NAME,
    description: EXTENSION_DESCRIPTION,
    icons: EXTENSION_ICONS,
    permissions: [...EXTENSION_PERMISSIONS],
    host_permissions: [...WEB_PAGE_MATCHES],
    action: {
      default_title: EXTENSION_NAME,
      default_icon: EXTENSION_ICONS,
    },
  },
  vite: () => ({
    plugins: [react(), tailwindcss()],
  }),
});
