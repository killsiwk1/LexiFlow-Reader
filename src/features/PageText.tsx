import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { Block } from "../data/schema";
import { keyOf } from "../data/words";

function Illustration({ bookId, block }: { bookId: string; block: Block }) {
  const image = useLiveQuery(
    () => db.resources.get([bookId, block.image!]),
    [bookId, block.image],
  );
  return image ? (
    <img
      className="book-image"
      alt={block.text}
      src={`data:${image.mime};base64,${image.data}`}
    />
  ) : (
    <span>{block.text}</span>
  );
}
export function PageText({
  chunk,
  paragraph,
  bookId,
  block,
  marks,
  select,
}: {
  chunk?: number;
  paragraph?: number;
  bookId: string;
  block: Block;
  marks: Set<string>;
  select: (word: string, context: string) => void;
}) {
  let offset = 0;
  return (
    <div
      data-chunk={chunk}
      data-paragraph={paragraph}
      data-kind={block.kind}
      onClick={(e) => {
        if (window.getSelection()?.toString().trim()) return;
        const word = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-word]",
        )?.dataset.word;
        if (word) select(word, block.text);
      }}
    >
      {block.kind === "image" ? (
        <Illustration bookId={bookId} block={block} />
      ) : (
        block.text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g).map((t, j) => {
          const start = offset;
          offset += t.length;
          const styles = block.emphasis?.filter(
            (r) => r.end > start && r.start < offset,
          );
          const style = styles?.length
            ? {
                fontWeight: styles.some((s) => s.style === "strong")
                  ? 700
                  : undefined,
                fontStyle: styles.some((s) => s.style === "em")
                  ? "italic"
                  : undefined,
              }
            : undefined;
          return j % 2 ? (
            <span
              key={j}
              style={style}
              className={marks.has(keyOf(t)) ? "token marked" : "token"}
              role="button"
              tabIndex={0}
              data-word={t}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(t, block.text);
                }
              }}
            >
              {t}
            </span>
          ) : (
            t
          );
        })
      )}
    </div>
  );
}
