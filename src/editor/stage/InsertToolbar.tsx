import {
  Circle,
  GalleryVerticalEnd,
  Image as ImageIcon,
  Minus,
  MessageCircle,
  MousePointerClick,
  Shapes,
  Smile,
  Square,
  SquareDashed,
  Type,
} from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { BUBBLE_LOOKS, BUBBLE_SHAPES } from '@/core/schema';
import { insertImages, insertShape, insertText } from '../actions';
import { insertBubble } from '../bubbles/actions';
import { BubbleShapeIcon } from '../bubbles/BubbleShapeIcon';
import { refocusEditingText } from './caret';
import { insertCharacter } from '../character/actions';
import { BUTTON_PRESETS, insertButton, insertFlap, insertHotspot } from '../interaction/actions';
import { getSelectedElements } from '../store/selectors';

/** Floating "insert" bar at the top of the stage: text, images, characters, shapes, buttons. */
export function InsertToolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const characterRef = useRef<HTMLInputElement>(null);
  const flapRef = useRef<HTMLInputElement>(null);
  return (
    <div
      role="toolbar"
      aria-label="Insert"
      className="glass-strong absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-2xl p-1"
    >
      <Button variant="ghost" size="sm" onClick={() => insertText()}>
        <Type /> Text
      </Button>
      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
        <ImageIcon /> Image
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="insert-image-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void insertImages(files);
        }}
      />
      <Button variant="ghost" size="sm" onClick={() => characterRef.current?.click()}>
        <Smile /> Character
      </Button>
      <input
        ref={characterRef}
        type="file"
        accept="image/png,image/webp,image/gif,image/*"
        hidden
        data-testid="insert-character-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void insertCharacter(files);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <Shapes /> Shape
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onSelect={() => insertShape('rect')}>
            <Square /> Rectangle
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => insertShape('ellipse')}>
            <Circle /> Ellipse
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => insertShape('line')}>
            <Minus /> Line
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MessageCircle /> Bubble
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className="w-56"
          // The new bubble opens for typing: the keyboard goes to it, not back to the toolbar.
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            refocusEditingText();
          }}
        >
          {BUBBLE_SHAPES.map((shape) => (
            <DropdownMenuItem key={shape} onSelect={() => insertBubble(shape)}>
              <BubbleShapeIcon shape={shape} />
              {BUBBLE_LOOKS[shape].label}
            </DropdownMenuItem>
          ))}
          <p className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
            Select a character first to give it the line.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={flapRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="insert-flap-input"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void insertFlap(files);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MousePointerClick /> Button
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-60">
          {BUTTON_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => insertButton(p.id)}>
              <span className="grid">
                <span>{p.label}</span>
                <span className="text-xs text-muted-foreground">{p.hint}</span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              const selected = getSelectedElements();
              if (selected.length === 1 && selected[0]!.type === 'image') void insertFlap();
              else flapRef.current?.click();
            }}
          >
            <GalleryVerticalEnd />
            <span className="grid">
              <span>Lift-the-flap</span>
              <span className="text-xs text-muted-foreground">
                A flap hides a picture until it's tapped
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => insertHotspot()}>
            <SquareDashed />
            <span className="grid">
              <span>Tap area</span>
              <span className="text-xs text-muted-foreground">
                Invisible — make part of a picture tappable
              </span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
