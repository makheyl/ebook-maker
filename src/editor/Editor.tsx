import { replacePicture } from './replace/actions';
import { voiceClips } from '@/core/voice';
import { ReplaceCharacterDialog } from './replace/ReplaceCharacterDialog';
import { StageContextMenu } from './menus/EditorContextMenu';
import { CollapsedRail } from './layout/CollapsedRail';
import { useLayoutStore } from './layout/layout-store';
import { ResizeHandle } from './layout/ResizeHandle';
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
import { OverflowBadge } from './stage/OverflowBadge';
import { MotionPathOverlay } from './stage/MotionPathOverlay';
import { BubbleTailHandle } from './stage/BubbleTailHandle';
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
  const collapsed = useLayoutStore((s) => s.collapsed);
  useEditorShortcuts(shortcutOpts);

  // Images can arrive from other books (paste) — resolve any we don't have URLs for yet.
  // Voice recordings live in pages' lines, so their ids are joined into one stable key.
  const voiceIds = voiceClips(project)
    .map((c) => c.id)
    .join(',');
  useEffect(() => {
    void assetUrls
      .ensure([
        ...Object.keys(project.assets),
        ...Object.keys(project.sounds),
        ...Object.keys(project.music.tracks),
        ...(voiceIds ? voiceIds.split(',') : []),
      ])
      .catch(() => undefined);
  }, [project.assets, project.sounds, project.music.tracks, voiceIds]);

  return (
    <div className="flex h-full flex-col">
      <TopBar onPreview={shortcutOpts.onPreview} onExport={() => setExportOpen(true)} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <div className="flex min-h-0 flex-1">
        {collapsed.left ? (
          <CollapsedRail side="left" />
        ) : (
          <>
            <PageList />
            <ResizeHandle panel="left" label="Pages panel divider" controls="panel-pages" />
          </>
        )}
        <main className="isolate flex min-w-0 flex-1 flex-col" aria-label="Page editor">
          <div className="relative flex min-h-0 flex-1">
            <StageContextMenu>
              <Stage
                onDropFiles={(files, at) => void insertImages(files, at)}
                onReplaceImage={(id, files) => void replacePicture(id, files)}
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
                    <OverflowBadge scale={scale} />
                    <BubbleTailHandle view={view} scale={scale} />
                  </>
                )}
              />
            </StageContextMenu>
            <InsertToolbar />
            <StageHints />
          </div>
          {timelineOpen && (
            <>
              <ResizeHandle panel="bottom" label="Timeline divider" controls="panel-timeline" />
              <Suspense fallback={<div className="h-60 shrink-0 border-t bg-sidebar" />}>
                <TimelineDock />
              </Suspense>
            </>
          )}
        </main>
        {collapsed.right ? (
          <CollapsedRail side="right" />
        ) : (
          <>
            <ResizeHandle
              panel="right"
              label="Properties panel divider"
              controls="panel-properties"
            />
            <RightPanel animate={<AnimationPane />} />
          </>
        )}
      </div>
      <p className="border-t bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-800 md:hidden dark:text-amber-200">
        The editor works best on a larger screen. Your books still read beautifully on phones.
      </p>
      {mode === 'preview' && <PreviewOverlay onClose={closePreview} />}
      <ReplaceCharacterDialog />
    </div>
  );
}
