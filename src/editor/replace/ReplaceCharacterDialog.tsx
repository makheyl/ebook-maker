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
import { resolveCharacterReplace, useReplaceStore } from './actions';

/** "Change Pip everywhere, or just this picture?" */
export function ReplaceCharacterDialog() {
  const pending = useReplaceStore((s) => s.pending);
  const name = pending?.characterName ?? 'the character';
  return (
    <AlertDialog
      open={!!pending}
      onOpenChange={(open) => !open && resolveCharacterReplace('cancel')}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Change {name} everywhere?</AlertDialogTitle>
          <AlertDialogDescription>
            This picture is {name}. You can give {name} the new picture on every page (their moves,
            idle and tap reactions stay), or change only this picture — it then stops being {name}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button variant="outline" onClick={() => resolveCharacterReplace('only')}>
            Only this picture
          </Button>
          <AlertDialogAction onClick={() => resolveCharacterReplace('character')}>
            Update {name} on every page
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
