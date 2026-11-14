import React from 'react';

/** Workspace shell: pane slots only.  Route chrome/session data stay outside. */
export const AgentWorkspace: React.FC<{
  sessionRail: React.ReactNode;
  sessionOpen: boolean;
  onCloseSession: () => void;
  inspector: React.ReactNode;
  inspectorOpen: boolean;
  onCloseInspector: () => void;
  children: React.ReactNode;
}> = ({ sessionRail, sessionOpen, onCloseSession, inspector, inspectorOpen,
       onCloseInspector, children }) => (
  <div className="flex h-full min-h-0" data-agent-workspace>
    {sessionOpen && (
      <div className="fixed inset-0 top-12 z-40 bg-black/30 lg:hidden"
        onClick={onCloseSession} data-agent-session-overlay />
    )}
    <div className={`${sessionOpen ? 'fixed left-14 top-12 bottom-0 z-50 flex' : 'hidden'} lg:static lg:flex`}>
      {sessionRail}
    </div>
    {children}
    {inspectorOpen && (
      <>
        <div className="fixed inset-0 top-12 bg-black/25 z-40"
          onClick={onCloseInspector} data-agent-inspector-overlay />
        <aside className="fixed right-0 top-12 bottom-0 w-[360px] z-50 shadow-2xl border-l border-jz-border/50">
          {inspector}
        </aside>
      </>
    )}
  </div>
);
