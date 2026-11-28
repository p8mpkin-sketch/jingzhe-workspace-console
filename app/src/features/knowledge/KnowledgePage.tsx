// KnowledgePage.tsx — /knowledge: header with the readout row, ?tab=library|review (review for admins only), and
// the page-level actions (rescan, import, local entries, distill, export) in one menu.
// First load sends what 777f03e sent: GET /api/skills, GET /api/kb/candidates (admins), GET /api/tasks?limit=200.
// A non-admin opening ?tab=review lands on the library, the parameter is removed, and no candidate read is sent.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, Download, FilePlus2, FlaskConical, FolderInput, RefreshCw, Upload } from 'lucide-react';
import { api } from '@/services/api';
import { useAuth } from '@/stores/auth';
import { ActionMenu, Button, Dialog, Field, Input, Page, PageHeader, Readout, Select, Tabs, Textarea, UniversalImportModal, exportDataFile, toast, ConfirmDialog } from '@/components/ui';
import type { ReadoutCell, UniversalImportResult } from '@/components/ui';
import { moduleLabel } from '@/layout/navigation';
import { READ_WORD, hasValue } from '@/features/dashboard/readout';
import type { ReadState } from '@/features/dashboard/readout';
import { isLocal, kindOf, readLocal, writeLocal } from './knowledgeModel';
import type { SkillRow, SortKey } from './knowledgeModel';
import { useKnowledgeReads } from './useKnowledgeReads';
import { LibraryTab } from './LibraryTab';
import { ReviewTab } from './ReviewTab';

type Tab = 'library' | 'review';
const word = (st: ReadState) => (st === 'value' || st === 'stale' ? '' : READ_WORD[st]);

export const KnowledgePage: React.FC = () => {
  const { me, ready } = useAuth();
  const isAdmin = me?.role === 'admin' || me?.role === 'super_admin';
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'review' && isAdmin ? 'review' : 'library';
  // Unknown values, and review for a non-admin, fall back to the library and leave the URL.
  useEffect(() => {
    if (raw == null || !ready) return;
    if (raw === 'library' || (raw === 'review' && isAdmin)) return;
    const next = new URLSearchParams(params); next.delete('tab'); setParams(next, { replace: true });
  }, [raw, ready, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTab = (t: Tab) => { const next = new URLSearchParams(params); if (t === 'library') next.delete('tab'); else next.set('tab', t); setParams(next, { replace: true }); };

  const { skills, cands, tasks, reloadAll } = useKnowledgeReads(isAdmin);
  const [local, setLocal] = useState<SkillRow[]>(readLocal);
  const persistLocal = (list: SkillRow[]) => { setLocal(list); writeLocal(list); };

  const [q, setQ] = useState('');
  const [cat, setCat] = useState('全部');
  const [sort, setSort] = useState<SortKey>('default');
  const [shown, setShown] = useState<SkillRow[]>([]);
  const onShown = useCallback((r: SkillRow[]) => setShown(r), []);
  const [help, setHelp] = useState(false);

  // Readout: counted from the rows that were read; unread reads say so.
  const backend = skills.value || [];
  const all = useMemo(() => [...backend, ...local], [backend, local]);
  const skillsRead = hasValue(skills);
  const pending = hasValue(cands) ? cands.value.filter((c) => c.status === 'pending').length : null;
  const cells: ReadoutCell[] = [
    { label: '条目', value: skillsRead ? all.length : word(skills.state), text: !skillsRead, dataAttrs: { 'data-read': skills.state, 'data-knowledge-total': '' }, title: '/api/skills 列表加本地条目' },
    { label: '蒸馏草案', value: skillsRead ? all.filter((s) => kindOf(s).label === '蒸馏').length : word(skills.state), text: !skillsRead, dataAttrs: { 'data-read': skills.state }, title: 'status=draft 或 source_path 以 task: 开头' },
    { label: '本地条目', value: local.length, dataAttrs: { 'data-read': 'value' }, title: '只保存在这个浏览器里,不写入后端' },
    { label: '实战记录', value: skillsRead ? backend.reduce((n, s) => n + (s.uses || 0), 0) : word(skills.state), text: !skillsRead, dataAttrs: { 'data-read': skills.state }, title: '任务结束时回写的结果记录总数' },
    ...(isAdmin ? [{ label: '待审候选', value: pending != null ? pending : word(cands.state), text: pending == null, dataAttrs: { 'data-read': cands.state, 'data-knowledge-pending': '' } } as ReadoutCell] : []),
  ];

  // Status change and delete (requests unchanged).
  const setStatus = async (s: SkillRow, status: 'active' | 'disabled') => {
    try {
      await api(`/api/skills/${s.id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      toast.ok(status === 'active' ? `「${s.name}」${s.status === 'draft' ? '草案已转正' : '已启用'},AI 可以自动选用` : `「${s.name}」已停用,保留在册,AI 不再选用`);
      skills.reload();
    } catch (e: any) { toast.err('状态变更失败: ' + e.message); }
  };
  const [delFor, setDelFor] = useState<SkillRow | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const doDelete = async (s: SkillRow) => {
    if (isLocal(s)) { persistLocal(local.filter((x) => x.id !== s.id)); toast.ok(`已删除本地条目「${s.name}」`); return; }
    try { await api(`/api/skills/${s.id}`, { method: 'DELETE' }); toast.ok(`已删除「${s.name}」`); skills.reload(); }
    catch (e: any) { toast.err('删除失败: ' + e.message); }
  };

  // Rescan, import by path / URL, distill, local entries and pack import.
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const rescan = async () => {
    setScanning(true); setScanMsg('');
    try { const d = await api<any>('/api/skills/scan', { method: 'POST' }); setScanMsg(`扫描完成:新收编 ${d.added} · 跳过已存在 ${d.skipped} · 总计 ${d.total}(重复执行结果不变)`); skills.reload(); }
    catch (e: any) { setScanMsg('扫描失败: ' + e.message); }
    setScanning(false);
  };
  const [impOpen, setImpOpen] = useState(false);
  const [impPath, setImpPath] = useState('');
  const [impUrl, setImpUrl] = useState('');
  const [impBusy, setImpBusy] = useState(false);
  const doImport = async () => {
    if (!impPath && !impUrl) { toast.err('路径与 URL 至少填一项'); return; }
    setImpBusy(true);
    try {
      const d = await api<any>('/api/skills/import', { method: 'POST', body: JSON.stringify(impPath ? { path: impPath } : { url: impUrl }) });
      toast.ok(`导入完成: 新增 ${d.added} · 跳过已存在 ${d.skipped}${(d.errors || []).length ? ' · 错误 ' + d.errors.length : ''}`);
      setImpOpen(false); setImpPath(''); setImpUrl(''); skills.reload();
    } catch (e: any) { toast.err('导入失败: ' + e.message); }
    setImpBusy(false);
  };
  const [distOpen, setDistOpen] = useState(false);
  const [distTid, setDistTid] = useState<number | null>(null);
  const [distBusy, setDistBusy] = useState(false);
  const doDistill = async () => {
    if (!distTid) { toast.info('先选择要提炼的任务'); return; }
    setDistBusy(true);
    try { const d = await api<any>('/api/skills/distill', { method: 'POST', body: JSON.stringify({ task_id: distTid }) }); toast.ok(d.added ? `草案已生成: ${d.name}` : `草案已存在(重复操作已跳过): ${d.name}`); setDistOpen(false); skills.reload(); }
    catch (e: any) { toast.err('蒸馏失败: ' + e.message); }
    setDistBusy(false);
  };
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', scene: '自定义(本地)' });
  const addLocal = () => {
    const name = form.name.trim(); if (!name) return;
    if ([...local, ...backend].some((s) => s.name === name)) { toast.err('同名条目已存在(本地或库内)'); return; }
    persistLocal([...local, { id: 100000 + Date.now() % 100000, name, scene: form.scene || '自定义(本地)', source_path: 'local:自定义(本地视图层,不参与 AI 自动选技)', description: form.description, status: 'active', last_verified_at: Math.floor(Date.now() / 1000) } as SkillRow]);
    setForm({ name: '', description: '', scene: '自定义(本地)' }); setNewOpen(false);
    toast.ok('本地条目已保存(只在这个浏览器里,后端没有自建条目的接口)');
  };
  const [packOpen, setPackOpen] = useState(false);
  const onPack = (imported: Array<Partial<SkillRow>>) => {
    const list = [...local]; const have = new Set([...list, ...backend].map((s) => s.name)); let added = 0;
    for (const r of imported) {
      const name = String(r.name || '').trim(); if (!name || have.has(name)) continue;
      list.push({ id: 100000 + Date.now() % 100000 + added, name, scene: String(r.scene || '导入技能包(本地)'), source_path: 'local:导入技能包(本地视图层)', description: String(r.description || ''), status: 'active', last_verified_at: Math.floor(Date.now() / 1000) } as SkillRow);
      have.add(name); added++;
    }
    persistLocal(list); setPackOpen(false); toast.ok(`技能包导入完成: 新增 ${added} 条(本地,不写后端)`);
  };
  const exportRows = (fmt: 'json' | 'csv') => exportDataFile('skills_list', fmt, shown.map((s) => ({
    name: s.name, scene: s.scene || '', description: s.description || '', status: s.status || '', source_path: s.source_path,
    uses: s.uses ?? 0, wins: s.wins ?? 0, last_verified_at: s.last_verified_at ?? '', layer: isLocal(s) ? '本地' : '后端库',
  })), { title: '知识库清单(当前过滤视图)' });

  const taskList = tasks.value;
  return (
    <Page data-knowledge-page data-skills-page>
      <PageHeader title={moduleLabel('/knowledge')}
        description="评估中沉淀的可复用知识。AI 会自动选用、挂载并记录结果;手动操作只用于补挂历史任务和从成功任务提炼。"
        actions={<>
          <Button variant="ghost" icon={help ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />} aria-expanded={help} onClick={() => setHelp((v) => !v)} data-knowledge-help-toggle>说明</Button>
          <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden />} onClick={reloadAll} data-knowledge-refresh>刷新</Button>
          <ActionMenu label="更多" menuLabel="知识库操作" triggerAttrs={{ 'data-knowledge-more': '' }} items={[
            { key: 'scan', label: scanning ? '扫描中…' : '重新扫描', icon: <RefreshCw size={14} aria-hidden />, disabled: scanning, onSelect: rescan, attrs: { 'data-skills-rescan': '' } },
            { key: 'pack', label: '导入技能包(本地)', icon: <Upload size={14} aria-hidden />, onSelect: () => setPackOpen(true), attrs: { 'data-skills-pack-import': '' } },
            { key: 'import', label: '从路径或 URL 导入', icon: <FolderInput size={14} aria-hidden />, onSelect: () => setImpOpen(true), attrs: { 'data-skills-import-btn': '' } },
            { key: 'new', label: '新建本地条目', icon: <FilePlus2 size={14} aria-hidden />, onSelect: () => setNewOpen(true), attrs: { 'data-skill-new': '' } },
            { key: 'distill', label: '从任务提炼', icon: <FlaskConical size={14} aria-hidden />, onSelect: () => setDistOpen(true), attrs: { 'data-distill-open': '' } },
            { key: 'json', label: '导出清单 JSON', icon: <Download size={14} aria-hidden />, disabled: !shown.length, onSelect: () => exportRows('json'), attrs: { 'data-skills-export': 'json' } },
            { key: 'csv', label: '导出清单 CSV', icon: <Download size={14} aria-hidden />, disabled: !shown.length, onSelect: () => exportRows('csv'), attrs: { 'data-skills-export': 'csv' } },
          ]} />
        </>} />
      {help && (
        <div className="rounded-card border border-jz-border bg-jz-surface px-4 py-3 text-label text-jz-ink-2" data-knowledge-help>
          <p>新任务由 AI 编排自动选用和挂载知识条目,任务结束时回写结果。这里的手动操作只用于:给历史任务补挂或覆盖 AI 的选择(在条目详情的“挂载到任务”),从成功任务提炼新草案(“更多 › 从任务提炼”),以及收编和导入条目。</p>
          <p className="mt-1 text-jz-muted">本地条目和导入的技能包只保存在这个浏览器里,不参与 AI 自动选用。</p>
        </div>
      )}
      {scanMsg && <p role="status" className="text-label text-jz-ink-2" data-scan-msg>{scanMsg}</p>}
      <div data-readout-row><Readout label="知识库读数" cells={cells} /></div>

      <Tabs<Tab> label="知识库工作区" value={tab} onChange={setTab}
        items={[
          { key: 'library', label: '技能库', count: skillsRead ? all.length : null, dataAttrs: { 'data-skills-primary-tab': 'library', 'data-knowledge-tab': 'library' } },
          ...(isAdmin ? [{ key: 'review' as const, label: hasValue(cands) ? '候选审核' : `候选审核 · ${word(cands.state) || '读取中'}`, count: pending, dataAttrs: { 'data-skills-primary-tab': 'review', 'data-knowledge-tab': 'review' } }] : []),
        ]} />

      {tab === 'library' && (
        <LibraryTab read={skills} local={local} isAdmin={isAdmin} tasks={hasValue(tasks) ? taskList : null}
          q={q} onQ={setQ} cat={cat} onCat={setCat} sort={sort} onSort={setSort}
          onScan={rescan} scanning={scanning} onImport={() => setPackOpen(true)}
          onStatus={setStatus} onDelete={setDelFor} onShown={onShown} />
      )}
      {tab === 'review' && <ReviewTab read={cands} />}

      <UniversalImportModal open={packOpen} title="导入技能包(本地)"
        hint="json 数组或 {skills|items|rows:[...]} / csv 表格;行字段: name(必填)/description/scene"
        onClose={() => setPackOpen(false)}
        validateRow={(row) => (String(row.name || row['名称'] || '').trim() ? '' : '缺 name(名称)字段')}
        onImportSuccess={(r: UniversalImportResult) => onPack(r.rows)} />
      <Dialog open={impOpen} onClose={() => setImpOpen(false)} title="从路径或 URL 导入" description="二选一:后端读取目录(含 SKILL.md)或 .zip,或下载在线的 SKILL.md 文本。" dataAttrs={{ 'data-import-panel': '' }}
        footer={<><Button variant="secondary" onClick={() => setImpOpen(false)}>取消</Button><Button variant="primary" loading={impBusy} onClick={doImport} data-import-submit>导入</Button></>}>
        <Field label="本地路径">{(f) => (<Input id={f.id} value={impPath} onChange={(e) => setImpPath(e.target.value)} placeholder="目录含 SKILL.md,或 .zip 文件" />)}</Field>
        <Field label="在线 URL">{(f) => (<Input id={f.id} value={impUrl} onChange={(e) => setImpUrl(e.target.value)} placeholder="http(s) 指向 SKILL.md 文本" />)}</Field>
      </Dialog>
      <Dialog open={distOpen} onClose={() => setDistOpen(false)} title="从任务提炼" description="选择一个已完成的评估任务,由模型生成一条蒸馏草案;草案复核后可以转正。" dataAttrs={{ 'data-distill-panel': '' }}
        footer={<><Button variant="secondary" onClick={() => setDistOpen(false)}>取消</Button><Button variant="primary" loading={distBusy} disabled={!distTid} onClick={doDistill} data-distill-btn>提炼</Button></>}>
        <Field label="任务">{(f) => (<Select id={f.id} value={distTid ?? ''} onChange={(e) => setDistTid(Number(e.target.value) || null)} data-distill-task-select>
            <option value="">{hasValue(tasks) ? (taskList?.length ? '选择已完成的任务…' : '没有已完成的评估任务') : `任务列表${word(tasks.state)}`}</option>
            {(taskList || []).map((t) => <option key={t.id} value={t.id}>#{t.id} {t.app_name || t.package || '评估'}</option>)}
          </Select>)}</Field>
      </Dialog>
      <Dialog open={newOpen} onClose={() => setNewOpen(false)} title="新建本地条目" description="只保存在这个浏览器里,不参与 AI 自动选用。" dataAttrs={{ 'data-skill-new-form': '' }}
        footer={<><Button variant="secondary" onClick={() => setNewOpen(false)}>取消</Button><Button variant="primary" disabled={!form.name.trim()} onClick={addLocal} data-skill-new-submit>保存</Button></>}>
        <Field label="名称(必填,唯一)">{(f) => (<Input id={f.id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-skill-new-name />)}</Field>
        <Field label="场景标签">{(f) => (<Input id={f.id} value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })} data-skill-new-scene />)}</Field>
        <Field label="说明(可选)">{(f) => (<Textarea id={f.id} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-skill-new-desc />)}</Field>
      </Dialog>
      <ConfirmDialog open={!!delFor} busy={delBusy} confirmLabel="删除"
        title={delFor ? `删除「${delFor.name}」?` : ''}
        outcome={!delFor ? null : isLocal(delFor) ? '只移除这个浏览器里的这条本地记录,不影响后端。'
          : kindOf(delFor).label === '内置' ? `这是内置条目(${kindOf(delFor).tab})。删除后 AI 不会再选用它,实战记录和挂载关系一并清除,无法恢复。只想暂停使用请改为“停用”。`
            : '实战记录和挂载关系会一并清除,无法恢复。只想暂停使用请改为“停用”。'}
        onCancel={() => setDelFor(null)}
        onConfirm={async () => { if (!delFor) return; setDelBusy(true); try { await doDelete(delFor); } finally { setDelBusy(false); setDelFor(null); } }} />
    </Page>
  );
};

export default KnowledgePage;
