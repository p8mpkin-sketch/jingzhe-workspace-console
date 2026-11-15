import React from 'react';

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
  children: React.ReactNode;
}> = ({ sessionRail, sessionOpen, onCloseSession, inspector, inspectorOpen, inspectorPinned,
       onCloseInspector, children }) => (
  <div className="flex h-full min-h-0" data-agent-workspace>
    {sessionOpen && (
      <div className="fixed inset-0 top-jz-topbar z-40 bg-jz-scrim/30 lg:hidden"
        onClick={onCloseSession} data-agent-session-overlay />
    )}
    <div className={`${sessionOpen ? 'fixed left-0 tablet:left-jz-sidebar-collapsed top-jz-topbar bottom-0 z-50 flex' : 'hidden'} lg:static lg:flex`}>
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
