import { useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { insertImages } from './actions';
import { assetUrls } from './assets/asset-urls';
import { useAutosave } from './autosave';
import './editor.css';
import { RightPanel } from './panels/RightPanel';
import { useEditorShortcuts } from './shortcuts';
import { PageList } from './sidebar/PageList';
import { InsertToolbar } from './stage/InsertToolbar';
import { SelectionLayer } from './stage/SelectionLayer';
import { Stage } from './stage/Stage';
import { setPendingCaret } from './stage/caret';
import { TextEditing } from './stage/TextEditing';
import { useProject } from './store/selectors';
import { useUiStore } from './store/ui-store';
import { TopBar } from './topbar/TopBar';

export function Editor() {
  const project = useProject();
  const [, navigate] = useLocation();
  useAutosave();
  const shortcutOpts = useMemo(
    () => ({ onPreview: () => navigate(`/p/${project.id}/preview`) }),
    [navigate, project.id],
  );
  useEditorShortcuts(shortcutOpts);

  // Images can arrive from other books (paste) — resolve any we don't have URLs for yet.
  useEffect(() => {
    void assetUrls.ensure(Object.keys(project.assets)).catch(() => undefined);
  }, [project.assets]);

  return (
    <div className="flex h-full flex-col">
      <TopBar onPreview={shortcutOpts.onPreview} onExport={() => undefined} />
      <div className="flex min-h-0 flex-1">
        <PageList />
        <main className="relative flex min-w-0 flex-1" aria-label="Page editor">
          <Stage
            onDropFiles={(files, at) => void insertImages(files, at)}
            onEditText={(id, point) => {
              setPendingCaret(point);
              useUiStore.getState().setEditingText(id);
            }}
            overlay={({ view, scale, viewportEl, contentEl }) => (
              <>
                <SelectionLayer view={view} scale={scale} viewportEl={viewportEl} contentEl={contentEl} />
                <TextEditing view={view} />
              </>
            )}
          />
          <InsertToolbar />
        </main>
        <RightPanel />
      </div>
    </div>
  );
}
