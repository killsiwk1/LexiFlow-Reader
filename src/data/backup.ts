import { z } from "zod";
import { db } from "./db";
import {
  bookSchema,
  resourceSchema,
  sentenceSchema,
  pageSchema,
  wordSchema,
  reviewSchema,
  sessionSchema,
  prefsSchema,
  practiceSchema,
  type Word,
} from "./schema";
import { keyOf } from "./words";
const schema = z.object({
  application: z.literal("LexiFlow"),
  databaseVersion: z.literal(3),
  resources: z.array(resourceSchema),
  sentences: z.array(sentenceSchema),
  practice: z.array(practiceSchema).max(1),
  exportedAt: z.string().datetime(),
  books: z.array(bookSchema),
  pages: z.array(pageSchema),
  words: z.array(wordSchema),
  reviews: z.array(reviewSchema),
  sessions: z.array(sessionSchema),
  settings: z.array(prefsSchema).max(1),
});
export type Backup = z.infer<typeof schema>;
export async function backup(): Promise<Backup> {
  return db.transaction("r", db.tables, async () => ({
    application: "LexiFlow" as const,
    databaseVersion: 3 as const,
    resources: await db.resources.toArray(),
    sentences: await db.sentences.toArray(),
    practice: await db.practice.toArray(),
    exportedAt: new Date().toISOString(),
    books: await db.books.toArray(),
    pages: await db.pages.toArray(),
    words: await db.words.toArray(),
    reviews: await db.reviews.toArray(),
    sessions: await db.sessions.toArray(),
    settings: await db.settings.toArray(),
  }));
}
function unique(keys: string[]) {
  if (new Set(keys).size !== keys.length) throw Error("备份含重复记录。");
}
export function validateBackup(raw: unknown) {
  let input = raw;
  if (
    raw &&
    typeof raw === "object" &&
    "databaseVersion" in raw &&
    (raw.databaseVersion === 1 || raw.databaseVersion === 2)
  )
    input = {
      ...raw,
      ...(raw.databaseVersion === 1 ? { practice: [] } : {}),
      databaseVersion: 3,
      resources: [],
      sentences: [],
    };
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw Error("备份格式、字段或数据库版本不受支持。");
  const b = parsed.data;
  for (const keys of [
    b.books.map((v) => v.id),
    b.resources.map((r) => JSON.stringify([r.bookId, r.name])),
    b.sentences.map((v) => v.id),
    b.words.map((v) => v.key),
    b.reviews.map((v) => v.id),
    b.sessions.map((v) => v.id),
  ])
    unique(keys);
  const books = new Map(b.books.map((book) => [book.id, book])),
    words = new Set(b.words.map((w) => w.key));
  const pages = new Map<string, Set<number>>();
  for (const p of b.pages) {
    const book = books.get(p.bookId);
    if (!book || p.n >= book.pages) throw Error("正文页引用无效。");
    const set = pages.get(p.bookId) || new Set<number>();
    if (set.has(p.n)) throw Error("正文页重复。");
    set.add(p.n);
    pages.set(p.bookId, set);
    if (p.n === book.page && book.paragraph >= p.blocks.length)
      throw Error("段落位置无效。");
  }
  for (const book of b.books)
    if (
      (book.format !== "PDF" &&
        book.format !== "DOCX" &&
        pages.get(book.id)?.size !== book.pages) ||
      book.page >= book.pages ||
      [...(book.chapters || []), ...(book.toc || [])].some(
        (el) => el.page >= book.pages,
      )
    )
      throw Error("文章正文不完整或页码无效。");
  if (
    b.words.some((w) => w.key !== keyOf(w.word)) ||
    b.reviews.some((r) => !words.has(r.wordKey))
  )
    throw Error("词条或复习历史的关联无效。");
  const resources = new Map(
    b.resources.map((r) => [JSON.stringify([r.bookId, r.name]), r]),
  );
  for (const r of b.resources)
    if (!books.has(r.bookId) || r.data.length % 4 !== 0)
      throw Error("书籍资源无效。");
  for (const p of b.pages)
    for (const block of p.blocks)
      if (
        block.image &&
        !resources.has(JSON.stringify([p.bookId, block.image]))
      )
        throw Error("缺少书籍插图。");
  for (const book of b.books.filter(
    (v) => v.format === "PDF" || v.format === "DOCX",
  )) {
    const chunks = b.resources.filter((r) => r.bookId === book.id);
    if (
      !chunks.length ||
      chunks.some(
        (_, i) =>
          resources.get(JSON.stringify([book.id, String(i)]))?.mime !==
          (book.format === "PDF"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      )
    )
      throw Error(`缺少 ${book.format} 原文件。`);
  }
  return b;
}
export async function restore(raw: unknown) {
  const b = validateBackup(raw);
  await db.transaction("rw", db.tables, async () => {
    for (const table of db.tables) await table.clear();
    await db.resources.bulkAdd(b.resources);
    await db.sentences.bulkAdd(b.sentences);
    await db.practice.bulkAdd(b.practice);
    await db.books.bulkAdd(b.books);
    await db.pages.bulkAdd(b.pages);
    await db.words.bulkAdd(b.words);
    await db.reviews.bulkAdd(b.reviews);
    await db.sessions.bulkAdd(b.sessions);
    await db.settings.bulkAdd(b.settings);
  });
}
export function csv(words: Word[]) {
  const fields = [
    "word",
    "phonetic",
    "partOfSpeech",
    "definitionZh",
    "definitionEn",
    "example",
    "source",
    "createdAt",
    "familiarity",
    "reviewStatus",
    "due",
  ];
  const cell = (v: string) =>
    '"' + (/^[=+@\-\t\r]/.test(v) ? "'" : "") + v.replace(/"/g, '""') + '"';
  return (
    "\uFEFF" +
    [
      fields,
      ...words.map((w) => [
        w.word,
        w.phonetic,
        w.partOfSpeech,
        w.definitionZh,
        w.definitionEn,
        w.example,
        w.sources.map((s) => s.title).join(" | "),
        new Date(w.createdAt).toISOString(),
        w.familiarity,
        w.reviewStatus,
        new Date(w.due).toISOString(),
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export async function saveFile(name: string, data: string, type: string) {
  const blob = new Blob([data], { type });
  if ("__TAURI_INTERNALS__" in window) {
    const { save } = await import("@tauri-apps/plugin-dialog"),
      { writeFile } = await import("@tauri-apps/plugin-fs");
    const dir = localStorage.getItem("lexiflow-export-directory") || "";
    const path = await save({
      defaultPath: dir + name,
      filters: [{ name: type, extensions: [name.split(".").pop()!] }],
    });
    if (!path) return false;
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    if (!path.includes("://"))
      localStorage.setItem(
        "lexiflow-export-directory",
        path.slice(
          0,
          Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
        ),
      );
    return true;
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
