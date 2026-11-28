// DevicesTab.tsx — 设备: the device list from the shell's 8 s poll (usePentest.devices, no request of its own) and
// the execution nodes (GET /api/nodes, read when this tab opens; the same endpoint as the overview, admins only).
// A failed node read leaves the device list as it is.
import React from 'react';
import { Server, Smartphone } from 'lucide-react';
import { DataTable, EmptyState, Panel, StatusBadge, StatusText } from '@/components/ui';
import type { Column } from '@/components/ui';
import { usePentest } from '@/stores/pentest';
import { hasValue } from '@/features/dashboard/readout';
import type { Read } from '@/features/dashboard/readout';
import { ReadBlock, StaleLine } from './sysShared';

type Node = { node_id: string; online?: boolean; devices?: string[]; last_seen?: number };
const ago = (ts?: number) => {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  return s < 60 ? `${s} 秒前` : s < 3600 ? `${Math.floor(s / 60)} 分钟前` : s < 86400 ? `${Math.floor(s / 3600)} 小时前` : `${Math.floor(s / 86400)} 天前`;
};

export const DevicesTab: React.FC<{ nodes: Read<Node[]> }> = ({ nodes }) => {
  const devices = usePentest((s) => s.devices) as any[];
  const devCols: Column<any>[] = [
    { key: 'model', header: '设备', card: 'title', cell: (d) => <span className="font-medium text-jz-ink">{d.model || d.serial}</span> },
    { key: 'serial', header: '序列号', mono: true, cell: (d) => d.serial },
    { key: 'android', header: 'Android', mono: true, cell: (d) => d.android || '—' },
    { key: 'root', header: 'Root', cell: (d) => <StatusBadge tone={d.root ? 'attention' : 'neutral'}>{d.root ? '已 Root' : '未 Root'}</StatusBadge> },
    { key: 'frida', header: 'Frida', cell: (d) => <StatusText kind={d.frida ? 'done' : 'neutral'}>{d.frida ? '就绪' : '未安装'}</StatusText> },
  ];
  const nodeCols: Column<Node>[] = [
    { key: 'id', header: '节点', card: 'title', mono: true, cell: (n) => n.node_id },
    { key: 'online', header: '状态', cell: (n) => <StatusText kind={n.online ? 'done' : 'blocked'}>{n.online ? '在线' : '离线'}</StatusText> },
    { key: 'devices', header: '设备数', align: 'right', mono: true, cell: (n) => (Array.isArray(n.devices) ? n.devices.length : '—') },
    { key: 'seen', header: '上次心跳', mono: true, cell: (n) => ago(n.last_seen) },
  ];
  const list = hasValue(nodes) ? nodes.value : [];
  return (
    <div className="space-y-6" data-system-devices>
      <Panel flush title="设备" description="外壳每 8 秒读取一次的设备列表;打开这个标签不另发请求。" data-devices-list
        actions={devices.length > 0 ? <span className="font-mono text-meta tnum text-jz-muted">{devices.length} 台 · Frida 就绪 {devices.filter((d) => d.frida).length}</span> : undefined}>
        <DataTable<any> label="设备" columns={devCols} rows={devices} rowKey={(d) => d.serial} stickyHeader={false}
          rowDataAttrs={(d) => ({ 'data-device-row': d.serial })}
          state={devices.length === 0 ? <div data-devices-empty><EmptyState compact icon={Smartphone} title="没有已连接的设备" cause="用 adb 连接设备或启动模拟器;连接后约 8 秒内出现在这里。外壳的设备读取没有成功时,这里同样为空。" /></div> : undefined} />
      </Panel>
      <Panel flush title="执行节点" description="运行评估任务的节点:是否在线、挂了几台设备、上次心跳。" data-nodes-list>
        {!hasValue(nodes) ? <div className="p-4" data-nodes-state={nodes.state}><ReadBlock read={nodes} what="执行节点" /></div> : (
          <>
            <StaleLine read={nodes} what="节点列表" />
            <DataTable<Node> label="执行节点" columns={nodeCols} rows={list} rowKey={(n) => n.node_id} stickyHeader={false}
              rowDataAttrs={(n) => ({ 'data-node-row': n.node_id })}
              state={list.length === 0 ? <div data-nodes-empty><EmptyState compact icon={Server} title="没有执行节点" cause="节点进程启动并向服务器报到后会出现在这里。" /></div> : undefined} />
          </>
        )}
      </Panel>
    </div>
  );
};
