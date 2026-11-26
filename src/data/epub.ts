import { unzipSync } from "fflate";
import type { Block, Book, NavItem, Page, Resource } from "./schema";
import { encodeBytes, storePublication } from "./publication";

const nodes = (node: Element | Document, tag: string) =>
  Array.from(node.getElementsByTagNameNS("*", tag));
function locationOf(base: string, href: string) {
  const url = new URL(href, new URL(base, "https://book.invalid/"));
  if (url.origin !== "https://book.invalid") return "";
  return (
    decodeURIComponent(url.pathname.slice(1)) + decodeURIComponent(url.hash)
  );
}
function parse(bytes: Uint8Array | undefined, path: string) {
  if (!bytes) throw Error("书中缺少文件：" + path);
  const doc = new DOMParser().parseFromString(
    new TextDecoder(
      bytes[0] === 255 && bytes[1] === 254
        ? "utf-16le"
        : bytes[0] === 254 && bytes[1] === 255
          ? "utf-16be"
          : "utf-8",
    ).decode(bytes),
    "application/xml",
  );
  if (nodes(doc, "parsererror").length)
    throw Error("无法解析书籍结构：" + path);
  return doc;
}
const imageTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;
export async function importEpub(file: File) {
  let total = 0,
    count = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      total += entry.originalSize;
      if (
        ++count > 16000 ||
        total > 160 * 1024 ** 2 ||
        entry.originalSize > 16 * 1024 ** 2
      )
        throw Error(
          "EPUB 展开后超过本机阅读上限（总计 160 MiB，单资源 16 MiB）。",
        );
      return !entry.name.endsWith("/");
    },
  });
  const xml = (path: string) => parse(files[path], path);
  const opf = nodes(xml("META-INF/container.xml"), "rootfile")[0]?.getAttribute(
    "full-path",
  );
  if (!opf) throw Error("EPUB 缺少出版物清单。");
  const pkg = xml(opf);
  const items = nodes(pkg, "item").map((el) => ({
    id: el.getAttribute("id"),
    path: locationOf(opf, el.getAttribute("href") || ""),
    mime: el.getAttribute("media-type") || "",
    props: el.getAttribute("properties") || "",
  }));
  const id = crypto.randomUUID(),
    pages: Page[] = [],
    chapters: NavItem[] = [],
    toc: NavItem[] = [];
  const anchors = new Map<string, NavItem>(),
    images = new Map<string, Resource>();
  let wordCount = 0;
  for (const ref of nodes(pkg, "itemref")) {
    const item = items.find((i) => i.id === ref.getAttribute("idref"));
    if (!item) throw Error("章节引用缺失。");
    const doc = xml(item.path),
      body = nodes(doc, "body")[0] || doc.documentElement;
    const chapter = {
      title: (
        nodes(body, "h1")[0]?.textContent ||
        nodes(doc, "title")[0]?.textContent ||
        "第 " + (chapters.length + 1) + " 章"
      )
        .trim()
        .slice(0, 1024),
      page: pages.length,
      paragraph: 0,
      depth: 0,
    };
    chapters.push(chapter);
    anchors.set(item.path, chapter);
    let blocks: Block[] = [],
      chars = 0,
      text = "",
      styles: NonNullable<Block["emphasis"]> = [],
      pending: string[] = [];
    function flushPage() {
      if (blocks.length) pages.push({ bookId: id, n: pages.length, blocks });
      blocks = [];
      chars = 0;
    }
    function add(block: Block) {
      if (blocks.length >= 70 || chars + block.text.length > 6500) flushPage();
      for (const key of pending)
        anchors.set(key, {
          ...chapter,
          page: pages.length,
          paragraph: blocks.length,
        });
      pending = [];
      blocks.push(block);
      chars += block.text.length;
    }
    function flush(kind: Block["kind"]) {
      if (text.trim()) {
        wordCount += (text.match(/[a-z]+(?:['’-][a-z]+)*/gi) || []).length;
        for (let start = 0; start < text.length; ) {
          let end = Math.min(start + 3000, text.length);
          if (end < text.length) {
            const space = text.lastIndexOf(" ", end);
            if (space > start + 1500) end = space;
          }
          add({
            kind,
            text: text.slice(start, end),
            emphasis: styles
              .filter((r) => r.end > start && r.start < end)
              .map((r) => ({
                ...r,
                start: Math.max(0, r.start - start),
                end: Math.min(end, r.end) - start,
              })),
          });
          start = end;
        }
      }
      text = "";
      styles = [];
    }
    function visit(node: Node, kind: Block["kind"]) {
      if (node.nodeType === 3 || node.nodeType === 4) {
        text += (node.textContent || "").replace(
          kind === "code" ? /\r/g : /\s+/g,
          kind === "code" ? "" : " ",
        );
        return;
      }
      if (node.nodeType !== 1) return;
      const el = node as Element,
        tag = el.localName.toLowerCase();
      if (
        [
          "script",
          "style",
          "head",
          "iframe",
          "object",
          "audio",
          "video",
          "noscript",
        ].includes(tag)
      )
        return;
      const sections: Record<string, Block["kind"]> = {
        p: "p",
        div: "p",
        section: "p",
        article: "p",
        h1: "h1",
        h2: "h2",
        h3: "h2",
        h4: "h2",
        h5: "h2",
        h6: "h2",
        li: "li",
        blockquote: "quote",
        pre: "code",
        tr: "p",
        figcaption: "p",
      };
      if (sections[tag]) flush(kind);
      if (el.id) pending.push(item!.path + "#" + el.id);
      if (tag === "img" || tag === "image") {
        flush(kind);
        const src =
          el.getAttribute("src") ||
          el.getAttribute("href") ||
          el.getAttribute("xlink:href") ||
          "";
        const path = locationOf(item!.path, src),
          mime = imageTypes.find((m) =>
            items.some((i) => i.path === path && i.mime === m),
          );
        if (mime && files[path]) {
          if (!images.has(path))
            images.set(path, {
              bookId: id,
              name: path,
              mime,
              data: encodeBytes(files[path]),
            });
          add({
            kind: "image",
            text: (el.getAttribute("alt") || "书中插图").slice(0, 3500),
            image: path,
          });
        }
        return;
      }
      if (tag === "br") {
        text += "\n";
        return;
      }
      const start = text.length;
      for (const child of Array.from(el.childNodes))
        visit(child, sections[tag] || kind);
      if (["em", "i", "strong", "b"].includes(tag) && text.length > start)
        styles.push({
          start,
          end: text.length,
          style: tag === "em" || tag === "i" ? "em" : "strong",
        });
      if (sections[tag]) flush(sections[tag]);
    }
    visit(body, "p");
    flush("p");
    if (!blocks.length && pages.length === chapter.page)
      add({ kind: "p", text: "（本章无可显示正文）" });
    flushPage();
  }
  if (!pages.length) throw Error("EPUB 没有可阅读的章节。");
  const nav = items.find((i) => i.props.split(/\s+/).includes("nav")),
    ncx = items.find((i) => i.mime === "application/x-dtbncx+xml");
  function navEntry(base: string, href: string, label: string, depth: number) {
    const path = locationOf(base, href),
      dest = anchors.get(path) || anchors.get(path.split("#")[0]);
    if (dest && label.trim())
      toc.push({ ...dest, title: label.trim().slice(0, 1024), depth });
  }
  if (nav) {
    const menus = nodes(xml(nav.path), "nav");
    const menu =
      menus.find((el) =>
        (el.getAttribute("epub:type") || "").split(/\s+/).includes("toc"),
      ) || menus[0];
    if (menu)
      for (const a of nodes(menu, "a")) {
        let depth = 0;
        for (let p = a.parentElement; p && p !== menu; p = p.parentElement)
          if (p.localName === "ol") depth++;
        navEntry(
          nav.path,
          a.getAttribute("href") || "",
          a.textContent || "",
          Math.max(0, depth - 1),
        );
      }
  } else if (ncx) {
    for (const pt of nodes(xml(ncx.path), "navPoint")) {
      let depth = 0;
      for (let p = pt.parentElement; p; p = p.parentElement)
        if (p.localName === "navPoint") depth++;
      navEntry(
        ncx.path,
        nodes(pt, "content")[0]?.getAttribute("src") || "",
        nodes(pt, "navLabel")[0]?.textContent || "",
        depth,
      );
    }
  }
  const now = Date.now();
  const book: Book = {
    id,
    title: (nodes(pkg, "title")[0]?.textContent?.trim() || file.name).slice(
      0,
      1024,
    ),
    fileName: file.name,
    format: "EPUB",
    pages: pages.length,
    page: 0,
    paragraph: 0,
    createdAt: now,
    openedAt: now,
    wordCount,
    chapters,
    toc: toc.length ? toc : chapters,
  };
  return storePublication(book, pages, [...images.values()]);
}
