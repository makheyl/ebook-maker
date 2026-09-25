import { Loader2, Smile, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { AssetRef } from '@/core/schema';
import { assetUrls } from '@/editor/assets/asset-urls';
import { imageFilesFrom, importImageFiles } from '@/editor/assets/upload';
import { OPAQUE_WARNING } from '@/editor/character/actions';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { Switch } from '@/ui/switch';

export type WizardMascot = { asset: AssetRef; name: string; animate: boolean };

/** Optional step: one character image that appears (and moves) throughout the story. */
export function CharacterStep({
  mascot,
  onChange,
}: {
  mascot: WizardMascot | null;
  onChange: (mascot: WizardMascot | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const upload = async (files: File[]) => {
    const [file] = imageFilesFrom(files);
    if (!file) return;
    setBusy(true);
    try {
      const { assets, errors } = await importImageFiles([file]);
      errors.forEach((e) => toast.error(`${e.name}: ${e.message}`));
      const asset = assets[0];
      if (asset) {
        const name = asset.name?.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'My character';
        onChange({ asset, name, animate: mascot?.animate ?? true });
      }
    } finally {
      setBusy(false);
    }
  };

  if (!mascot) {
    return (
      <div
        className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-white/40 p-8 text-center backdrop-blur-sm dark:bg-white/[0.03]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload([...e.dataTransfer.files]);
        }}
      >
        <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
          {busy ? <Loader2 className="size-6 animate-spin" /> : <Smile className="size-6" />}
        </span>
        <div>
          <p className="font-medium">Add your story's main character</p>
          <p className="text-sm text-muted-foreground">
            One picture — ideally a PNG with a transparent background. It will appear on every page
            and can walk, hop and wave along with the story.
          </p>
        </div>
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload /> Choose a picture
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/gif,image/*"
          hidden
          data-testid="wizard-character-input"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            void upload(files);
          }}
        />
        <p className="text-xs text-muted-foreground">You can skip this — just press Continue.</p>
      </div>
    );
  }

  const thumb = assetUrls.resolve(mascot.asset.id, 'thumb');
  return (
    <div className="mx-auto grid max-w-xl gap-5">
      <div className="flex items-center gap-4 rounded-2xl border bg-white/55 shadow-[inset_0_1px_0_var(--glass-highlight)] dark:bg-white/5 p-4">
        <div className="grid size-28 shrink-0 place-items-center rounded-xl bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
          {thumb && <img src={thumb} alt="" className="max-h-full max-w-full object-contain" />}
        </div>
        <div className="grid flex-1 gap-2">
          <Label htmlFor="wizard-character-name">Character's name</Label>
          <Input
            id="wizard-character-name"
            value={mascot.name}
            maxLength={60}
            onChange={(e) => onChange({ ...mascot, name: e.target.value })}
          />
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => onChange(null)}
          >
            <Trash2 /> Remove
          </Button>
        </div>
      </div>
      {mascot.asset.hasAlpha === false && (
        <p
          role="alert"
          className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200"
        >
          {OPAQUE_WARNING}
        </p>
      )}
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
        <span>
          Animate it automatically
          <span className="block text-xs text-muted-foreground">
            Walks in, reacts to the story's words (“jumped” → hops), waves at the end. You can
            change everything later.
          </span>
        </span>
        <Switch
          checked={mascot.animate}
          onCheckedChange={(animate) => onChange({ ...mascot, animate })}
          aria-label="Animate it automatically"
        />
      </label>
    </div>
  );
}
