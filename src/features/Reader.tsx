import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  BookOpen,
  Fullscreen,
  Minimize2,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { ContinuousText } from "./ContinuousText";
import { WordDocument } from "./WordDocument";
import { PdfPage } from "./PdfPage";
import { SelectionActions, Sentences } from "./Sentences";
import { PageText } from "./PageText";
import { db, savePrefs } from "../data/db";
import { deleteBook, importBook } from "../data/books";
import { lookup, type Lookup } from "../data/dictionary";
import { collect, keyOf } from "../data/words";
import { appTheme } from "../data/schema";
import type { Book, Prefs, Source } from "../data/schema";
import { Empty, ImportButton, Modal, navigate } from "../ui";

export async function openFile(f: File) {
  const book = await importBook(f);
  navigate("reader/" + book.id);
}
export function ArticleImport() {
  const native = import.meta.env.MODE !== "iphone";
  const accept =
    ".txt,.md,.markdown,.epub,.pdf" +
    (native
      ? ",.docx,text/plain,text/markdown,application/epub+zip,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "");
  return (
    <div className="article-import">
      <ImportButton accept={accept} onFile={openFile}>
        导入文章
      </ImportButton>
      {native && <small>支持 TXT、Markdown、EPUB、PDF、Word（.docx）</small>}
    </div>
  );
}
export function Library() {
  const books = useLiveQuery(
    () => db.books.orderBy("openedAt").reverse().toArray(),
    [],
    [],
  );
  const [sentences, setSentences] = useState(false);
  const [remove, setRemove] = useState<Book>(),
    [keep, setKeep] = useState(true);
  return (
    <>
      <div className="heading">
        <div>
          <h1>我的阅读室</h1>
          <p>书架中有 {books.length} 篇文章</p>
        </div>
        <button onClick={() => setSentences(true)}>收藏句子</button>
        <ArticleImport />
      </div>
      {books.length ? (
        <div className="list">
          {books.map((b) => (
            <div className="row" key={b.id}>
              <div className="miniicon">
                <BookOpen size={19} />
              </div>
              <button
                className="lead"
                onClick={() => navigate("reader/" + b.id)}
              >
                <span>
                  <span className="bookname">{b.title}</span>
                  <br />
                  <small>
                    {b.format} ·{" "}
                    {b.format !== "PDF" &&
                      b.wordCount.toLocaleString() + " 词 · "}
                    {import.meta.env.MODE === "iphone" && b.format === "TXT"
                      ? "连续阅读"
                      : `第 ${b.page + 1} / ${b.pages} 页`}
                  </small>
                </span>
              </button>
              <button
                className="icon"
                aria-label={"删除 " + b.title}
                onClick={() => {
                  setKeep(true);
                  setRemove(b);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="书架还是空的"
          text="导入本地书籍，在阅读时点词查看释义。"
        />
      )}
      {sentences && <Sentences close={() => setSentences(false)} />}
      {remove && (
        <Modal title="删除文章" close={() => setRemove(undefined)}>
          <p>从本机书架移除《{remove.title}》和已导入的正文副本。</p>
          <label>
            <input
              type="checkbox"
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />{" "}
            保留从这篇文章收藏的单词
          </label>
          <small>取消勾选后，仍被其他文章引用的单词会保留。</small>
          <button
            onClick={async () => {
              await deleteBook(remove.id, keep);
              setRemove(undefined);
            }}
          >
            确认删除文章
          </button>
        </Modal>
      )}
    </>
  );
}
export function ReaderPrefs({
  prefs,
  fixed = false,
  word = false,
}: {
  prefs: Prefs;
  fixed?: boolean;
  word?: boolean;
}) {
  return (
    <div className="stack">
      <fieldset className="theme-picker">
        <legend>全局主题</legend>
        {(
          [
            ["paper", "米黄色"],
            ["white", "纯白"],
            ["night", "深色"],
            ["system", "跟随系统"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={appTheme(prefs) === value}
            onClick={() =>
              void savePrefs({
                readingTheme: value === "system" ? undefined : value,
                theme:
                  value === "system"
                    ? "system"
                    : value === "night"
                      ? "dark"
                      : "light",
              })
            }
          >
            <i data-swatch={value} />
            {label}
          </button>
        ))}
      </fieldset>
      {!fixed && (
        <label className="field">
          阅读区域宽度 · {prefs.measure ?? 850} px
          <input
            aria-label="阅读区域宽度"
            type="range"
            min="480"
            max="1080"
            step="10"
            value={prefs.measure ?? 850}
            onChange={(e) => void savePrefs({ measure: +e.target.value })}
          />
        </label>
      )}
      {fixed ? (
        <small>
          {word
            ? "Word 文档按原文的段落、表格和页面设置排版。"
            : "PDF 保留原页版式。使用页面上的缩放调整文字大小。"}
        </small>
      ) : (
        <>
          <label className="field">
            阅读字体
            <select
              value={prefs.font}
              onChange={(e) =>
                void savePrefs({ font: e.target.value as Prefs["font"] })
              }
            >
              <option value="Georgia">Georgia</option>
              <option value="serif">系统衬线</option>
              <option value="sans-serif">系统无衬线</option>
            </select>
          </label>
          <label className="field">
            字号 · {prefs.size} px
            <input
              aria-label="字号"
              type="range"
              min="14"
              max="32"
              value={prefs.size}
              onChange={(e) => void savePrefs({ size: +e.target.value })}
            />
          </label>
          <label className="field">
            行间距 · {prefs.leading.toFixed(1)}
            <input
              aria-label="行间距"
              type="range"
              min="1.4"
              max="2.6"
              step=".1"
              value={prefs.leading}
              onChange={(e) => void savePrefs({ leading: +e.target.value })}
            />
          </label>
          <label className="field">
            段落间距 · {(prefs.spacing ?? 0.9).toFixed(1)} em
            <input
              aria-label="段落间距"
              type="range"
              min=".3"
              max="2"
              step=".1"
              value={prefs.spacing ?? 0.9}
              onChange={(e) => void savePrefs({ spacing: +e.target.value })}
            />
          </label>
        </>
      )}
    </div>
  );
}
function WordInfo({
  word,
  source,
  close,
}: {
  word: string;
  source: Source;
  close: () => void;
}) {
  const [query, setQuery] = useState(word),
    [result, setResult] = useState<Lookup>(),
    [err, setErr] = useState("");
  useEffect(() => {
    let active = true;
    setResult(undefined);
    setErr("");
    lookup(query).then(
      (r) => {
        if (active) setResult(r);
      },
      (e) => {
        if (active) setErr(String(e.message));
      },
    );
    return () => {
      active = false;
    };
  }, [query]);
  const entry = result?.entry,
    lemma = result?.lemma || entry?.word || query,
    key = keyOf(lemma);
  const saved = useLiveQuery(() => db.words.get(key), [key]);
  const linked = saved?.sources.some(
    (s) =>
      s.bookId === source.bookId &&
      (s.forms ?? [saved.word]).some((f) => keyOf(f) === keyOf(word)),
  );
  const meanings = (s: string) => s.replace(/\\n/g, "\n");
  return (
    <Modal title={query} close={close}>
      {!result && !err && <p>正在读取本地词典…</p>}
      {err && <p role="alert">{err}</p>}
      {entry && (
        <div className="dictdef">
          <div className="small">
            ECDICT · {entry.phonetic && "/" + entry.phonetic + "/"} {entry.pos}
          </div>
          {result?.lemma && <small>原形 {result.lemma}</small>}
          <div>{meanings(entry.translation) || "无中文释义"}</div>
          {entry.definition && (
            <details>
              <summary>英文释义</summary>
              {meanings(entry.definition)}
            </details>
          )}
          {entry.exchange && <small>词形　{entry.exchange}</small>}
          {(+entry.bnc > 0 || +entry.frq > 0) && (
            <small>
              词频排名　{+entry.bnc > 0 ? "BNC " + entry.bnc : ""}　
              {+entry.frq > 0 ? "COCA " + entry.frq : ""}
            </small>
          )}
        </div>
      )}
      {result && !entry && (
        <>
          <p>本地词典未收录此词。</p>
          {result.suggestions.length > 0 && (
            <div className="actions">
              拼写候选{" "}
              {result.suggestions.map((w) => (
                <button key={w} onClick={() => setQuery(w)}>
                  {w}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      <blockquote>{source.context}</blockquote>
      {result && (
        <div className="actions">
          {!linked ? (
            <button
              className="primary"
              onClick={() => void collect(lemma, source, entry)}
            >
              <Bookmark size={15} />
              {saved
                ? saved.sources.some((s) => s.bookId === source.bookId)
                  ? "标记生词"
                  : "关联此文章"
                : "收藏生词"}
            </button>
          ) : (
            <>
              <button
                onClick={async () => {
                  await db.transaction("rw", db.words, async () => {
                    const w = await db.words.get(key);
                    if (!w) return;
                    const sources = w.sources.map((s) =>
                      s.bookId === source.bookId
                        ? {
                            ...s,
                            forms: (s.forms ?? [w.word]).filter(
                              (f) => keyOf(f) !== keyOf(word),
                            ),
                          }
                        : s,
                    );
                    await db.words.update(key, { sources });
                  });
                }}
              >
                <Check size={15} />
                取消标记
              </button>
            </>
          )}
          {saved && (
            <button
              onClick={() => navigate("vocabulary/" + encodeURIComponent(key))}
            >
              查看生词详情
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
export function Reader({ id, prefs }: { id: string; prefs: Prefs }) {
  const book = useLiveQuery(() => db.books.get(id), [id]);
  const [page, setPage] = useState<number>(),
    [focus, setFocus] = useState(false),
    [styles, setStyles] = useState(false),
    [selected, setSelected] = useState<{ word: string; context: string }>();
  const [sentences, setSentences] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [showMarks, setShowMarks] = useState(false);
  const [wordDoc, setWordDoc] = useState<Document | null>(null);
  const content = useRef<HTMLDivElement>(null),
    anchor = useRef(0),
    restored = useRef(-1);
  const continuous =
    import.meta.env.MODE === "iphone" && book?.format === "TXT";
  const [textJump, setTextJump] = useState<{
    page: number;
    paragraph: number;
    textOffset: number;
    serial: number;
  }>();
  const data = useLiveQuery(
    () =>
      page === undefined || continuous ? undefined : db.pages.get([id, page]),
    [id, page, continuous],
  );
  const markedWords = useLiveQuery(
    async () =>
      (await db.words.toArray()).filter((w) =>
        w.sources.some(
          (s) =>
            s.bookId === id && (s.forms === undefined || s.forms.length > 0),
        ),
      ),
    [id],
    [],
  );
  const marks = new Set(
    markedWords.flatMap((w) =>
      w.sources
        .filter((s) => s.bookId === id)
        .flatMap((s) => (s.forms ?? [w.word]).map(keyOf)),
    ),
  );
  useEffect(() => {
    if (book && page === undefined) {
      anchor.current = book.paragraph;
      setPage(book.page);
      void db.books.update(id, { openedAt: Date.now() });
    }
  }, [book, id, page]);
  useLayoutEffect(() => {
    if (continuous || !data || data.n !== page || restored.current === page)
      return;
    const sc = content.current;
    if (!sc) return;
    restored.current = page;
    const el = sc.children[anchor.current] as HTMLElement | undefined;
    sc.scrollTop = el ? el.offsetTop : 0;
  }, [data, page]);
  useEffect(() => {
    if (!book || selected || styles || showMarks || sentences || tocOpen)
      return;
    const title = book.title;
    let start = Date.now(),
      active = !document.hidden && document.hasFocus(),
      lastInput = Date.now();
    function flush() {
      const now = Date.now();
      if (
        active &&
        now - lastInput < 180000 &&
        now > start &&
        now - start <= 60000
      )
        void db.sessions.add({
          id: crypto.randomUUID(),
          bookId: id,
          title,
          start,
          end: now,
        });
      start = now;
    }
    function change() {
      flush();
      active = !document.hidden && document.hasFocus();
      lastInput = Date.now();
    }
    function input() {
      lastInput = Date.now();
    }
    const timer = setInterval(flush, 5000);
    document.addEventListener("visibilitychange", change);
    window.addEventListener("blur", change);
    window.addEventListener("focus", change);
    for (const event of ["pointerdown", "wheel", "keydown", "touchmove"])
      window.addEventListener(event, input);
    return () => {
      clearInterval(timer);
      flush();
      document.removeEventListener("visibilitychange", change);
      window.removeEventListener("blur", change);
      window.removeEventListener("focus", change);
      for (const event of ["pointerdown", "wheel", "keydown", "touchmove"])
        window.removeEventListener(event, input);
    };
  }, [book?.id, id, selected, styles, showMarks, sentences, tocOpen]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    const fs = () => {
      if (!document.fullscreenElement) setFocus(false);
    };
    document.addEventListener("keydown", esc);
    document.addEventListener("fullscreenchange", fs);
    return () => {
      document.removeEventListener("keydown", esc);
      document.removeEventListener("fullscreenchange", fs);
    };
  }, []);
  if (!book || page === undefined)
    return (
      <>
        <button onClick={() => navigate("reader")}>返回书架</button>
        <p>正在读取文章，或文章已被移除。</p>
      </>
    );
  const isWord = book.format === "DOCX";
  function go(n: number, paragraph = 0) {
    if (!book || !Number.isInteger(n) || n < 0 || n >= book.pages) return;
    if (continuous) {
      setTextJump((old) => ({
        page: n,
        paragraph,
        textOffset: 0,
        serial: (old?.serial ?? 0) + 1,
      }));
      setPage(n);
      void db.books.update(id, { page: n, paragraph, textOffset: 0 });
      return;
    }
    if (book.format === "DOCX") {
      setPage(n);
      void db.books.update(id, { page: n, paragraph: 0, textOffset: 0 });
      return;
    }
    anchor.current = paragraph;
    restored.current = -1;
    if (n === page && content.current) {
      const el = content.current.children[paragraph] as HTMLElement | undefined;
      content.current.scrollTop = el?.offsetTop || 0;
    }
    setPage(n);
    void db.books.update(id, { page: n, paragraph });
  }
  const chapters = book.chapters || [],
    chapterIndex = chapters.reduce(
      (found, c, i) => (c.page <= page ? i : found),
      0,
    );
  const pagination = (
    <div className="pagination">
      <button
        aria-label="上一页"
        disabled={page === 0}
        onClick={() => go(page - 1)}
      >
        <ArrowLeft size={16} />
      </button>
      <label>
        第{" "}
        <input
          type="number"
          aria-label="跳至页码"
          key={page}
          defaultValue={page + 1}
          min={1}
          max={book.pages}
          onBlur={(e) => go(Number(e.target.value) - 1)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />{" "}
        / {book.pages} 页
      </label>
      <button
        aria-label="下一页"
        disabled={page + 1 === book.pages}
        onClick={() => go(page + 1)}
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
  return (
    <div
      className={
        "reading " +
        (isWord
          ? "word-view"
          : book.format === "PDF"
            ? "document-view"
            : book.format === "EPUB"
              ? "epub-view"
              : "classic-view") +
        (focus ? " immersive" : "")
      }
      style={
        {
          "--reading-width": (prefs.measure ?? 850) + "px",
          "--paragraph-space": (prefs.spacing ?? 0.9) + "em",
        } as CSSProperties
      }
    >
      <div className="readtools">
        <button className="plain" onClick={() => navigate("reader")}>
          <ArrowLeft size={16} />
          书架
        </button>
        <div className="actions">
          <button
            className="icon"
            aria-label="本文标记"
            onClick={() => setShowMarks(true)}
          >
            <Bookmark size={16} />
          </button>
          <button
            className="icon"
            aria-label="阅读排版"
            onClick={() => setStyles(true)}
          >
            <SlidersHorizontal size={16} />
          </button>
          <button
            className="icon"
            aria-label="沉浸阅读"
            onClick={() => {
              if (focus && document.fullscreenElement)
                void document.exitFullscreen();
              else if (!focus)
                void document.documentElement
                  .requestFullscreen?.()
                  .catch(() => {});
              setFocus(!focus);
            }}
          >
            {focus ? <Minimize2 size={16} /> : <Fullscreen size={16} />}
          </button>
        </div>
      </div>
      <h1>{book.title}</h1>
      {book.format !== "PDF" && !!book.toc?.length && (
        <div className="chapterbar">
          <button onClick={() => setTocOpen(true)}>目录</button>
          {chapters.length > 0 && (
            <>
              <span>{chapters[chapterIndex]?.title}</span>
              <button
                aria-label="上一章"
                disabled={!chapterIndex}
                onClick={() => go(chapters[chapterIndex - 1].page)}
              >
                上一章
              </button>
              <button
                aria-label="下一章"
                disabled={chapterIndex >= chapters.length - 1}
                onClick={() => go(chapters[chapterIndex + 1].page)}
              >
                下一章
              </button>
            </>
          )}
        </div>
      )}
      {tocOpen && (
        <Modal title="目录" close={() => setTocOpen(false)}>
          <div className="book-toc">
            {book.toc?.map((entry, i) => (
              <button
                key={i}
                style={{
                  paddingInlineStart: 10 + Math.min(entry.depth, 5) * 13,
                }}
                onClick={() => {
                  go(entry.page, entry.paragraph);
                  setTocOpen(false);
                }}
              >
                {entry.title}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {book.format !== "PDF" && (
        <small>
          {book.format}　·　
          {book.wordCount.toLocaleString()} 词
        </small>
      )}
      {book.format === "PDF" ? (
        <PdfPage
          navigation={pagination}
          outline={
            book.toc?.length ? (
              <button onClick={() => setTocOpen(true)}>目录</button>
            ) : null
          }
          id={id}
          page={page}
          root={content}
          go={go}
          select={(word, context) => setSelected({ word, context })}
        />
      ) : isWord ? (
        <WordDocument
          id={id}
          page={page}
          offset={book.textOffset ?? 0}
          select={(word, context) => setSelected({ word, context })}
          onDocument={setWordDoc}
        />
      ) : continuous ? (
        <ContinuousText
          key={textJump?.serial ?? 0}
          book={book}
          prefs={prefs}
          root={content}
          marks={marks}
          start={
            textJump ?? {
              page: book.page,
              paragraph: book.paragraph,
              textOffset: book.textOffset ?? 0,
            }
          }
          onPage={setPage}
          select={(word, context) => setSelected({ word, context })}
        />
      ) : (
        <div
          className="prose"
          tabIndex={0}
          aria-label="文章正文"
          ref={content}
          style={{
            fontFamily: prefs.font,
            fontSize: prefs.size,
            lineHeight: prefs.leading,
          }}
          onScroll={() => {
            if (!content.current || data?.n !== page) return;
            const sc = content.current;
            let i = 0;
            for (const el of Array.from(sc.children) as HTMLElement[]) {
              if (el.offsetTop + el.offsetHeight > sc.scrollTop + 3) break;
              i++;
            }
            const n = Math.min(i, sc.children.length - 1);
            if (n >= 0 && n !== anchor.current) {
              anchor.current = n;
              void db.books.update(id, { page, paragraph: n });
            }
          }}
        >
          {data?.n === page &&
            data.blocks.map((b, i) => (
              <PageText
                key={page + "-" + i}
                bookId={id}
                block={b}
                marks={marks}
                select={(word, context) => setSelected({ word, context })}
              />
            ))}
        </div>
      )}
      <SelectionActions
        frameDocument={wordDoc}
        root={content}
        book={book}
        page={page}
        lookup={(word, context) => setSelected({ word, context })}
      />
      {book.format !== "PDF" && !continuous && pagination}
      {showMarks && (
        <Modal title="本文标记" close={() => setShowMarks(false)}>
          <button
            onClick={() => {
              setShowMarks(false);
              setSentences(true);
            }}
          >
            收藏句子
          </button>
          {markedWords.length ? (
            markedWords.map((w) => (
              <button
                key={w.key}
                onClick={() =>
                  navigate("vocabulary/" + encodeURIComponent(w.key))
                }
              >
                {w.word}
              </button>
            ))
          ) : (
            <p>这篇文章还没有标记的单词。</p>
          )}
        </Modal>
      )}
      {sentences && (
        <Sentences bookId={id} close={() => setSentences(false)} jump={go} />
      )}
      {styles && (
        <Modal title="阅读排版" close={() => setStyles(false)}>
          <ReaderPrefs
            prefs={prefs}
            fixed={book.format === "PDF" || isWord}
            word={isWord}
          />
          {book.format !== "PDF" && !isWord && !continuous && (
            <label className="field">
              本页段落定位
              <select
                defaultValue={anchor.current}
                onChange={(e) => {
                  const n = Number(e.target.value),
                    sc = content.current;
                  if (sc) {
                    const target = sc.children[n] as HTMLElement;
                    sc.scrollTop = target.offsetTop;
                    anchor.current = n;
                    void db.books.update(id, { paragraph: n });
                  }
                  setStyles(false);
                }}
              >
                {data?.blocks.map((b, i) => (
                  <option key={i} value={i}>
                    {i + 1} · {b.text.slice(0, 42)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Modal>
      )}
      {selected && (
        <WordInfo
          word={selected.word}
          source={{
            bookId: id,
            title: book.title,
            context: selected.context,
            forms: [selected.word],
          }}
          close={() => setSelected(undefined)}
        />
      )}
    </div>
  );
}
