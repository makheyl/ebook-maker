import { useState } from 'react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { createProject, DEFAULT_PAGE_SIZE_ID, getPageSizePreset } from '@/core/schema';
import { projectRepo } from '@/storage';
import { Button } from '@/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { PageSizePicker } from '@/ui/PageSizePicker';

export function NewBookDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [title, setTitle] = useState('');
  const [sizeId, setSizeId] = useState(DEFAULT_PAGE_SIZE_ID);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { width, height } = getPageSizePreset(sizeId);
      const project = createProject({ title, pageSize: { width, height } });
      await projectRepo.save(project);
      onOpenChange(false);
      navigate(`/p/${project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the book');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={create} className="grid gap-6">
          <DialogHeader>
            <DialogTitle>New blank book</DialogTitle>
            <DialogDescription>
              Pick a title and page size. You can change the title any time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-book-title">Title</Label>
            <Input
              id="new-book-title"
              autoFocus
              placeholder="Untitled book"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Page size</Label>
            <PageSizePicker value={sizeId} onChange={setSizeId} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Create book
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
