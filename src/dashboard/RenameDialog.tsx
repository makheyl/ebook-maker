import { useState } from 'react';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';

type Props = {
  open: boolean;
  initialTitle: string;
  onOpenChange: (open: boolean) => void;
  onRename: (title: string) => void;
};

export function RenameDialog({ open, initialTitle, onOpenChange, onRename }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Content unmounts when closed, so the form state resets on every open. */}
        <RenameForm initialTitle={initialTitle} onOpenChange={onOpenChange} onRename={onRename} />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ initialTitle, onOpenChange, onRename }: Omit<Props, 'open'>) {
  const [title, setTitle] = useState(initialTitle);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onRename(title);
        onOpenChange(false);
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename book</DialogTitle>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="rename-title">Title</Label>
        <Input
          id="rename-title"
          autoFocus
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit">Rename</Button>
      </DialogFooter>
    </form>
  );
}
