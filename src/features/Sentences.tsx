import { useEffect, useState, type RefObject } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { Book } from "../data/schema";
import { Modal } from "../ui";

export function SelectionActions({
  root,
  frameDocument,
  book,
  page,
  lookup,
}: {
  frameDocument?: Document | null;
  root: RefObject<HTMLDivElement>;
  book: Book;
  page: number;
  lookup: (word: string, context: string) => void;
}) {
  const [selection, setSelection] = useState({
      text: "",
      context: "",
      chunk: undefined as number | undefined,
      paragraph: undefined as number | undefined,
    }),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setSelection({
      text: "",
      context: "",
      chunk: undefined as number | undefined,
      paragraph: undefined as number | undefined,
    });
    setNotice("");
    function changed() {
      const s = (frameDocument ?? document).getSelection(),
        text = s?.toString().trim() || "";
      if (
        !s?.rangeCount ||
        !(frameDocument?.body ?? root.current)?.contains(
          s.getRangeAt(0).commonAncestorContainer,
        )
      ) {
        setSelection({
          text: "",
          context: "",
          chunk: undefined as number | undefined,
          paragraph: undefined as number | undefined,
        });
        return;
      }
      const node = s.anchorNode,
        element =
          node?.nodeType === 1 ? (node as Element) : node?.parentElement;
      const chunk =
        element?.closest<HTMLElement>("[data-chunk]")?.dataset.chunk;
      setSelection({
        chunk: chunk === undefined ? undefined : Number(chunk),
        paragraph:
          chunk === undefined
            ? undefined
            : Number(
                element?.closest<HTMLElement>("[data-paragraph]")?.dataset
                  .paragraph ?? 0,
              ),
        text,
        context: (
          element?.closest("[data-kind],.textLayer")?.textContent || text
        ).slice(0, 5000),
      });
    }
    const owner = frameDocument ?? document;
    owner.addEventListener("selectionchange", changed);
    return () => owner.removeEventListener("selectionchange", changed);
  }, [root, book.id, page, frameDocument]);
  const single = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(selection.text);
  return (
    <>
      {selection.text && (
        <div
          className="selection-actions"
          onMouseDown={(e) => e.preventDefault()}
        >
          {single && (
            <button onClick={() => lookup(selection.text, selection.context)}>
              查所选单词
            </button>
          )}
          <button
            disabled={selection.text.length > 8000}
            onClick={async () => {
              const text = selection.text;
              const savedPage = selection.chunk ?? page;
              await db.transaction("rw", db.sentences, async () => {
                const saved = await db.sentences
                  .where("[bookId+page]")
                  .equals([book.id, savedPage])
                  .toArray();
                if (!saved.some((s) => s.text === text))
                  await db.sentences.add({
                    id: crypto.randomUUID(),
                    bookId: book.id,
                    title: book.title,
                    page: savedPage,
                    paragraph: selection.paragraph,
                    text,
                    createdAt: Date.now(),
                  });
              });
              (frameDocument ?? document).getSelection()?.removeAllRanges();
              setNotice("句子已收藏");
            }}
          >
            {selection.text.length > 8000
              ? "请选择 8,000 字以内的摘录"
              : "收藏所选句子"}
          </button>
        </div>
      )}
      {notice && <small role="status">{notice}</small>}
    </>
  );
}
export function Sentences({
  bookId,
  close,
  jump,
}: {
  bookId?: string;
  close: () => void;
  jump?: (page: number, paragraph?: number) => void;
}) {
  const txtBooks = useLiveQuery(
    async () =>
      import.meta.env.MODE === "iphone"
        ? new Set(
            (await db.books.toArray())
              .filter((b) => b.format === "TXT")
              .map((b) => b.id),
          )
        : new Set<string>(),
    [],
  );
  const list = useLiveQuery(
    () =>
      bookId
        ? db.sentences
            .where("bookId")
            .equals(bookId)
            .reverse()
            .sortBy("createdAt")
        : db.sentences.orderBy("createdAt").reverse().toArray(),
    [bookId],
    [],
  );
  return (
    <Modal title="收藏句子" close={close}>
      {list.length ? (
        list.map((s) => (
          <article className="excerpt" key={s.id}>
            <p>{s.text}</p>
            <small>
              {s.title}
              {txtBooks?.has(s.bookId) ? "" : ` · 第 ${s.page + 1} 页`}
            </small>
            <div className="actions">
              {jump && (
                <button
                  onClick={() => {
                    jump(s.page, s.paragraph);
                    close();
                  }}
                >
                  {txtBooks?.has(s.bookId) ? "回到原文" : "回到原页"}
                </button>
              )}
              <button onClick={() => void db.sentences.delete(s.id)}>
                移除收藏
              </button>
            </div>
          </article>
        ))
      ) : (
        <p>选中正文中的句子后，可以将它收藏到这里。</p>
      )}
    </Modal>
  );
}
