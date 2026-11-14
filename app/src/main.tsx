import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './app/App';
import { ThemeProvider } from './theme/ThemeContext';
import { Toaster, ToastProvider, ToastContainer } from './components/ui';
import './styles/index.css';

// R118-2 补丁: 旧标签页跨重建后懒加载旧 hash 分包 404(vite:preloadError)——自动整页重载一次
// 拉取新 index.html 即愈;sessionStorage 一次性守卫防重载循环。
window.addEventListener('vite:preloadError', () => {
  try {
    if (!sessionStorage.getItem('apksec-preload-reloaded')) {
      sessionStorage.setItem('apksec-preload-reloaded', '1');
      window.location.reload();
    }
  } catch { /* 隐私模式禁 sessionStorage 时静默,手动刷新可愈 */ }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      {/* R108-1: 新 Toast 系统全局单容器挂 Root(ThemeProvider 内层); 既有 Toaster(zustand 右下)原样并存 */}
      <ToastProvider>
        <HashRouter>
          <App />
          <Toaster />
        </HashRouter>
        <ToastContainer />
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);
