export function wordAt(
  doc: Document,
  x: number,
  y: number,
  target: Element,
  select: (word: string, context: string) => void,
) {
  const api = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
  };
  const r = api.caretRangeFromPoint?.(x, y),
    p = r
      ? { offsetNode: r.startContainer, offset: r.startOffset }
      : api.caretPositionFromPoint?.(x, y);
  if (!p || !target.contains(p.offsetNode)) return;
  const line = p.offsetNode.textContent || "";
  for (const match of line.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g))
    if (
      p.offset >= match.index! &&
      p.offset <= match.index! + match[0].length
    ) {
      select(match[0], line);
      break;
    }
}
