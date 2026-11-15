import React, { useEffect, useRef } from 'react';

/** The conversation keeps at least this much width; below it the pinned pane yields to the drawer. */
export const AGENT_CENTER_MIN = 560;
const INSPECTOR_PINNED_W = 320; // w-80

/** Workspace shell: pane slots only.  Route chrome/session data stay outside. */
export const AgentWorkspace: React.FC<{
  sessionRail: React.ReactNode;
  sessionOpen: boolean;
  onCloseSession: () => void;
  inspector: React.ReactNode;
  inspectorOpen: boolean;
  /** Wide screens: the inspector is a third column in the layout instead of an overlay. */
  inspectorPinned?: boolean;
  onCloseInspector: () => void;
  /** Reports whether a pinned inspector would leave the conversation at least AGENT_CENTER_MIN wide. */
  onPinFitChange?: (fits: boolean) => void;
  children: React.ReactNode;
}> = ({ sessionRail, sessionOpen, onCloseSession, inspector, inspectorOpen, inspectorPinned,
       onCloseInspector, onPinFitChange, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onPinFitChange) return;
    const measure = () => {
      const rail = railRef.current && getComputedStyle(railRef.current).position === 'static' ? railRef.current.offsetWidth : 0;
      onPinFitChange(root.clientWidth - rail - INSPECTOR_PINNED_W >= AGENT_CENTER_MIN);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (railRef.current) ro.observe(railRef.current);
    return () => ro.disconnect();
  }, [onPinFitChange]);
  return (
  <div ref={rootRef} className="flex h-full min-h-0" data-agent-workspace>
    {sessionOpen && (
      <div className="fixed inset-0 top-jz-topbar z-40 bg-jz-scrim/30 lg:hidden"
        onClick={onCloseSession} data-agent-session-overlay />
    )}
    <div ref={railRef} className={`${sessionOpen ? 'fixed left-0 tablet:left-jz-sidebar-collapsed top-jz-topbar bottom-0 z-50 flex' : 'hidden'} lg:static lg:flex`}>
      {sessionRail}
    </div>
    {children}
    {inspectorPinned && (
      <aside className="flex w-80 flex-none min-h-0 border-l border-jz-border" role="complementary" aria-label="运行详情" data-agent-inspector-pinned>
        <div className="min-w-0 flex-1">{inspector}</div>
      </aside>
    )}
    {inspectorOpen && (
      <>
        <div className="fixed inset-0 top-jz-topbar bg-jz-scrim/25 z-40"
          onClick={onCloseInspector} data-agent-inspector-overlay />
        <aside className="fixed right-0 top-jz-topbar bottom-0 w-[360px] max-w-full z-50 shadow-dialog border-l border-jz-border" role="complementary" aria-label="运行详情">
          {inspector}
        </aside>
      </>
    )}
  </div>
  );
};
