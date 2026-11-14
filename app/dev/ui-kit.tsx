// Dev-only gallery of the shared primitives (served by `vite dev` at /v2/dev/ui-kit.html).
// It is not an app route and is not part of the production build (the build input is index.html only).
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Download, FolderPlus, MoreHorizontal, Play, RefreshCw, Trash2, Upload } from 'lucide-react';
import '../src/styles/index.css';
import {
  AsyncBoundary, Badge, BulkBar, Button, Checkbox, ConfirmDialog, DataTable, Dialog, Drawer, EmptyState, ErrorState, Field, IconButton,
  InlineAlert, Input, MenuItem, Metric, MetricGrid, ObjectCard, Page, PageHeader, Pagination, Panel, PermissionState, Popover, Radio,
  SearchField, Section, SegmentedControl, Select, SkeletonLoader, StaleNotice, StatusBadge, Tabs, Tag, Textarea, Tooltip, type Column,
} from '../src/components/ui';

type Row = { id: number; app: string; pkg: string; version: string; brand: string; status: string; findings: number };
const ROWS: Row[] = [
  { id: 1, app: 'Compass', pkg: 'com.example.compass', version: '1.0.0.077', brand: 'Alpha', status: 'done', findings: 3 },
  { id: 2, app: 'Wallet', pkg: 'com.example.wallet', version: '1.0.18', brand: 'Beta', status: 'running', findings: 0 },
  { id: 3, app: 'Launcher with a deliberately long display name', pkg: 'com.example.launcher.with.a.long.package.name', version: '14.0.2.099', brand: 'Gamma', status: 'failed', findings: 12 },
  { id: 4, app: 'Notes', pkg: 'com.example.notes', version: '2.1.0', brand: 'Alpha', status: 'queued', findings: 0 },
];

function Kit() {
  const params = new URLSearchParams(location.search);
  const [dark, setDark] = useState(params.get('theme') === 'dark');
  React.useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  const [tab, setTab] = useState<'overview' | 'reports' | 'apps'>('overview');
  const [seg, setSeg] = useState<'cards' | 'table'>('cards');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string | number>>(new Set(params.get('selected') ? [1, 3] : []));
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(12);
  const [dlg, setDlg] = useState(params.get('open') === 'dialog');
  const [confirm, setConfirm] = useState(params.get('open') === 'confirm');
  const [drawer, setDrawer] = useState(params.get('open') === 'drawer');
  const cols: Column<Row>[] = [
    { key: 'app', header: '应用', card: 'title', cell: (r) => r.app },
    { key: 'pkg', header: '包名', mono: true, cell: (r) => r.pkg },
    { key: 'version', header: '版本', cell: (r) => r.version },
    { key: 'brand', header: '品牌', cell: (r) => <Tag>{r.brand}</Tag> },
    { key: 'findings', header: '发现项', align: 'right', cell: (r) => r.findings },
    { key: 'status', header: '状态', cell: (r) => <StatusBadge status={r.status} /> },
    { key: 'act', header: <span className="sr-only">操作</span>, label: '操作', align: 'right', card: 'action', cell: () => <Button size="sm" variant="secondary">查看</Button> },
  ];
  return (
    <div className="flex h-full flex-col">
      <Page>
        <PageHeader eyebrow="开发用 / 基础组件" title="基础组件总览" description="页面只通过这些组件组合界面。颜色、字号、圆角、阴影全部来自 design/tokens.css。"
          meta={<><span>jz 2.0</span><span>·</span><span>仅开发环境可见</span></>}
          actions={<>
            <Button variant="secondary" onClick={() => setDark((v) => !v)} data-kit-theme>{dark ? '浅色' : '深色'}</Button>
            <Button variant="secondary" icon={<Upload size={16} aria-hidden />}>导入</Button>
            <Button icon={<Play size={16} aria-hidden />}>运行全部</Button>
          </>} />

        <Tabs label="示例标签页" value={tab} onChange={setTab} items={[{ key: 'overview', label: '概览' }, { key: 'reports', label: '报告', count: 32 }, { key: 'apps', label: '应用', count: 63 }]} />

        <MetricGrid>
          <Metric label="应用" value="63" hint="项目清单" />
          <Metric label="已完成" value="60" hint="95% 覆盖" tone="success" />
          <Metric label="待核验" value="83" hint="候选发现" tone="attention" />
          <Metric label="失败" value="2" hint="可重新运行" tone="danger" />
        </MetricGrid>

        <Section title="按钮" description="每个区域只有一个主操作。">
          <Panel>
            <div className="flex flex-wrap items-center gap-3">
              <Button>主操作</Button><Button variant="secondary">次要</Button><Button variant="ghost">幽灵</Button><Button variant="danger">删除</Button>
              <Button variant="danger-solid">确认删除</Button><Button loading>处理中</Button><Button disabled>不可用</Button>
              <Button size="lg">40 px</Button><Button size="sm" variant="secondary">紧凑</Button>
              <IconButton label="刷新"><RefreshCw size={16} aria-hidden /></IconButton>
              <IconButton label="下载" variant="secondary"><Download size={16} aria-hidden /></IconButton>
              <Tooltip content="上次更新 3 分钟前"><Button variant="ghost">带提示</Button></Tooltip>
              <Popover label="更多操作" role="menu" trigger={(p) => <IconButton label="更多操作" variant="secondary" {...p}><MoreHorizontal size={16} aria-hidden /></IconButton>}>
                {(close) => <><MenuItem onClick={close} icon={<Download size={16} aria-hidden />}>导出 DOCX</MenuItem><MenuItem onClick={close} icon={<Download size={16} aria-hidden />}>导出 PDF</MenuItem><MenuItem danger onClick={close} icon={<Trash2 size={16} aria-hidden />}>删除</MenuItem></>}
              </Popover>
            </div>
          </Panel>
        </Section>

        <Section title="表单" description="标签在上,说明或错误在下。">
          <Panel>
            <div className="grid grid-cols-1 gap-4 table:grid-cols-2 desktop:grid-cols-3">
              <Field label="项目名称" required hint="用于列表与报告封面。">{(ids) => <Input ids={ids} placeholder="例如 2026 年度应用评估" />}</Field>
              <Field label="模板">{(ids) => <Select ids={ids} defaultValue="technical"><option value="technical">技术证据版</option><option value="executive">管理层摘要</option></Select>}</Field>
              <Field label="来源地址" error="地址格式不正确。">{(ids) => <Input ids={ids} defaultValue="htp:/example" />}</Field>
              <Field label="备注" className="table:col-span-2">{(ids) => <Textarea ids={ids} placeholder="可选" />}</Field>
              <div className="flex flex-col gap-2">
                <Checkbox label="生成文字说明" hint="由模型撰写,需人工复核。" defaultChecked />
                <Radio name="depth" label="标准深度" defaultChecked /><Radio name="depth" label="完整深度" />
              </div>
            </div>
          </Panel>
        </Section>

        <Section title="状态与标签" description="状态同时使用颜色与文字,取自统一状态字典。">
          <Panel>
            <div className="flex flex-wrap items-center gap-2">
              {['done', 'running', 'queued', 'failed', 'waiting_login', 'needs_verification', 'imported', 'draft', 'unknown_value'].map((s) => <StatusBadge key={s} status={s} />)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge level="critical" /><Badge level="high" /><Badge level="medium" /><Badge level="low" /><Badge level="info" /><Badge level="safe" />
              <Tag>network</Tag><Tag mono>com.example.compass</Tag>
            </div>
          </Panel>
        </Section>

        <Section title="数据表格" description="900 px 以下转为记录卡片;分页与批量条共用。" data-kit-table
          actions={<><SearchField label="搜索应用 / 包名" value={q} onValueChange={setQ} className="w-64 max-[760px]:w-full" />
            <SegmentedControl label="视图" value={seg} onChange={setSeg} items={[{ key: 'cards', label: '卡片' }, { key: 'table', label: '表格' }]} /></>}>
          <Panel flush>
            <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary">重新运行</Button><Button size="sm" variant="danger" onClick={() => setConfirm(true)}>删除</Button>
            </BulkBar>
            <DataTable label="应用清单" columns={cols} rows={ROWS.filter((r) => !q || (r.app + r.pkg).toLowerCase().includes(q.toLowerCase()))} rowKey={(r) => r.id}
              selected={sel} onToggle={(k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })}
              onToggleAll={(keys, all) => setSel(all ? new Set() : new Set(keys))}
              footer={<Pagination page={page} pageSize={size} total={63} onPage={setPage} onPageSize={setSize} />} />
          </Panel>
        </Section>

        <Section title="对象卡片" description="1280 px 以上三列,900–1279 两列,以下单列。">
          <div className="grid grid-cols-1 gap-4 table:grid-cols-2 desktop:grid-cols-3">
            {['Example Holdings 2026 应用评估', 'Wallet 专项', 'Launcher 回归'].map((n, i) => (
              <ObjectCard key={n} title={n} subtitle={<>负责人 demo · {[63, 1, 4][i]} 个应用</>} badge={<StatusBadge status={['running', 'done', 'closed'][i]} />}
                footer={<><span className="text-meta text-jz-muted">更新于 11-14 14:27</span><Button size="sm" variant="secondary">打开</Button></>}>
                <div className="flex flex-wrap gap-1.5"><Tag>{['公司级', '单应用', '单应用'][i]}</Tag><Tag>Alpha</Tag></div>
              </ObjectCard>
            ))}
          </div>
        </Section>

        <Section title="页面状态" description="每个数据区域都定义加载、空、错误、过期、无权限。">
          <div className="grid grid-cols-1 gap-4 table:grid-cols-2 desktop:grid-cols-3">
            <Panel title="加载中" flush><AsyncBoundary loading skeleton="table">x</AsyncBoundary></Panel>
            <Panel title="空" flush><EmptyState icon={FolderPlus} title="还没有项目" cause="创建项目后,应用、报告与运行记录会出现在这里。" action={<Button>新建项目</Button>} shortcut={<a className="text-jz-brand underline" href="#import">导入项目包</a>} /></Panel>
            <Panel title="错误" flush><ErrorState message="请求超时(60000ms 无应答)" onRetry={() => {}} /></Panel>
            <Panel title="无权限" flush><PermissionState /></Panel>
            <Panel title="数据过期"><StaleNotice since="14:27:05" onRefresh={() => {}} /><p className="mt-3 text-body text-jz-ink-2">过期时内容保持可见,上方给出时间与刷新入口。</p></Panel>
            <Panel title="提示">
              <div className="space-y-2">
                <InlineAlert tone="info" title="公开来源无法保证完整覆盖">未收录的应用需要人工补充。</InlineAlert>
                <InlineAlert tone="success">已入队 12 个任务。</InlineAlert>
                <InlineAlert tone="danger" title="3 个文件导入失败">格式不受支持。</InlineAlert>
              </div>
            </Panel>
          </div>
          <SkeletonLoader variant="metrics" />
        </Section>

        <Section title="弹层">
          <Panel>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setDlg(true)} data-kit-open-dialog>打开对话框</Button>
              <Button variant="secondary" onClick={() => setDrawer(true)} data-kit-open-drawer>打开抽屉</Button>
              <Button variant="danger" onClick={() => setConfirm(true)} data-kit-open-confirm>删除(需确认)</Button>
            </div>
          </Panel>
        </Section>
      </Page>

      <Dialog open={dlg} onClose={() => setDlg(false)} title="生成项目报告" description="生成后可在报告历史中下载。"
        footer={<><Button variant="secondary" onClick={() => setDlg(false)}>取消</Button><Button onClick={() => setDlg(false)}>生成</Button></>}>
        <Field label="模板">{(ids) => <Select ids={ids}><option>技术证据版</option><option>管理层摘要</option></Select>}</Field>
        <Checkbox label="生成文字说明" />
      </Dialog>
      <ConfirmDialog open={confirm} title="删除 2 个任务?" outcome="删除后无法恢复;已生成的报告不受影响。" confirmLabel="删除" onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)}>
        将删除所选任务及其运行记录。
      </ConfirmDialog>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="任务 #101 · Wallet" footer={<Button variant="secondary" onClick={() => setDrawer(false)}>关闭</Button>}>
        <StatusBadge status="running" />
        <p className="text-body text-jz-ink-2">日志与产物在此展示。抽屉在 760 px 以下占满宽度。</p>
      </Drawer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Kit /></React.StrictMode>);
