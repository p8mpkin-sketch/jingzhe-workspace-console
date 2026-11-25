// The artifact dialog of the task centre: a dialog shell around the shared artifact browser. The browser itself,
// with every request and action, is features/artifacts/ArtifactBrowser; the assessment workbench shows the same one.
import React from 'react';
import { Dialog } from '@/components/ui';
import { ArtifactBrowser } from '@/features/artifacts/ArtifactBrowser';

export const ArtifactsModal: React.FC<{
  taskId: number;
  taskName: string;
  /** The assessment session of the task; with one the report package can be downloaded. */
  linked: { pid: number; sid: number } | null;
  onClose: () => void;
}> = ({ taskId, taskName, linked, onClose }) => (
  <Dialog open onClose={onClose} widthClass="w-full max-w-jz-content" title="任务产物" dataAttrs={{ 'data-art-dialog': '' }}>
    <div className="-mx-5 -mb-4 border-t border-jz-border">
      <ArtifactBrowser taskId={taskId} taskName={taskName} linked={linked} className="h-[70vh] min-h-80" />
    </div>
  </Dialog>
);
