import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { toast } from 'sonner';
import {
  createProject,
  DEFAULT_PAGE_SIZE_ID,
  getPageSizePreset,
  type AssetRef,
} from '@/core/schema';
import { produce } from 'immer';
import { createCharacter } from '@/core/character';
import { applyStoryPlan, suggestPlan, type StoryPlanRow } from '@/core/story';
import { fitGeneratedText } from '@/editor/text/fit-pages';
import { generatePages, PALETTES } from '@/core/templates';
import { projectRepo } from '@/storage';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { Label } from '@/ui/label';
import { LogoMark } from '@/ui/Logo';
import { PageSizePicker } from '@/ui/PageSizePicker';
import { cn } from '@/ui/utils';
import type { WizardRow } from './pairing';
import { LayoutStep, type LayoutChoice } from './steps/LayoutStep';
import { CharacterStep, type WizardMascot } from './steps/CharacterStep';
import { PagesStep } from './steps/PagesStep';

const STEPS = ['Book', 'Pages', 'Character', 'Layout'] as const;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className="flex items-center gap-2"
          aria-current={i === step ? 'step' : undefined}
        >
          {i > 0 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
          <span
            className={cn(
              'grid size-6 place-items-center rounded-full border text-xs',
              i < step && 'border-primary bg-primary text-primary-foreground',
              i === step && 'border-primary text-primary',
            )}
          >
            {i < step ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span
            className={cn('hidden sm:inline', i === step ? 'font-medium' : 'text-muted-foreground')}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Adds the character to every page — placed consistently, animated from the text if asked. */
function withMascot(project: ReturnType<typeof createProject>, mascot: WizardMascot) {
  const character = createCharacter(mascot.asset, mascot.name.trim() || 'My character');
  const rows: StoryPlanRow[] = mascot.animate
    ? suggestPlan(project)
    : project.pages.map((p) => ({ pageId: p.id, include: true, reasons: [] }));
  return produce(project, (d) => {
    d.assets[mascot.asset.id] = mascot.asset;
    d.characters[character.id] = character;
    applyStoryPlan(d, character.id, rows);
  });
}

/**
 * Quick-create: title + size → rows of text + image (bulk pairing) → character → layout.
 * The generated pages are ordinary, fully editable elements.
 */
export function QuickCreateWizard() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [sizeId, setSizeId] = useState(DEFAULT_PAGE_SIZE_ID);
  const [rows, setRows] = useState<WizardRow[]>([]);
  const [choice, setChoice] = useState<LayoutChoice>({
    templateId: 'image-top',
    paletteId: 'paper',
    fontId: 'lora',
    animate: true,
  });
  const [mascot, setMascot] = useState<WizardMascot | null>(null);
  const [busy, setBusy] = useState(false);
  const { width, height } = getPageSizePreset(sizeId);
  const pageSize = { width, height };

  const create = async () => {
    setBusy(true);
    try {
      const palette = PALETTES.find((p) => p.id === choice.paletteId) ?? PALETTES[0]!;
      const pages = await fitGeneratedText(
        generatePages(
          rows.map((r) => ({ text: r.text.trim(), asset: r.image?.asset })),
          { ...choice, pageSize, palette },
        ),
        pageSize,
      );
      const project = createProject({
        title,
        pageSize,
        pages,
        theme: {
          fontFamily: choice.fontId,
          background: palette.background,
          textColor: palette.text,
          accent: palette.accent,
        },
      });
      const assets: Record<string, AssetRef> = {};
      for (const r of rows) if (r.image) assets[r.image.asset.id] = r.image.asset;
      project.assets = assets;
      const book = mascot ? withMascot(project, mascot) : project;
      await projectRepo.save(book);
      navigate(`/p/${book.id}`);
    } catch (err) {
      toast.error(`Could not create the book: ${err instanceof Error ? err.message : String(err)}`);
      setBusy(false);
    }
  };

  const canContinue = step === 0 || (step === 1 && rows.length > 0) || step >= 2;

  return (
    <div className="flex min-h-full flex-col">
      <header className="glass-float glass-edge-b sticky top-0 z-10">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
          <Link
            href="/"
            aria-label="All books"
            className="rounded-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogoMark />
          </Link>
          <h1 className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-primary" /> Quick create
          </h1>
          <div className="flex-1" />
          <Stepper step={step} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {step === 0 && (
          <div className="mx-auto grid max-w-2xl gap-6">
            <div>
              <h2 className="text-xl font-semibold">Let’s start your book</h2>
              <p className="text-sm text-muted-foreground">
                Give it a name and choose the page shape.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wizard-title">Title</Label>
              <Input
                id="wizard-title"
                autoFocus
                value={title}
                maxLength={200}
                placeholder="My story"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setStep(1)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Page size</Label>
              <PageSizePicker value={sizeId} onChange={setSizeId} />
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold">Add your pages</h2>
              <p className="text-sm text-muted-foreground">
                Each page gets one line of text and one image. Drop them in bulk — they pair up in
                order — then drag to reorder or swap images.
              </p>
            </div>
            <PagesStep rows={rows} setRows={setRows} />
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-4">
            <div className="mx-auto max-w-xl text-center">
              <h2 className="text-xl font-semibold">Add a character (optional)</h2>
              <p className="text-sm text-muted-foreground">
                A mascot who appears throughout the story and moves with it.
              </p>
            </div>
            <CharacterStep mascot={mascot} onChange={setMascot} />
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-4">
            <div>
              <h2 className="text-xl font-semibold">Pick a layout</h2>
              <p className="text-sm text-muted-foreground">
                You can change anything afterwards — every page is fully editable.
              </p>
            </div>
            <LayoutStep rows={rows} pageSize={pageSize} choice={choice} onChange={setChoice} />
          </div>
        )}
      </main>

      <footer className="glass-float glass-edge-t sticky bottom-0">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> Back
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <Link href="/">Cancel</Link>
            </Button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canContinue}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button onClick={create} disabled={busy || rows.length === 0}>
              <Sparkles /> {busy ? 'Creating…' : `Create ${rows.length}-page book`}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
