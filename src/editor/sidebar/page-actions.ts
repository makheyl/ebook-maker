import { addPage, deletePages, duplicatePage, movePage } from '@/core/ops';
import { createPage } from '@/core/schema';
import { docStore } from '../store/doc-store';
import { useUiStore } from '../store/ui-store';

/** Page commands shared by the sidebar, menus and keyboard shortcuts. */
export const pageActions = {
  add(afterIndex?: number) {
    const project = docStore.project();
    if (!project) return;
    const page = createPage(project.theme);
    const index = afterIndex === undefined ? project.pages.length : afterIndex + 1;
    docStore.change((d) => addPage(d, page, index), { label: 'Add page' });
    useUiStore.getState().setActivePage(page.id);
  },
  duplicate(pageId: string) {
    const newId = docStore.change((d) => duplicatePage(d, pageId), { label: 'Duplicate page' });
    if (newId) useUiStore.getState().setActivePage(newId);
  },
  remove(pageId: string) {
    const project = docStore.project();
    if (!project) return;
    const index = project.pages.findIndex((p) => p.id === pageId);
    docStore.change((d) => deletePages(d, [pageId]), { label: 'Delete page' });
    const next = docStore.project()!;
    useUiStore.getState().setActivePage(next.pages[Math.min(index, next.pages.length - 1)]!.id);
  },
  move(from: number, to: number) {
    docStore.change((d) => movePage(d, from, to), { label: 'Reorder pages' });
  },
};
