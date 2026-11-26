import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { Book, Prefs } from "../data/schema";
import { PageText } from "./PageText";

type Position = { page: number; paragraph: number; textOffset: number };

export function ContinuousText({
  book,
  start,
  prefs,
  root,
  marks,
  select,
  onPage,
}: {
  book: Book;
  start: Position;
  prefs: Prefs;
  root: RefObject<HTMLDivElement>;
  marks: Set<string>;
  select: (word: string, context: string) => void;
  onPage: (n: number) => void;
}) {
  // The database chunks also address old bookmarks. Only nearby chunks need word buttons.
  const [center, setCenter] = useState(start.page);
  const position = useRef(start);
  const pending = useRef<Position>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const first = Math.max(0, center - 2),
    last = Math.min(book.pages - 1, center + 2);
  const chunks = useLiveQuery(
    () =>
      db.pages
        .where("[bookId+n]")
        .between([book.id, first], [book.id, last], true, true)
        .toArray(),
    [book.id, first, last],
  );
  useEffect(() => {
    const flush = () => {
      clearTimeout(timer.current);
      if (pending.current) {
        void db.books.update(book.id, pending.current);
        pending.current = undefined;
      }
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [book.id]);
  useLayoutEffect(() => {
    const sc = root.current,
      p = position.current;
    const el = sc?.querySelector<HTMLElement>(
      `[data-chunk="${p.page}"][data-paragraph="${p.paragraph}"]`,
    );
    if (sc && el)
      sc.scrollTop = el.offsetTop + Math.min(p.textOffset, el.offsetHeight - 1);
  }, [chunks, root]);

  function scroll() {
    const sc = root.current;
    if (!sc || !chunks?.length) return;
    const children = sc.children;
    let low = 0,
      high = children.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >>> 1;
      if ((children[mid] as HTMLElement).offsetTop <= sc.scrollTop + 1)
        low = mid;
      else high = mid - 1;
    }
    const el = children[low] as HTMLElement;
    const page = Number(el.dataset.chunk),
      paragraph = Number(el.dataset.paragraph);
    const textOffset = Math.max(0, Math.round(sc.scrollTop - el.offsetTop));
    const previous = position.current;
    if (
      page === previous.page &&
      paragraph === previous.paragraph &&
      textOffset === previous.textOffset
    )
      return;
    position.current = pending.current = { page, paragraph, textOffset };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (pending.current) void db.books.update(book.id, pending.current);
      pending.current = undefined;
    }, 160);
    if (page !== previous.page) onPage(page);
    if (Math.abs(page - center) >= 1) setCenter(page);
  }
  return (
    <div
      ref={root}
      className="prose continuous-text"
      aria-label="文章正文"
      tabIndex={0}
      style={{
        fontFamily: prefs.font,
        fontSize: prefs.size,
        lineHeight: prefs.leading,
      }}
      onScroll={scroll}
    >
      {chunks?.flatMap((chunk) =>
        chunk.blocks.map((block, paragraph) => (
          <PageText
            key={chunk.n + "-" + paragraph}
            chunk={chunk.n}
            paragraph={paragraph}
            bookId={book.id}
            block={block}
            marks={marks}
            select={select}
          />
        )),
      )}
    </div>
  );
}
