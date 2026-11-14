import React from 'react';

export const DataTable: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <div className="my-3 overflow-x-auto rounded-control border border-jz-border/50 bg-jz-canvas/30" data-md-table-scroll>
    <table className="w-full min-w-[680px] text-label leading-5 border-collapse">
      <thead className="bg-jz-surface-2/90">
        <tr>{headers.map((h, i) => <th key={i} className="px-2.5 py-2 text-left font-semibold text-jz-ink border-b border-jz-border whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci} className="px-2.5 py-2 border-b border-jz-border/60 align-top whitespace-normal break-words max-w-[320px]">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);
