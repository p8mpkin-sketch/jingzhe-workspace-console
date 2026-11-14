import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { execSync } from 'node:child_process';

// 版本号唯一真源=git tag:构建时注入 __APP_VERSION__,打新 tag 后 rebuild 即自动更新,
// 杜绝 Sidebar 版本角标再漂移(v2.4 Pro 写死漂移事故的根治)
function appVersionFromTag(): string {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev'; // 非 git 环境(如容器拷贝构建)降级,不阻塞构建
  }
}

// R36 前端重构 v2: base=/v2/ 由 FastAPI 挂载;dev 期 /api 反代到 8099 老后端
export default defineConfig({
  base: '/v2/',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersionFromTag()) },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8099', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist', sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          echarts: ['echarts'],
          dockview: ['dockview'],
          // R106-5: index 应用块已贴 700kB 阈值(R106-4 基线 696.94),任何功能增量即触发
          // 体积警告——将剩余重量级三方库拆独立 vendor 块(纯缓存拓扑优化,零运行时语义变化,
          // 零新依赖;警告以真实分块消除,非抬阈值)
          vendor: ['@xyflow/react', 'lucide-react', '@tanstack/react-virtual',
                   'react-markdown', 'remark-gfm', 'zustand'],
        },
      },
    },
  },
});
