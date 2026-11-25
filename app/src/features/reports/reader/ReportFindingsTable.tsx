// The findings of a report as a table: every record the report covers, none left out. On screen the table is paged
// (or shown whole on request) and says which rows of how many are in view; on paper every row is printed and the
// header repeats on each page (styles/print.css). A finding carries the marks it has everywhere else.
import React, { useEffect, useState } from 'react';
import { Button, cx } from '@/components/ui';
import type { FindingVM } from '@/features/pentest/workbench/model';
import { FindingCap, SeverityMark, StatusMark, findingLine } from '@/features/pentest/workbench/surfaces/findings/marks';

export type ReportFindingRow = Pick<FindingVM, 'id' | 'title' | 'priority' | 'status' | 'instanceCount'>;

export const REPORT_PAGE_SIZE = 25;

export const ReportFindingsTable: React.FC<{
  rows: ReportFindingRow[];
  pageSize?: number;
  /** Opens the finding where it can be reviewed. */
  onOpen?: (id: string) => void;
  caption?: string;
}> = ({ rows, pageSize = REPORT_PAGE_SIZE, onOpen, caption = '风险发现' }) => {
  const [page, setPage] = useState(0);
  const [all, setAll] = useState(false);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [page, pages]);
  const from = all ? 0 : page * pageSize;
  const to = all ? rows.length : Math.min(rows.length, from + pageSize);
  const paged = rows.length > pageSize;

  return (
    <div data-report-findings data-total={rows.length} data-shown={to - from}>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="jz-report-findings w-full border-collapse text-left text-label">
          <caption className="sr-only">{caption}，共 {rows.length} 条</caption>
          <thead>
            <tr className="border-b border-jz-border-strong text-meta text-jz-muted">
              <th scope="col" className="w-28 py-2 pl-3 pr-2 font-medium">优先级</th>
              <th scope="col" className="px-2 py-2 font-medium">标题</th>
              <th scope="col" className="w-24 px-2 py-2 font-medium">状态</th>
              <th scope="col" className="w-16 px-2 py-2 text-right font-medium">实例</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => {
              const on = i >= from && i < to;
              return (
                // A row outside the page in view is hidden on screen only; paper gets every row.
                <tr key={f.id} data-report-finding={f.id} data-row-priority={f.priority} data-on-page={on ? 'yes' : 'no'}
                  className={cx('border-b border-jz-border align-top', !on && 'hidden print:table-row')}>
                  <td className={cx('relative py-2 pl-3 pr-2', findingLine(f.priority))}>
                    <FindingCap priority={f.priority} />
                    <SeverityMark priority={f.priority} />
                  </td>
                  <td className="px-2 py-2 text-jz-ink">
                    {onOpen
                      ? <button type="button" onClick={() => onOpen(f.id)} title="在风险发现里打开这一条" data-report-finding-open
                          className="break-words text-left underline-offset-2 hover:underline print:no-underline">{f.title}</button>
                      : <span className="break-words">{f.title}</span>}
                  </td>
                  <td className="px-2 py-2"><StatusMark status={f.status} /></td>
                  <td className="px-2 py-2 text-right font-mono tnum text-jz-ink-2">{f.instanceCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {paged && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-meta text-jz-muted print:hidden" data-report-findings-pager>
          <span data-report-findings-range role="status">第 <span className="font-mono tnum">{from + 1}–{to}</span> 条，共 <span className="font-mono tnum">{rows.length}</span> 条</span>
          {!all && (
            <>
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-report-findings-prev>上一页</Button>
              <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} data-report-findings-next>下一页</Button>
            </>
          )}
          <Button size="sm" variant="ghost" aria-pressed={all} onClick={() => setAll((v) => !v)} data-report-findings-all>{all ? '分页显示' : `展开全部 ${rows.length} 条`}</Button>
          <span>导出和打印包含全部 {rows.length} 条。</span>
        </div>
      )}
    </div>
  );
};
