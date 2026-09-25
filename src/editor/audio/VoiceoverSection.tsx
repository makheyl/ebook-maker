import { Languages, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { MAX_VOICE_LANGUAGES, type Page } from '@/core/schema';
import { defaultLanguageOf } from '@/core/voice';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { Input } from '@/ui/input';
import { Section } from '../panels/controls';
import { useProject } from '../store/selectors';
import {
  addVoiceLanguage,
  LANGUAGE_PRESETS,
  makeDefaultLanguage,
  removeVoiceLanguage,
  renameVoiceLanguage,
} from './actions';
import { VoiceSlots } from './VoiceSlots';

const CODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;

function AddLanguage() {
  const project = useProject();
  const taken = new Set(project.voiceover.languages.map((l) => l.code));
  const [custom, setCustom] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const full = project.voiceover.languages.length >= MAX_VOICE_LANGUAGES;
  const first = project.voiceover.languages.length === 0;
  if (custom) {
    const valid = name.trim() && CODE.test(code.trim()) && !taken.has(code.trim());
    return (
      <form
        className="grid grid-cols-[1fr_5rem_auto] items-end gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          if (addVoiceLanguage({ code: code.trim(), name: name.trim() })) {
            setCustom(false);
            setName('');
            setCode('');
          }
        }}
      >
        <Input
          autoFocus
          aria-label="Language name"
          placeholder="Name (Waray)"
          value={name}
          maxLength={40}
          className="h-8 text-xs"
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          aria-label="Language code"
          placeholder="Code (war)"
          value={code}
          maxLength={20}
          className="h-8 text-xs"
          onChange={(e) => setCode(e.target.value.trim())}
        />
        <Button type="submit" size="sm" disabled={!valid}>
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="col-span-3 justify-self-start"
          onClick={() => setCustom(false)}
        >
          Cancel
        </Button>
      </form>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={first ? 'default' : 'outline'}
          size="sm"
          className="justify-self-start"
          disabled={full}
        >
          <Plus /> {first ? 'Add your first language' : 'Add a language'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {LANGUAGE_PRESETS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            disabled={taken.has(l.code)}
            onSelect={() => addVoiceLanguage(l)}
          >
            {l.name} <span className="ml-auto text-xs text-muted-foreground">{l.code}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCustom(true)}>Custom…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Voiceover: the book's languages, and this page's recordings (one per language). */
export function VoiceoverSection({ page, pageNumber }: { page: Page; pageNumber: number }) {
  const project = useProject();
  const languages = project.voiceover.languages;
  const fallback = defaultLanguageOf(project);
  return (
    <Section title="Voiceover">
      <p className="-mt-1 text-[11px] text-muted-foreground">
        Upload your own recordings, one per language. Readers pick the language beside the page;
        when a recording is missing, the default language plays.
      </p>
      {languages.length > 0 && (
        <ul className="grid gap-1" aria-label="Languages">
          {languages.map((l) => (
            <li key={l.code} className="flex items-center gap-1">
              <Languages className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Input
                key={l.code + l.name}
                defaultValue={l.name}
                aria-label={`Name of ${l.code}`}
                maxLength={40}
                className="h-7 min-w-0 flex-1 text-xs"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value.trim() !== l.name &&
                  renameVoiceLanguage(l.code, e.target.value)
                }
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="w-8 shrink-0 text-center text-[11px] text-muted-foreground">
                {l.code}
              </span>
              {l.code === fallback ? (
                <span
                  className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground"
                  title="Plays when a recording is missing in the reader's language"
                >
                  Default
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  aria-label={`Make ${l.name} the default`}
                  title="Make default"
                  onClick={() => makeDefaultLanguage(l.code)}
                >
                  <Star />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Remove ${l.name}`}
                title="Remove language"
                onClick={() => removeVoiceLanguage(l.code)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <AddLanguage />
      {languages.length > 0 && (
        <div className="grid gap-1.5 pt-1">
          <h4 className="text-xs font-medium">When this page opens</h4>
          <VoiceSlots
            target={{ kind: 'page', pageId: page.id }}
            line={page.voiceover}
            what={`page ${pageNumber}`}
          />
        </div>
      )}
    </Section>
  );
}
