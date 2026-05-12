import { buildPageContext, clipText, extractTwitterStatusId } from '../shared/analysis';

// 规整文本
function normalizePageText(text: unknown) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 推文正文
function readTwitterStatusText(statusId: string | null) {
  if (!statusId) return '';

  const statusLink = document.querySelector(`a[href*="/status/${statusId}"]`);
  const statusArticle = statusLink?.closest('article') as HTMLElement | null;
  if (statusArticle?.innerText) return normalizePageText(statusArticle.innerText);

  const fallbackArticle = document.querySelector("article[data-testid='tweet']") as HTMLElement | null;
  return normalizePageText(fallbackArticle?.innerText || '');
}

// 提取页面
export function readPageContext() {
  const statusId = extractTwitterStatusId(location.href);
  const root = document.querySelector('article, main, [role=main]') as HTMLElement | null;
  const bodyText = root?.innerText || document.body?.innerText || document.body?.textContent || '';

  return buildPageContext({
    title: document.title,
    url: location.href,
    pageText: clipText(readTwitterStatusText(statusId) || normalizePageText(bodyText), 12_000),
    selectedText: clipText(window.getSelection()?.toString() || '', 2_000),
    cacheKeyHint: statusId ? `twitter-status:${statusId}` : '',
  });
}
