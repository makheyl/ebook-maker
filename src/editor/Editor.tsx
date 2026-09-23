import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { insertImages } from './actions';
import { assetUrls } from './assets/asset-urls';
import { useAutosave } from './autosave';
import './editor.css';
import { stopPreview } from './animation/preview';
import { ExportDialog } from './export/ExportDialog';
import { AnimationPane } from './panels/AnimationPane';
import { PreviewOverlay } from './preview/PreviewOverlay';
import { RightPanel } from './panels/RightPanel';
import { useEditorShortcuts } from './shortcuts';
import { PageList } from './sidebar/PageList';
import { InsertToolbar } from './stage/InsertToolbar';
import { MotionPathOverlay } from './stage/MotionPathOverlay';
import { PivotHandle } from './stage/PivotHandle';
import { SelectionLayer } from './stage/SelectionLayer';
import { StageHints } from './stage/StageHints';
import { Stage } from './stage/Stage';
import { setPendingCaret } from './stage/caret';
import { TextEditing } from './stage/TextEditing';
import { useProject } from './store/selectors';
import { useUiStore } from './store/ui-store';
import { TopBar } from './topbar/TopBar';

// The timeline is only loaded when opened.
const TimelineDock = lazy(() => import('./timeline/TimelineDock'));

export function Editor({ mode = 'edit' }: { mode?: 'edit' | 'preview' }) {
  const project = useProject();
  const [, navigate] = useLocation();
  useAutosave();
  const shortcutOpts = useMemo(
    () => ({
      onPreview: () => {
        stopPreview();
        navigate(`/p/${project.id}/preview`);
      },
    }),
    [navigate, project.id],
  );
  const closePreview = useCallback(() => navigate(`/p/${project.id}`), [navigate, project.id]);
  const [exportOpen, setExportOpen] = useState(false);
  const timelineOpen = useUiStore((s) => s.timelineOpen);
  useEditorShortcuts(shortcutOpts);

  // Images can arrive from other books (paste) — resolve any we don't have URLs for yet.
  useEffect(() => {
    void assetUrls.ensure(Object.keys(project.assets)).catch(() => undefined);
  }, [project.assets]);

  return (
    <div className="flex h-full flex-col">
      <TopBar onPreview={shortcutOpts.onPreview} onExport={() => setExportOpen(true)} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <div className="flex min-h-0 flex-1">
        <PageList />
        <main className="isolate flex min-w-0 flex-1 flex-col" aria-label="Page editor">
          <div className="relative flex min-h-0 flex-1">
            <Stage
              onDropFiles={(files, at) => void insertImages(files, at)}
              onEditText={(id, point) => {
                setPendingCaret(point);
                useUiStore.getState().setEditingText(id);
              }}
              overlay={({ view, scale, viewportEl, contentEl }) => (
                <>
                  <SelectionLayer
                    view={view}
                    scale={scale}
                    viewportEl={viewportEl}
                    contentEl={contentEl}
                  />
                  <TextEditing view={view} />
                  <PivotHandle scale={scale} />
                  <MotionPathOverlay scale={scale} />
                </>
              )}
            />
            <InsertToolbar />
            <StageHints />
          </div>
          {timelineOpen && (
            <Suspense fallback={<div className="h-60 shrink-0 border-t bg-sidebar" />}>
              <TimelineDock />
            </Suspense>
          )}
        </main>
        <RightPanel animate={<AnimationPane />} />
      </div>
      <p className="border-t bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-800 md:hidden dark:text-amber-200">
        The editor works best on a larger screen. Your books still read beautifully on phones.
      </p>
      {mode === 'preview' && <PreviewOverlay onClose={closePreview} />}
    </div>
  );
}
