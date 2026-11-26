import { db } from "./db";
import { type Block, type Book, type Page } from "./schema";
export const MAX_FILE = 50 * 1024 * 1024;
export function paginate(raw: string, markdown: boolean, bookId: string) {
  const pages: Page[] = [];
  let blocks: Block[] = [],
    length = 0,
    words = 0,
    fenced = false;
  function flush() {
    if (blocks.length) pages.push({ bookId, n: pages.length, blocks });
    blocks = [];
    length = 0;
  }
  for (let line of raw.split(/\r\n?|\n/)) {
    line = line.trim();
    if (!line) continue;
    let kind: Block["kind"] = "p";
    if (markdown) {
      if (/^(```|~~~)/.test(line)) {
        fenced = !fenced;
        continue;
      }
      if (fenced) kind = "code";
      else {
        if (/^#{1,6}\s/.test(line)) kind = line.startsWith("# ") ? "h1" : "h2";
        else if (/^>\s?/.test(line)) kind = "quote";
        else if (/^([-*+]\s|\d+\.\s)/.test(line)) kind = "li";
        line = line
          .replace(/^(#{1,6}\s+|>\s?|[-*+]\s+|\d+\.\s+)/, "")
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/(\*\*|__)(.+?)\1/g, "$2")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1");
      }
    }
    words += (line.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
    while (line.length) {
      let end = Math.min(3200, line.length);
      if (end < line.length) {
        const space = line.lastIndexOf(" ", end);
        if (space > 1600) end = space;
      }
      const text = line.slice(0, end).trim();
      line = line.slice(end).trimStart();
      if (!text) continue;
      if (length + text.length > 6800 || blocks.length >= 80) flush();
      blocks.push({ kind, text });
      length += text.length;
    }
  }
  flush();
  return { pages, words };
}
export async function importBook(file: File) {
  if (!file.size || file.size > MAX_FILE)
    throw Error("文件为空或超过 50 MiB。");
  if (/\.docx$/i.test(file.name) && import.meta.env.MODE !== "iphone")
    return (await import("./docx")).importWord(file);
  if (/\.pdf$/i.test(file.name)) return (await import("./pdf")).importPdf(file);
  if (/\.epub$/i.test(file.name))
    return (await import("./epub")).importEpub(file);
  if (!/\.(txt|md|markdown)$/i.test(file.name))
    throw Error("请选择支持的本地书籍文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sample = bytes.subarray(0, 512);
  const zeroes = (parity: number) =>
    sample.reduce(
      (n, byte, i) => n + Number(byte === 0 && i % 2 === parity),
      0,
    );
  let encoding = "utf-8";
  if (
    (bytes[0] === 255 && bytes[1] === 254) ||
    (zeroes(1) > sample.length / 4 && !zeroes(0))
  )
    encoding = "utf-16le";
  else if (
    (bytes[0] === 254 && bytes[1] === 255) ||
    (zeroes(0) > sample.length / 4 && !zeroes(1))
  )
    encoding = "utf-16be";
  let raw: string;
  try {
    raw = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    if (encoding !== "utf-8" || /\.(md|markdown)$/i.test(file.name))
      throw Error("无法识别编码，请另存为 UTF-8 后导入。");
    // Common legacy exports from Chinese and Western Windows editors.
    try {
      raw = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
      if (!/[\u3400-\u9fff]/.test(raw)) throw Error();
    } catch {
      raw = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  if (/[\x00-\x08\x0e-\x1f]/.test(raw)) throw Error("文件包含二进制内容。");
  const id = crypto.randomUUID(),
    md = !/\.txt$/i.test(file.name);
  const { pages, words } = paginate(raw, md, id);
  if (!pages.length) throw Error("没有找到可阅读的正文。");
  const now = Date.now(),
    book: Book = {
      id,
      title: file.name.replace(/\.[^.]+$/, "") || file.name,
      fileName: file.name,
      format: md ? "MD" : "TXT",
      createdAt: now,
      openedAt: now,
      pages: pages.length,
      page: 0,
      paragraph: 0,
      wordCount: words,
    };
  await db.transaction("rw", db.books, db.pages, async () => {
    await db.books.add(book);
    await db.pages.bulkAdd(pages);
  });
  return book;
}
export async function deleteBook(id: string, keep: boolean) {
  await db.transaction(
    "rw",
    [db.books, db.pages, db.words, db.reviews, db.resources],
    async () => {
      if (!keep)
        for (const w of await db.words.toArray()) {
          if (!w.sources.some((s) => s.bookId === id)) continue;
          const sources = w.sources.filter((s) => s.bookId !== id);
          if (sources.length) await db.words.update(w.key, { sources });
          else {
            await db.words.delete(w.key);
            await db.reviews.where("wordKey").equals(w.key).delete();
          }
        }
      await db.pages.where("bookId").equals(id).delete();
      await db.resources.where("bookId").equals(id).delete();
      await db.books.delete(id);
    },
  );
}
