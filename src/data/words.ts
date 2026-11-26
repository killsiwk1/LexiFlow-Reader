import { db } from "./db";
import { wordSchema, type Word, type Source, type Grade } from "./schema";
import type { Entry } from "./dictionary-store";
export const keyOf = (s: string) => s.trim().toLowerCase().replace(/’/g, "'");
export function newWord(word: string, entry?: Entry): Word {
  return {
    key: keyOf(word),
    word: word.trim(),
    phonetic: entry?.phonetic || "",
    partOfSpeech: entry?.pos || "",
    definitionZh: (entry?.translation || "").replace(/\\n/g, "\n"),
    definitionEn: (entry?.definition || "").replace(/\\n/g, "\n"),
    example: "",
    sources: [],
    createdAt: Date.now(),
    familiarity: "Again",
    reviewStatus: "new",
    due: Date.now(),
    interval: 0,
    ease: 2.5,
  };
}
export async function collect(word: string, source: Source, entry?: Entry) {
  const value = newWord(word, entry);
  await db.transaction("rw", db.words, async () => {
    const w = (await db.words.get(value.key)) || value;
    const existing = w.sources.find((s) => s.bookId === source.bookId);
    if (existing)
      existing.forms = [
        ...new Set([...(existing.forms ?? [w.word]), ...(source.forms || [])]),
      ];
    else w.sources.push(source);
    await db.words.put(wordSchema.parse(w));
  });
}
export async function removeWord(key: string) {
  await db.transaction("rw", db.words, db.reviews, async () => {
    await db.words.delete(key);
    await db.reviews.where("wordKey").equals(key).delete();
  });
}
export function schedule(w: Word, grade: Grade, at: number) {
  const ease = Math.max(
    1.3,
    Math.min(
      3.2,
      w.ease + { Again: -0.2, Hard: -0.15, Good: 0, Easy: 0.15 }[grade],
    ),
  );
  const interval = Math.min(
    3650,
    grade === "Again"
      ? 10 / 1440
      : grade === "Hard"
        ? Math.max(1, Math.round(w.interval * 1.2))
        : grade === "Good"
          ? Math.max(2, Math.round(w.interval * ease))
          : Math.max(4, Math.round(w.interval * ease * 1.35)),
  );
  return {
    familiarity: grade,
    reviewStatus:
      grade === "Again" ? ("learning" as const) : ("review" as const),
    ease,
    interval,
    due: at + Math.round(interval * 86400000),
  };
}
export async function rate(key: string, grade: Grade, expectedDue: number) {
  await db.transaction("rw", db.words, db.reviews, db.practice, async () => {
    const w = await db.words.get(key);
    if (!w || w.due !== expectedDue)
      throw Error("此词条已更新，请重新开始复习。");
    const at = Date.now(),
      next = schedule(w, grade, at);
    await db.words.update(key, next);
    await db.reviews.add({
      id: crypto.randomUUID(),
      wordKey: key,
      at,
      grade,
      due: next.due,
    });
    const run = await db.practice.get("active");
    if (run?.keys[0] === key)
      await db.practice.update("active", {
        keys: run.keys.slice(1),
        done: run.done + 1,
      });
  });
}
