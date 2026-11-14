import React, { useState } from 'react';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui';

export const LoginGate: React.FC = () => {
  const login = useAuth((s) => s.login);
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr('');
    try { await login(u, p); } catch (e: any) { setErr(e.message || '登录失败'); }
    setBusy(false);
  };
  return (
    <div className="h-full grid place-items-center relative overflow-hidden">
      {/* 品牌氛围光: 中央 accent 径向弥散(与 v3-card-ai 氛围光同语言,纯装饰 aria-hidden) */}
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(640px 420px at 50% 38%, rgb(var(--jz-brand) / 0.07), transparent 70%)' }} />
      <div className="relative w-96 space-y-5 rounded-dialog bg-jz-surface p-8 shadow-card">
        {/* 惊蛰品牌锁定: 主图标(惊雷劈壳+虫眼) + 中英文名,资产走 /v2/brand 显式挂载路径 */}
        <div className="flex items-center gap-3">
          <img src="/v2/brand/icon.svg" alt="惊蛰" className="w-11 h-11 rounded-panel" />
          <div className="leading-tight">
            <div className="font-display text-section font-semibold text-jz-ink">
              惊蛰 <span className="font-mono text-meta font-medium text-jz-muted align-middle">JINGZHE</span>
            </div>
            <div className="text-meta text-jz-muted mt-0.5">APK 自动化 AI 安全测试平台</div>
          </div>
        </div>
        <input value={u} onChange={(e) => setU(e.target.value)} placeholder="用户名"
          className="w-full px-3 py-2 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink focus:ring-2 focus:ring-jz-brand/40 outline-none" />
        <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="密码"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full px-3 py-2 rounded-control bg-jz-surface-2/60 text-meta text-jz-ink focus:ring-2 focus:ring-jz-brand/40 outline-none" />
        {err && <div className="text-meta text-jz-sev-critical">{err}</div>}
        <Button className="w-full justify-center" disabled={busy} onClick={submit}>{busy ? '登录中…' : '登录'}</Button>
        <div className="text-meta leading-relaxed text-jz-muted">
          登录态存于浏览器 localStorage(有效期 24h),刷新页面自动经 /api/me 校验免登;
          127.0.0.1 与 localhost 属不同源,各需分别登录。
        </div>
      </div>
    </div>
  );
};
