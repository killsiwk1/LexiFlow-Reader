import "fake-indexeddb/auto";
import { test, expect } from "vitest";
import { db } from "../src/data/db";
import { newWord, rate, schedule } from "../src/data/words";
import { backup, restore } from "../src/data/backup";
import { grades } from "../src/data/schema";
import { timeIn } from "../src/features/Overview";
test("四档间隔、有序历史、重试保护、复习队列持久化", async () => {
  const w = newWord("light");
  await db.words.add(w);
  await db.practice.put({ id: "active", keys: [w.key], done: 0, skipped: 0 });
  const times = grades.map((g) => schedule(w, g, 1).due);
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  await rate(w.key, "Good", w.due);
  await expect(rate(w.key, "Easy", w.due)).rejects.toThrow();
  db.close();
  await db.open();
  expect((await db.practice.get("active"))?.done).toBe(1);
  expect(await db.reviews.count()).toBe(1);
  const b = await backup();
  await restore(b);
  expect(await db.reviews.count()).toBe(1);
  await restore({ ...b, databaseVersion: 1 });
  expect(await db.practice.count()).toBe(0);
  expect(
    timeIn(
      [{ id: "1", bookId: "a", title: "a", start: 980, end: 1040 }],
      1000,
      2000,
    ),
  ).toBe(40);
});
