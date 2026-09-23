import { Circle, Image as ImageIcon, Minus, Shapes, Square, Type } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu';
import { insertImages, insertShape, insertText } from '../actions';

/** Floating "insert" bar at the top of the stage: text, image upload, basic shapes. */
export function InsertToolbar() {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div
      role="toolbar"
      aria-label="Insert"
      className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border bg-popover p-1 shadow-md"
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
    </div>
  );
}
