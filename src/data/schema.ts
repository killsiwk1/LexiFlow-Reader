import { z } from "zod";
const id = z.string().min(1).max(160),
  text = z.string().max(100000),
  time = z.number().int().min(0).max(8640000000000000),
  index = z.number().int().nonnegative();
export const grades = ["Again", "Hard", "Good", "Easy"] as const;
export type Grade = (typeof grades)[number];
export const navSchema = z.object({
  title: z.string().max(1024),
  page: index,
  paragraph: index.default(0),
  depth: index.default(0),
});
export type NavItem = z.infer<typeof navSchema>;
export const bookSchema = z.object({
  id,
  title: z.string().min(1).max(1024),
  fileName: z.string().max(1024),
  format: z.enum(["TXT", "MD", "EPUB", "PDF", "DOCX"]),
  createdAt: time,
  openedAt: time,
  pages: index.min(1),
  page: index,
  paragraph: index,
  textOffset: index.optional(),
  wordCount: index,
  chapters: z.array(navSchema).optional(),
  toc: z.array(navSchema).optional(),
});
export const blockSchema = z.object({
  kind: z.enum(["p", "h1", "h2", "quote", "code", "li", "image"]),
  text: z.string().min(1).max(3500),
  image: z.string().max(2048).optional(),
  emphasis: z
    .array(
      z.object({ start: index, end: index, style: z.enum(["em", "strong"]) }),
    )
    .optional(),
});
export const pageSchema = z
  .object({
    bookId: id,
    n: index,
    blocks: z.array(blockSchema).min(1).max(100),
  })
  .refine(
    (p) => p.blocks.reduce((n, b) => n + b.text.length, 0) <= 7200,
    "正文页过大",
  );
const sourceSchema = z.object({
  bookId: id,
  title: text,
  context: text,
  forms: z.array(z.string().max(180)).max(1000).optional(),
});
export const wordSchema = z.object({
  key: z.string().trim().min(1).max(180),
  word: z.string().trim().min(1).max(180),
  phonetic: text,
  partOfSpeech: text,
  definitionZh: text,
  definitionEn: text,
  example: text,
  sources: z.array(sourceSchema),
  createdAt: time,
  familiarity: z.enum(grades),
  reviewStatus: z.enum(["new", "learning", "review"]),
  due: time,
  interval: z.number().finite().min(0).max(3650),
  ease: z.number().finite().min(1.3).max(3.2),
});
export const reviewSchema = z.object({
  id,
  wordKey: z.string().min(1).max(180),
  at: time,
  grade: z.enum(grades),
  due: time,
});
export const sessionSchema = z
  .object({ id, bookId: id, title: text, start: time, end: time })
  .refine((s) => s.end >= s.start && s.end - s.start <= 60000);
export const prefsSchema = z.object({
  id: z.literal("main"),
  theme: z.enum(["system", "light", "dark"]),
  font: z.enum(["serif", "sans-serif", "Georgia"]),
  size: z.number().int().min(14).max(32),
  readingTheme: z.enum(["paper", "white", "night"]).optional(),
  measure: z.number().int().min(480).max(1080).optional(),
  spacing: z.number().min(0.3).max(2).optional(),
  leading: z.number().min(1.4).max(2.6),
  homeMetrics: z.array(z.enum(["today", "total", "words", "due"])).max(4),
  dictionary: z.enum(["builtin", "installed"]),
});
export type Book = z.infer<typeof bookSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Word = z.infer<typeof wordSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Prefs = z.infer<typeof prefsSchema>;
export type Source = Word["sources"][number];
export const defaults: Prefs = {
  id: "main",
  theme: "system",
  font: "Georgia",
  size: 20,
  leading: 1.9,
  homeMetrics: ["today", "total", "words", "due"],
  dictionary: "builtin",
};
export const practiceSchema = z.object({
  id: z.literal("active"),
  keys: z.array(z.string().min(1).max(180)),
  done: index,
  skipped: index,
});
export type Practice = z.infer<typeof practiceSchema>;

export const resourceSchema = z.object({
  bookId: id,
  name: z.string().min(1).max(2048),
  mime: z.enum([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  data: z
    .string()
    .min(4)
    .max(24 * 1024 * 1024)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
export const sentenceSchema = z.object({
  id,
  bookId: id,
  title: text,
  page: index,
  paragraph: index.optional(),
  text: z.string().trim().min(1).max(8000),
  createdAt: time,
});
export type Resource = z.infer<typeof resourceSchema>;
export type Sentence = z.infer<typeof sentenceSchema>;

export function appTheme(prefs: Prefs) {
  return (
    prefs.readingTheme ??
    ({ system: "system", light: "white", dark: "night" } as const)[prefs.theme]
  );
}
