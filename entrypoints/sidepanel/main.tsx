import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { App } from './App';

// 挂载应用
function bootstrapSidepanel() {
  const root = document.getElementById('app');
  if (!root) {
    throw new Error('Missing sidepanel root element.');
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

bootstrapSidepanel();
