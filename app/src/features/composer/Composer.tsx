// Composer: the control strip of a run, not a chat box. A raised surface under a 2 px rule that takes the brand
// colour while the input has focus. Context chips sit above the input; the control row below it states the model
// route (read-only here), the mode and the real elapsed time, and holds the one solid button: send, or stop while
// the run is running, in the same position and size. Guidance can be sent while the run is running: it is added to
// the run and stops nothing, so it is a secondary action beside stop (and Ctrl/⌘ + Enter), never the solid button.
// Nothing is animated: no typing indicator, no streaming effect.
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Lock, Send, Square } from 'lucide-react';
import { Button, Popover, StatusText, cx, type GlyphKind } from '@/components/ui';
import { CommandMenu, type MenuRow } from './CommandMenu';
import { ContextChips } from './ContextChips';
import { useComposer, useModelRoute, type ComposerCommand, type ContextChip, type ContextOption, type SendResult } from './useComposer';

export interface ComposerProps {
  /** Drafted context is kept per scope (one per session). */
  scope: string;
  fixedChips: ContextChip[];
  commands: ComposerCommand[];
  contextOptions: ContextOption[];
  placeholder: string;
  mode: string;
  /** Run state word, its glyph, and the elapsed time while the run is live. */
  run: { word: string; glyph: GlyphKind; live: boolean; elapsed: string; elapsedSource: string };
  /** The run is running: the primary button is "stop"; guidance is sent by the secondary action or Ctrl/⌘ + Enter. */
  running: boolean;
  /** Why nothing can be sent right now (first read pending, another action in flight). */
  blocked?: string;
  onSend: (message: string) => Promise<SendResult>;
  onStop: () => void;
  /** Optional. The 路由 cell becomes a model picker over the same catalog; the owner sends the picked model. */
  modelPicker?: { value: string; onChange: (model: string) => void };
  /** Optional. The 模式 cell becomes a switch (or a locked word with its reason). Given = a conversation, not
   *  guidance: no context quoting, and the words speak of messages. */
  modeControl?: { value: string; options: Array<{ key: string; label: string; hint: string }>; locked?: string; onChange: (key: string) => void };
  /** Optional, default true: text can be sent while the run is running (guidance). False: while running, only stop. */
  sendWhileRunning?: boolean;
}

/** The modifier of this platform's send shortcut, as it is printed on the key. */
const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘' : 'Ctrl';

const Cell: React.FC<{ label: string; children: React.ReactNode; className?: string; hook: string }> = ({ label, children, className, hook }) => (
  <div data-composer-cell={hook} className={cx('flex min-w-0 items-center gap-1.5 border-r border-jz-border pr-3 text-meta', className)}>
    <span className="flex-none text-jz-muted">{label}</span>{children}
  </div>
);

export const Composer: React.FC<ComposerProps> = ({ scope, fixedChips, commands, contextOptions, placeholder, mode, run, running, blocked: blockedProp, onSend, onStop, modelPicker, modeControl, sendWhileRunning = true }) => {
  const route = useModelRoute();
  const talk = !!modeControl;
  const holdWhileRunning = running && !sendWhileRunning;
  const c = useComposer({ scope, fixed: fixedChips, commands, contextOptions, canSend: !blockedProp && !holdWhileRunning, onSend, noCite: talk });
  // The composer's own send is "an action in flight" for its owner; the button already says so.
  const blocked = c.sending ? undefined : blockedProp;
  const ta = useRef<HTMLTextAreaElement>(null);
  // Plain Enter was pressed while the run is running: the note spells out how to send until the text changes.
  const [nudge, setNudge] = useState(false);
  const menuId = useId();
  const noteId = useId();

  // One to eight lines; after that the input scrolls inside itself. The list above gives up the space.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 22;
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(line * 8 + pad))}px`;
  }, [c.text]);
  useEffect(() => { if (c.menu && document.activeElement !== ta.current) ta.current?.focus(); }, [c.menu]);

  const rows: MenuRow[] = c.menu?.type === 'command'
    ? c.commandHits.map((x) => ({ key: x.id, label: x.label, hint: x.hint, disabled: x.disabled }))
    : c.contextHits.map((x) => ({ key: x.key, label: x.label, hint: x.hint }));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (c.menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (c.count) c.setIndex((c.index + (e.key === 'ArrowDown' ? 1 : c.count - 1)) % c.count); return; }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); c.pick(c.index); return; }
      if (e.key === 'Tab' && c.count) { e.preventDefault(); c.pick(c.index); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); c.closeMenu(); return; }
    }
    // Ctrl/⌘ + Enter always sends. Plain Enter sends too, except while the run is running: there it would be one
    // key press between a half-written thought and a live run, so it only points at the two ways to send.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) { e.preventDefault(); if (holdWhileRunning) setNudge(true); else void c.send(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (running) setNudge(true); else void c.send(); return; }
    if (e.key === 'ArrowUp' && !c.text) { if (c.recall()) e.preventDefault(); return; }
    if (e.key === 'Escape') { e.preventDefault(); ta.current?.blur(); }
  };

  const reason = c.denied ? (talk ? '当前账号没有在这个会话发送消息的权限。' : '当前账号没有向这个会话发送引导的权限。')
    : blocked ? blocked
    : holdWhileRunning ? '正在执行，这时只能停止；结束后再发送。'
    : running && nudge ? `运行中按 ${MOD} + Enter 或点“发送引导”发送。引导会追加到当前运行，不会停止任务。`
    : running ? `引导会追加到当前运行，不会停止任务 · ${MOD} + Enter 发送`
    : '';
  const state = c.denied ? 'forbidden' : c.error ? 'error' : c.sending ? 'sending' : blocked ? 'disabled' : running ? 'running' : 'idle';

  return (
    <div data-composer data-state={state} className="flex-none border-t-line border-jz-border-strong bg-jz-raised focus-within:border-jz-brand">
      {(!talk || c.chips.length > 0) && <ContextChips chips={c.chips} onRemove={c.removeChip} onAdd={c.openContext} disabled={c.denied} noAdd={talk}
        canAdd={contextOptions.length > 0} addHint={contextOptions.length ? '引用一条风险发现（也可以在输入框里键入 @）' : '这个会话还没有可引用的风险发现'} />}
      {c.error && (
        <div role="alert" data-composer-error className="mx-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-jz-red/30 bg-jz-red/10 px-3 py-1.5 text-label text-jz-ink">
          <span className="min-w-0 flex-1 basis-56">
            {c.denied ? '没有权限：服务器拒绝了这次发送（403）。文本保留在输入框里，没有任何内容被发送。'
              : c.error.status === 429 ? '请求太频繁：服务器限制了发送频率（429）。文本保留在输入框里，稍后再发送。'
              : <>发送失败：{c.error.message}。文本保留在输入框里。</>}
          </span>
          {!c.denied && <Button size="sm" variant="secondary" onClick={() => void c.send()} disabled={!!blocked} data-composer-retry>重试</Button>}
        </div>
      )}
      <div className="relative">
        {c.menu && (
          <CommandMenu id={menuId} title={c.menu.type === 'command' ? '命令' : '引用上下文'} rows={rows} index={c.index} onHover={c.setIndex} onPick={c.pick}
            empty={c.menu.type === 'command' ? '没有这个命令。' : contextOptions.length ? '没有匹配的风险发现，或已全部引用。' : '这个会话还没有可引用的风险发现。'} />
        )}
        <textarea ref={ta} rows={1} value={c.text} onChange={(e) => { c.setText(e.target.value); setNudge(false); }} onKeyDown={onKeyDown} disabled={c.denied}
          placeholder={placeholder} aria-label={talk ? '消息输入' : '引导输入'} data-composer-input data-focus-inset
          role="combobox" aria-expanded={!!c.menu} aria-controls={c.menu ? menuId : undefined} aria-autocomplete="list"
          aria-activedescendant={c.menu && c.count ? `${menuId}-${c.index}` : undefined} aria-describedby={reason ? noteId : undefined}
          className="block w-full resize-none bg-transparent px-3 py-2 text-body text-jz-ink placeholder:text-jz-muted disabled:cursor-not-allowed disabled:text-jz-muted" />
      </div>
      <div className={cx('flex min-h-11 min-w-0 items-center gap-3 border-t border-jz-border bg-jz-inset px-3 py-1.5', modeControl && 'flex-wrap gap-y-1.5')} data-composer-controls>
        <Cell label={modelPicker ? '模型' : '路由'} hook="route">
          {modelPicker ? (
            <select value={modelPicker.value} onChange={(e) => modelPicker.onChange(e.target.value)} aria-label="模型" data-composer-model
              disabled={c.denied || route.state === 'reading'}
              className="max-w-48 min-w-0 truncate rounded-tag border border-jz-border bg-jz-surface px-1.5 py-0.5 font-mono text-mono text-jz-ink">
              <option value="">{route.state === 'reading' ? '正在读取…' : route.state === 'unavailable' ? '跟随路由（目录未读到）' : `跟随路由${route.active ? ` · ${route.active}` : ''}`}</option>
              {route.state === 'ok' && route.models.map((m) => <option key={m.value} value={m.value}>{m.label} · {m.value}{m.value === route.active ? ' · 主力' : ''}</option>)}
            </select>
          ) : route.state === 'reading' ? <span className="text-jz-muted">正在读取…</span>
            : route.state === 'unavailable' ? <span className="text-jz-ink-2" title="模型目录和模型服务列表都没有读到">未读到</span> : (
              <Popover label="模型路由" align="start" side="top" className="w-80"
                trigger={(p) => (
                  <button type="button" {...p} data-composer-route title="查看模型目录（只读）" className="max-w-40 truncate rounded-tag font-mono text-mono text-jz-ink underline decoration-jz-border-strong underline-offset-4 hover:decoration-jz-ink">
                    {route.active || '跟随系统路由'}
                  </button>
                )}>
                <div className="px-2.5 py-2">
                  <p className="text-meta text-jz-ink-2">工作台不选择模型：引导由评估引擎按系统路由处理。下面是模型目录，只读。</p>
                  <ul className="mt-2 space-y-1">
                    {route.models.map((m) => (
                      <li key={m.value} className="flex min-w-0 items-baseline justify-between gap-3 text-label text-jz-ink">
                        <span className="min-w-0 truncate">{m.label}</span>
                        <span className="flex-none font-mono text-mono text-jz-ink-2">{m.value}{m.value === route.active ? ' · 当前' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Popover>
            )}
        </Cell>
        {modeControl ? (
          <Cell label="模式" hook="mode">
            {modeControl.locked ? (
              <span className="inline-flex items-center gap-1 text-jz-ink" title={modeControl.locked} data-composer-mode-locked>
                <Lock size={12} aria-hidden className="text-jz-muted" />{modeControl.options.find((o) => o.key === modeControl.value)?.label || mode}
                <span className="sr-only">（{modeControl.locked}）</span>
              </span>
            ) : (
              <span role="radiogroup" aria-label="模式" className="inline-flex rounded-tag border border-jz-border bg-jz-surface p-px" data-composer-mode-switch>
                {modeControl.options.map((o) => (
                  <button key={o.key} type="button" role="radio" aria-checked={modeControl.value === o.key} title={o.hint} data-composer-mode={o.key}
                    onClick={() => modeControl.onChange(o.key)}
                    className={cx('whitespace-nowrap rounded-tag px-2 py-0.5 text-meta', modeControl.value === o.key ? 'bg-jz-brand-soft font-medium text-jz-ink' : 'text-jz-ink-2 hover:text-jz-ink')}>
                    {o.label}
                  </button>
                ))}
              </span>
            )}
          </Cell>
        ) : <Cell label="模式" hook="mode" className="max-[760px]:hidden"><span className="text-jz-ink">{mode}</span></Cell>}
        <div className="flex min-w-0 items-center gap-2 text-meta" data-composer-cell="run" title={run.elapsedSource}>
          <StatusText kind={run.glyph} className="!text-meta">{run.word}</StatusText>
          {run.live && <span className="font-mono text-mono tnum text-jz-ink" data-composer-timer>{run.elapsed}</span>}
        </div>
        <span id={noteId} data-composer-reason className={cx('min-w-0 flex-1 truncate text-right text-meta', reason ? 'text-jz-ink-2' : 'text-jz-muted max-[760px]:hidden')}>
          {reason || (talk ? 'Enter 发送 · Shift+Enter 换行 · / 命令' : `Enter 发送 · Shift+Enter 换行 · / 命令 · @ 引用`)}
        </span>
        {running ? (
          <>
            {sendWhileRunning && <Button variant="secondary" className="ml-auto flex-none" icon={<Send size={14} aria-hidden />} loading={c.sending} disabled={!c.text.trim() || !!blocked || c.denied}
              onClick={() => void c.send()} data-composer-send-guidance title={`发送引导（${MOD} + Enter）。引导会追加到当前运行，不会停止任务。`}>
              <span className="max-[480px]:sr-only">发送引导</span>
            </Button>}
            <Button className={cx('w-[5.5rem] flex-none', !sendWhileRunning && 'ml-auto')} icon={<Square size={14} aria-hidden />} onClick={onStop} data-composer-primary="stop" title={talk ? '停止当前回复' : '停止这次运行（会先确认）'}>停止</Button>
          </>
        ) : (
          <Button className="ml-auto w-[5.5rem] flex-none" icon={<Send size={14} aria-hidden />} loading={c.sending} disabled={!c.text.trim() || !!blocked || c.denied}
            onClick={() => void c.send()} data-composer-primary="send">发送</Button>
        )}
      </div>
    </div>
  );
};
