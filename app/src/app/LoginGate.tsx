import React, { useState } from 'react';
import { useAuth } from '@/stores/auth';
import { Button, Field, Input, InlineAlert } from '@/components/ui';

/** Sign-in. Two columns from 1024 px: workspace statement on the canvas, form on the surface. One column below. */
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
    <div className="grid h-full overflow-auto bg-jz-canvas lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]" data-login>
      <div className="flex flex-col justify-between gap-8 px-jz-page py-8 lg:px-12 lg:py-12">
        <div className="flex items-center gap-3">
          <img src="/v2/brand/icon.svg" alt="" className="h-9 w-9 rounded-control" />
          <div className="leading-tight">
            <div className="font-display text-section font-semibold text-jz-ink">惊蛰</div>
            <div className="font-mono text-meta text-jz-muted">JINGZHE WORKSPACE</div>
          </div>
        </div>
        <div className="max-w-jz-prose space-y-3">
          <h1 className="font-display text-page font-semibold text-jz-ink max-[760px]:text-title">移动应用安全评估工作区</h1>
          <p className="text-body text-jz-ink-2">在一个工作区里管理评估项目、跟踪任务、核验发现并生成报告。</p>
        </div>
        <p className="hidden text-meta text-jz-muted lg:block">仅限授权范围内的评估使用。</p>
      </div>
      <div className="flex items-center border-t border-jz-border bg-jz-surface px-jz-page py-8 lg:border-l lg:border-t-0 lg:px-12">
        <form className="w-full space-y-4" onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }} noValidate>
          <h2 className="text-title font-semibold text-jz-ink">登录</h2>
          <Field label="用户名">
            {(ids) => <Input ids={ids} value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" autoFocus className="h-jz-control-lg" />}
          </Field>
          <Field label="密码">
            {(ids) => <Input ids={ids} value={p} onChange={(e) => setP(e.target.value)} type="password" autoComplete="current-password" className="h-jz-control-lg" />}
          </Field>
          {err && <InlineAlert tone="danger" title="无法登录" data-login-error>{err}</InlineAlert>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>{busy ? '正在登录' : '登录'}</Button>
          <p className="text-meta text-jz-muted">
            登录状态保存在此浏览器中，24 小时内有效。127.0.0.1 与 localhost 是不同的站点，需要分别登录。
          </p>
        </form>
      </div>
    </div>
  );
};
