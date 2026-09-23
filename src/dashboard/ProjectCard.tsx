import { Copy, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { projectRepo, type ProjectSummary } from '@/storage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { formatRelativeTime } from '@/ui/format';
import { CoverThumbnail } from './CoverThumbnail';
import { RenameDialog } from './RenameDialog';

function reportError(action: string) {
  return (err: unknown) =>
    toast.error(`${action} failed: ${err instanceof Error ? err.message : err}`);
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const href = `/p/${project.id}`;

  return (
    <article className="group relative flex flex-col gap-3" data-testid="project-card">
      <Link
        href={href}
        className="block overflow-hidden rounded-xl border bg-muted shadow-xs transition-shadow group-hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${project.title}`}
      >
        <CoverThumbnail summary={project} />
      </Link>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-medium hover:underline">
            {project.title}
          </Link>
          <p className="text-xs text-muted-foreground">
            {project.pageCount} {project.pageCount === 1 ? 'page' : 'pages'} · Edited{' '}
            {formatRelativeTime(project.updatedAt)}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${project.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(true)}>
              <Pencil /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                projectRepo
                  .duplicate(project.id)
                  .then(() => toast.success('Book duplicated'))
                  .catch(reportError('Duplicate'))
              }
            >
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <RenameDialog
        open={renaming}
        initialTitle={project.title}
        onOpenChange={setRenaming}
        onRename={(title) => projectRepo.rename(project.id, title).catch(reportError('Rename'))}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The book and any images only it uses will be removed from this browser. This can’t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => projectRepo.delete(project.id).catch(reportError('Delete'))}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}
