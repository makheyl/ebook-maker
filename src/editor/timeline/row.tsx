/** Shared layout of the timeline's rows. */
export const LABEL_W = 176;
export const ROW_H = 32;

/** One timeline row: a sticky label column and the lane's area. */
export function Row({
  label,
  width,
  children,
  onDoubleClick,
  testId,
}: {
  label: React.ReactNode;
  width: number;
  children?: React.ReactNode;
  onDoubleClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  testId?: string;
}) {
  return (
    <div className="flex border-b border-border/60" style={{ height: ROW_H }} data-testid={testId}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-surface"
        style={{ width: LABEL_W }}
      >
        {label}
      </div>
      <div className="relative" style={{ width }} onDoubleClick={onDoubleClick}>
        {children}
      </div>
    </div>
  );
}
