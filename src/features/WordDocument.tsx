import { useEffect, useRef, useState } from "react";
import { db } from "../data/db";
import { wordAt } from "./wordAt";
export function WordDocument({
  id,
  page,
  offset,
  select,
  onDocument,
}: {
  id: string;
  page: number;
  offset: number;
  select: (word: string, context: string) => void;
  onDocument: (doc: Document | null) => void;
}) {
  const [markup, setMarkup] = useState(""),
    [error, setError] = useState("");
  const [doc, setDoc] = useState<Document | null>(null);
  const initial = useRef({ page, offset });
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    let active = true;
    import("../data/docx")
      .then((m) => m.openWord(id))
      .then((value) => {
        if (active) setMarkup(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!doc) return;
    onDocument(doc);
    const click = (e: MouseEvent) => {
      if (doc.getSelection()?.toString().trim()) return;
      const el = e.target as Element;
      if (el.closest("p"))
        wordAt(doc, e.clientX, e.clientY, el, (word, line) =>
          selectRef.current(word, el.closest("p")?.textContent || line),
        );
    };
    doc.addEventListener("click", click);
    return () => {
      doc.removeEventListener("click", click);
      onDocument(null);
    };
  }, [doc, onDocument]);
  useEffect(() => {
    const win = doc?.defaultView;
    if (!doc || !win) return;
    doc
      .querySelectorAll<HTMLElement>("section.word")
      .forEach((s, i) => (s.hidden = i !== page));
    win.scrollTo(0, initial.current.page === page ? initial.current.offset : 0);
    initial.current = { page: -1, offset: 0 };
    let timer: ReturnType<typeof setTimeout>;
    const persist = () => {
      void db.books
        .where("id")
        .equals(id)
        .filter((b) => b.page === page)
        .modify({ textOffset: Math.round(Math.max(0, win.scrollY)) });
    };
    const scroll = () => {
      clearTimeout(timer);
      timer = setTimeout(persist, 120);
    };
    win.addEventListener("scroll", scroll);
    return () => {
      clearTimeout(timer);
      win.removeEventListener("scroll", scroll);
      if (win.scrollY) persist();
    };
  }, [doc, page, id]);
  if (error) return <p role="alert">{error}</p>;
  if (!markup) return <p role="status">正在排版 Word 文档…</p>;
  return (
    <iframe
      className="word-frame"
      title="Word 文档正文"
      sandbox="allow-same-origin"
      srcDoc={markup}
      onLoad={(e) => setDoc(e.currentTarget.contentDocument)}
    />
  );
}
