import { wordAt } from "./wordAt";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";
import { loadPdf, pdfEngine } from "../data/pdf";

type Props = {
  navigation: React.ReactNode;
  outline: React.ReactNode;
  id: string;
  page: number;
  root: RefObject<HTMLDivElement>;
  go: (n: number) => void;
  select: (word: string, context: string) => void;
};
export function PdfPage({
  id,
  page,
  root,
  go,
  select,
  navigation,
  outline,
}: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy>(),
    [error, setError] = useState(""),
    [empty, setEmpty] = useState(false);
  const [original, setOriginal] = useState(false);
  const [zoom, setZoom] = useState(1),
    [area, setArea] = useState({ width: 0, height: 0 }),
    [query, setQuery] = useState(""),
    [term, setTerm] = useState(""),
    [hits, setHits] = useState<number[]>([]),
    [busy, setBusy] = useState(false);
  const drawing = useRef<HTMLDivElement>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      opened: PDFDocumentProxy | undefined;
    loadPdf(id)
      .then((d) => {
        opened = d;
        if (active) setDoc(d);
        else void d.destroy();
      })
      .catch((e) => {
        if (active) setError(String(e.message));
      });
    return () => {
      active = false;
      if (opened) void opened.destroy();
    };
  }, [id]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () =>
      setArea((old) =>
        old.width === el.clientWidth && old.height === el.clientHeight
          ? old
          : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [root]);
  const width = area.width;
  const fitHeight = zoom === 0 ? area.height : 0;
  const shownPage = useRef<number>();
  useEffect(() => {
    if (!doc || !width || !drawing.current) return;
    let active = true,
      task: RenderTask | undefined,
      layer: TextLayer | undefined;
    const host = drawing.current;
    setError("");
    host.inert = shownPage.current !== page;
    async function render() {
      const pdfPage = await doc!.getPage(page + 1),
        engine = await pdfEngine();
      if (!active) return;
      const one = pdfPage.getViewport({ scale: 1 }),
        scale = Math.min(
          zoom === 0
            ? Math.min((width - 20) / one.width, (fitHeight - 20) / one.height)
            : ((width - 20) / one.width) * zoom,
          4096 / Math.max(one.height, one.width),
        ),
        view = pdfPage.getViewport({ scale });
      const canvas = document.createElement("canvas"),
        text = document.createElement("div");
      text.className = "textLayer";
      const ratio = Math.min(
        devicePixelRatio || 1,
        2,
        4096 / Math.max(view.width, view.height),
      );
      canvas.width = Math.ceil(view.width * ratio);
      canvas.height = Math.ceil(view.height * ratio);
      task = pdfPage.render({
        canvasContext: canvas.getContext("2d")!,
        viewport: view,
        transform: [ratio, 0, 0, ratio, 0, 0],
      });
      await task.promise;
      if (!active) return;
      const previous = host.querySelector("canvas");
      host.style.width = view.width + "px";
      host.style.height = view.height + "px";
      host.style.setProperty("--scale-factor", String(scale));
      host.replaceChildren(canvas, text);
      host.inert = false;
      if (previous) previous.width = previous.height = 0;
      if (shownPage.current !== page && root.current) {
        root.current.scrollTop = 0;
        root.current.scrollLeft = 0;
      }
      shownPage.current = page;
      const content = await pdfPage.getTextContent();
      if (!active) return;
      layer = new engine.TextLayer({
        textContentSource: content,
        container: text,
        viewport: view,
      });
      await layer.render();
      if (active) {
        setEmpty(!content.items.some((i) => "str" in i && i.str.trim()));
        setRevision((n) => n + 1);
      }
    }
    void render().catch((e) => {
      if (active) setError("无法显示 PDF 页面：" + e.message);
    });
    return () => {
      active = false;
      task?.cancel();
      layer?.cancel();
    };
  }, [doc, page, zoom, width, fitHeight, root]);
  useEffect(() => {
    let active = true;
    setHits([]);
    setBusy(!!term && !!doc);
    if (!term || !doc) return;
    async function search() {
      const found: number[] = [];
      for (let i = 0; i < doc!.numPages && active; i++) {
        const p = await doc!.getPage(i + 1),
          c = await p.getTextContent();
        if (
          c.items
            .map((x) => ("str" in x ? x.str : ""))
            .join(" ")
            .toLocaleLowerCase()
            .includes(term.toLocaleLowerCase())
        )
          found.push(i);
      }
      if (active) {
        setHits(found);
        setBusy(false);
        if (found.length) go(found[0]);
      }
    }
    void search().catch((e) => {
      if (active) {
        setError("搜索失败：" + e.message);
        setBusy(false);
      }
    });
    return () => {
      active = false;
    };
  }, [term, doc]);
  useEffect(() => {
    for (const span of drawing.current?.querySelectorAll<HTMLElement>(
      ".textLayer span",
    ) || []) {
      span.classList.toggle(
        "pdf-hit",
        !!term &&
          !!span.textContent
            ?.toLocaleLowerCase()
            .includes(term.toLocaleLowerCase()),
      );
    }
  }, [term, revision]);
  function click(e: React.MouseEvent) {
    if (window.getSelection()?.toString().trim()) return;
    const target = e.target as HTMLElement;
    if (!target.closest(".textLayer span")) return;
    wordAt(document, e.clientX, e.clientY, target, select);
  }
  return (
    <div className={"pdf-reader" + (original ? " original-colors" : "")}>
      <div className="pdf-controls" role="toolbar" aria-label="PDF 工具栏">
        {outline}
        {navigation}
        <label>
          缩放{" "}
          <select
            aria-label="PDF 缩放"
            value={zoom}
            onChange={(e) => setZoom(+e.target.value)}
          >
            <option value={0}>适合整页</option>
            {[0.75, 1, 1.25, 1.5, 2].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "适合宽度" : Math.round(n * 100) + "%"}
              </option>
            ))}
          </select>
        </label>
        <button aria-pressed={original} onClick={() => setOriginal(!original)}>
          原页颜色
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(query.trim());
          }}
        >
          <input
            type="search"
            aria-label="PDF 文本搜索"
            placeholder="搜索这本 PDF"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value) setTerm("");
            }}
          />
          <button>搜索</button>
        </form>
      </div>
      {term && (
        <div className="pdf-results" role="status">
          {busy ? (
            "正在搜索…"
          ) : hits.length ? (
            <>
              匹配 {hits.length} 页{" "}
              <select
                aria-label="搜索结果"
                value={hits.includes(page) ? page : ""}
                onChange={(e) => go(+e.target.value)}
              >
                <option disabled value="">
                  跳至结果
                </option>
                {hits.map((n) => (
                  <option key={n} value={n}>
                    第 {n + 1} 页
                  </option>
                ))}
              </select>
            </>
          ) : (
            "未找到匹配文本"
          )}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {empty && (
        <small role="status">
          本页没有可选文字，可能是扫描件。可继续翻页和缩放，文本查词需要文字层。
        </small>
      )}
      <div className="pdf-scroll" ref={root} aria-label="PDF 页面">
        <div
          className="pdf-sheet"
          ref={drawing}
          onClick={click}
          style={{ "--scale-factor": 1 } as CSSProperties}
        />
      </div>
    </div>
  );
}
