import { browser } from 'wxt/browser';

export default defineBackground(() => {
  console.log(browser.i18n.getMessage('helloWorld'));
});
