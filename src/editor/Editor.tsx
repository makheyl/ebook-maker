import { useLocation } from 'wouter';
import { useAutosave } from './autosave';
import { PagePanel } from './panels/PagePanel';
import { PageList } from './sidebar/PageList';
import { Stage } from './stage/Stage';
import { useProject } from './store/selectors';
import { TopBar } from './topbar/TopBar';

export function Editor() {
  const project = useProject();
  const [, navigate] = useLocation();
  useAutosave();

  return (
    <div className="flex h-full flex-col">
      <TopBar onPreview={() => navigate(`/p/${project.id}/preview`)} onExport={() => undefined} />
      <div className="flex min-h-0 flex-1">
        <PageList />
        <Stage />
        <aside
          aria-label="Properties"
          className="w-72 shrink-0 overflow-y-auto border-l bg-sidebar"
        >
          <PagePanel />
        </aside>
      </div>
    </div>
  );
}
