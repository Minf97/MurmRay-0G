// 扩展名称
export const EXTENSION_NAME = 'MURMRAY';

// 扩展描述
export const EXTENSION_DESCRIPTION = 'MurmRay opportunity radar for Polymarket signals.';

// 扩展图标
export const EXTENSION_ICONS = Object.freeze({
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  128: 'icon/128.png',
});

// 最低版本
export const MINIMUM_CHROME_VERSION = '114';

// 页面匹配
export const WEB_PAGE_MATCHES = Object.freeze([
  'http://*/*',
  'https://*/*',
]);

// 扩展权限
export const EXTENSION_PERMISSIONS = Object.freeze([
  'tabs',
  'scripting',
  'storage',
  'identity',
]);
