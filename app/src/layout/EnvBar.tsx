import React, { useEffect, useRef, useState } from 'react';
import { AppWindow, MoreHorizontal, Network, ShieldAlert, ShieldCheck, Syringe } from 'lucide-react';
import { usePentest } from '@/stores/pentest';

/** R52 P0-3: 会话环境感知条 —— 包名/加固/设备/frida/桥端口/阶段角色,全部接真。
 *  仅会话工作台模式显示;数据源: sessions/{sid} + tasks/{tid} + burp/status + autopilot/status。
 *  R105-2: 外壳语义并入会话工作台复合顶栏(组件、门控与四路数据源不变)。
 *  R106-2(指令2)顶栏 HUD 遥测化: 文本胶囊 → 26px 图标遥测胶囊组——fetch/字段映射/roleMap 逐字节
 *  保留(语义色映射不改数据链,方案红线),仅显示层重排: 目标应用(图标+包名 mono,悬浮全称+点击复制)
 *  /设备节点(绿呼吸点+serial)/脱壳防护(盾牌+无壳灰·有壳橙)/Frida(注入图标+翡翠绿)/Oracle 桥
 *  (网桥图标+未启灰·启动青);视口不足时次要胶囊(阶段角色/Oracle)自动收进「···」Popover,
 *  关键包名+设备任何分辨率可见(响应式收纳,禁横向滚动条——overflow-hidden+测量收纳,不滚动)。
 *  R107-1(指令1①): 顶栏减负去重——新增 hide prop(显示层过滤,app/device 与全局 TopBar
 *  面包屑/胶囊重复时由工作台顶栏传入收掉);fetch/字段映射/roleMap 四路数据源逐字节不动(R105-2 契约)。 */

// 加固壳显示层映射(R106-1 NewProjectWizard 同款;原始真值随 title 透出,未知值原样显)
const PACKER_LABELS: Record<string, string> = { '360_jiagu': '360加固', ijiami: '爱加密', bangcle: '梆梆加固' };

export const EnvBar: React.FC<{ hide?: string[] }> = ({ hide = [] }) => {
 const sid = usePentest((s) => s.sid);
 const workbench = usePentest((s) => s.workbench);
  const token = useAuthSafe();
  const [env, setEnv] = useState<null | {
 pkg: string; packer: string; device: string; frida: boolean; bridge: string; role: string;
 }>(null);

 useEffect(() => {
 if (!workbench || !sid || !token) { setEnv(null); return; }
 let alive = true;
 (async () => {
 const H = { Authorization: `Bearer ${token}` };
 const [sess, burp, ap] = await Promise.all([
 fetch(`/api/pentest/sessions/${sid}`, { headers: H }).then((r) => r.json()).catch(() => null),
 fetch(`/api/pentest/sessions/${sid}/burp/status`, { headers: H }).then((r) => r.json()).catch(() => null),
 fetch(`/api/pentest/sessions/${sid}/autopilot/status`, { headers: H }).then((r) => r.json()).catch(() => null),
 ]);
 let packer = '';
 const tid = sess?.task_id;
 if (tid) {
 const t = await fetch(`/api/tasks/${tid}`, { headers: H }).then((r) => r.json()).catch(() => null);
 packer = t?.task?.packer || '';
 }
 const phase = (ap?.steps || []).filter((s: any) => s.state).slice(-1)[0];
      const roleMap: Record<string, string> = {
 P0: '降噪分层', P1: '侦察员', P2: '矩阵手', P3: '登录态渗透', P4: '专项审计员', P5: '报告员',
 };
 const curPhase = phase?.phase || '';
 if (alive) {
 setEnv({
 pkg: sess?.package || '—',
 packer: packer || '无壳/未检出',
 device: sess?.device || '未绑定',
 frida: Boolean(ap && ap.state),
 bridge: burp?.oracle ? `oracle:${burp.oracle}` : '桥未启',
 role: curPhase ? `${roleMap[curPhase] || curPhase}` : (ap?.state || '—'),
 });
 }
 })();
 const t = setInterval(() => { alive && setEnv((e) => (e ? { ...e } : e)); }, 15000);
 return () => { alive = false; clearInterval(t); };
  }, [workbench, sid, token]);

  // R106-2③ 响应式收纳: 测量 HUD 区可用宽 vs 胶囊自然宽(隐形量尺,不随收纳态变化)——
  // 0=全显;1=次要胶囊(Oracle/阶段角色)收进 ···;2=极窄再收脱壳/Frida(包名+设备始终可见)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const measAllRef = useRef<HTMLDivElement | null>(null);
  const measKeyRef = useRef<HTMLDivElement | null>(null);
  const [fold, setFold] = useState<0 | 1 | 2>(0);
 useEffect(() => {
 const root = rootRef.current;
 if (!root || !env || !measAllRef.current || !measKeyRef.current) return;
 const measure = () => {
 const zone = root.clientWidth;
 const full = measAllRef.current!.offsetWidth;
 const key4 = measKeyRef.current!.offsetWidth;
 const MORE = 36; // ··· 钮 w-7 + gap
 if (zone >= full) setFold(0);
 else if (zone >= key4 + MORE) setFold(1);
 else setFold(2);
 };
 measure();
 const ro = new ResizeObserver(measure);
 ro.observe(root);
 return () => ro.disconnect();
  }, [env]);

  // 「···」Popover: fixed 定位锚定按钮(逃出 HUD 区 overflow-hidden,方案红线①与③兼容)
  const [popOpen, setPopOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement | null>(null);
 const [popPos, setPopPos] = useState({ top: 0, left: 0 });
 useEffect(() => { if (fold === 0) setPopOpen(false); }, [fold]);
 const togglePop = () => {
 const r = moreRef.current?.getBoundingClientRect();
 if (r) setPopPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 260)) });
 setPopOpen((v) => !v);
 };
 useEffect(() => {
 if (!popOpen) return;
 const onDoc = (e: MouseEvent) => {
 const t = e.target as HTMLElement | null;
 if (!t?.closest?.('[data-env-pop],[data-env-more]')) setPopOpen(false);
 };
 const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopOpen(false); };
 document.addEventListener('mousedown', onDoc);
 document.addEventListener('keydown', onKey);
 return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
 }, [popOpen]);

 // 目标应用: 点击复制包名(悬浮 title=全称;成功闪烁「已复制」)
 const [copied, setCopied] = useState(false);
 const copyPkg = async () => {
 if (!env || !env.pkg || env.pkg === '—') return;
 let ok = false;
 try { await navigator.clipboard.writeText(env.pkg); ok = true; }
 catch {
 try {
 const ta = document.createElement('textarea');
 ta.value = env.pkg; document.body.appendChild(ta); ta.select();
 ok = document.execCommand('copy'); ta.remove();
 } catch { ok = false; }
 }
 if (ok) { setCopied(true); window.setTimeout(() => setCopied(false), 1400); }
 };

 if (!workbench || !sid || !env) return null;

 const isBare = !env.packer || env.packer === '无壳/未检出' || env.packer === '—' || env.packer === 'none';
 const packerLabel = isBare ? '无壳' : (PACKER_LABELS[env.packer] || env.packer);
 const deviceBound = Boolean(env.device) && env.device !== '未绑定';
 const bridgeOn = env.bridge.startsWith('oracle:');

 // 遥测胶囊(26px,铁律②胶囊化 rounded-pill,语义色仅显示层)
 const pill = (id: string, opts: {
 icon?: React.ReactNode; text: React.ReactNode; title: string; tone: 'neutral' | 'gray' | 'orange' | 'emerald' | 'cyan';
 onClick?: () => void; extra?: React.ReactNode; maxW?: string; measAttr?: string;
 }) => {
    const toneCls: Record<string, string> = {
      neutral: 'border-jz-border bg-jz-surface-2/40 text-jz-ink-2',
      gray: 'border-jz-border bg-jz-surface-2/40 text-jz-muted',
      orange: 'border-jz-sev-medium/40 bg-jz-sev-medium/10 text-jz-sev-medium',
      emerald: 'border-jz-teal/40 bg-jz-teal/10 text-jz-teal',
      cyan: 'border-jz-brand/40 bg-jz-brand/10 text-jz-brand',
    };
    return (
      <span key={id} {...(opts.measAttr ? { [opts.measAttr]: id } : { 'data-env-pill': id })}
 title={opts.title} onClick={opts.onClick}
 className={`flex-none h-[26px] px-1.5 rounded-pill border text-meta flex items-center gap-1 whitespace-nowrap ${toneCls[opts.tone]} ${opts.onClick ? 'cursor-pointer hover:border-jz-brand transition-colors' : ''} ${opts.maxW || ''}`}>
        {opts.icon}
        <span className={id === 'app' || id === 'device' ? 'font-mono truncate' : 'truncate'}>{opts.text}</span>
        {opts.extra}
      </span>
 );
 };

 const appPill = (measAttr?: string) => pill('app', {
    measAttr, tone: 'neutral', maxW: 'max-w-[220px]', onClick: copyPkg,
    title: `目标应用: ${env.pkg}(点击复制包名)`,
    icon: <AppWindow className="w-3.5 h-3.5 flex-none text-jz-brand" />,
    text: env.pkg,
    extra: copied ? <span data-env-copied className="flex-none text-jz-teal">已复制</span> : undefined,
 });
 const devicePill = (measAttr?: string) => pill('device', {
    measAttr, tone: 'neutral', maxW: 'max-w-[190px]',
    title: `设备节点: ${env.device}(会话绑定)`,
    icon: <span className={`w-1.5 h-1.5 rounded-pill flex-none ${deviceBound ? 'bg-jz-teal' : 'bg-jz-muted'}`} />,
 text: env.device,
 });
 const packerPill = (measAttr?: string) => pill('packer', {
    measAttr, tone: isBare ? 'gray' : 'orange',
    title: isBare ? `脱壳防护: 无壳/未检出(原始值: ${env.packer || '—'})` : `脱壳防护: ${packerLabel}(原始值: ${env.packer})`,
    icon: isBare ? <ShieldCheck className="w-3.5 h-3.5 flex-none" /> : <ShieldAlert className="w-3.5 h-3.5 flex-none" />,
 text: packerLabel,
 });
 const fridaPill = (measAttr?: string) => pill('frida', {
    measAttr, tone: env.frida ? 'emerald' : 'gray', title: `Frida: ${env.frida ? '已注入' : '未驻留'}`,
    icon: <Syringe className="w-3.5 h-3.5 flex-none" />,
 text: env.frida ? '已注入' : '未驻留',
 });
 const bridgePill = (measAttr?: string) => pill('bridge', {
    measAttr, tone: bridgeOn ? 'cyan' : 'gray', title: `Oracle 桥: ${env.bridge}`,
    icon: <Network className="w-3.5 h-3.5 flex-none" />, text: env.bridge,
 });
 const rolePill = (measAttr?: string) => pill('role', {
    measAttr, tone: 'neutral', maxW: 'max-w-[140px]', title: `阶段角色: ${env.role}`, text: env.role,
  });

  return (
    <div data-env-bar ref={rootRef} className="relative w-full flex items-center gap-1 min-w-0 overflow-hidden">
      {/* 可见胶囊组(收纳态按 fold 裁剪;app/device 任何分辨率可见;R107-1 hide=工作台顶栏去重传入) */}
      {!hide.includes('app') && appPill()}
      {!hide.includes('device') && devicePill()}
      {!hide.includes('packer') && (fold < 2) && packerPill()}
      {!hide.includes('frida') && (fold < 2) && fridaPill()}
      {!hide.includes('bridge') && (fold < 1) && bridgePill()}
      {!hide.includes('role') && (fold < 1) && rolePill()}
 {fold > 0 && (
        <button data-env-more ref={moreRef} onClick={togglePop} title={`更多遥测(收纳 ${fold === 1 ? 'Oracle 桥/阶段角色' : '脱壳防护/Frida/Oracle 桥/阶段角色'})`}
 className="flex-none w-7 h-[26px] rounded-pill border border-jz-border text-jz-muted grid place-items-center hover:text-jz-ink hover:bg-jz-surface-2/40 transition-colors">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
 )}
 {/* 收纳 Popover(fixed 定位;内容=被收纳胶囊全量真值,零编造) */}
 {popOpen && fold > 0 && (
        <div data-env-pop style={{ position: 'fixed', top: popPos.top, left: popPos.left }}
 className="z-50 flex flex-col items-start gap-1 p-2 rounded-control border border-jz-border bg-jz-surface-2 shadow-card">
          <div className="text-meta font-semibold text-jz-ink px-0.5">收纳的次要遥测</div>
 {!hide.includes('packer') && fold >= 2 && packerPill()}
 {!hide.includes('frida') && fold >= 2 && fridaPill()}
          {!hide.includes('bridge') && bridgePill()}
          {!hide.includes('role') && rolePill()}
        </div>
      )}
      {/* 隐形量尺(absolute 不占布局,全量/关键四级两套自然宽) */}
      <div ref={measAllRef} aria-hidden className="invisible absolute left-0 top-0 flex items-center gap-1 pointer-events-none whitespace-nowrap">
        {!hide.includes('app') && appPill('data-env-m-pill')}{!hide.includes('device') && devicePill('data-env-m-pill')}{!hide.includes('packer') && packerPill('data-env-m-pill')}{!hide.includes('frida') && fridaPill('data-env-m-pill')}{!hide.includes('bridge') && bridgePill('data-env-m-pill')}{!hide.includes('role') && rolePill('data-env-m-pill')}
      </div>
      <div ref={measKeyRef} aria-hidden className="invisible absolute left-0 top-0 flex items-center gap-1 pointer-events-none whitespace-nowrap">
        {!hide.includes('app') && appPill('data-env-m-pill')}{!hide.includes('device') && devicePill('data-env-m-pill')}{!hide.includes('packer') && packerPill('data-env-m-pill')}{!hide.includes('frida') && fridaPill('data-env-m-pill')}
      </div>
    </div>
  );
};

function useAuthSafe(): string | null {
  try {
    const t = localStorage.getItem('token');
    return t || null;
  } catch { return null; }
}
