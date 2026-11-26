import "fake-indexeddb/auto";
import { expect, test } from "vitest";
import { backup, restore, validateBackup, csv } from "../src/data/backup";
import { importBook, deleteBook } from "../src/data/books";
import { collect } from "../src/data/words";
import { db } from "../src/data/db";
test("跨文章去重、JSON 往返、损坏恢复回滚、CSV 转义、选择性删除", async () => {
  const first = await importBook(new File(["light"], "一.txt")),
    second = await importBook(new File(["# Light"], "二.md"));
  for (const b of [first, second])
    await collect("Light", {
      bookId: b.id,
      title: b.title,
      context: "A light.",
    });
  expect(await db.words.count()).toBe(1);
  const original = await backup();
  expect(original.words[0].sources.length).toBe(2);
  await db.words.clear();
  await restore(JSON.parse(JSON.stringify(original)));
  expect((await backup()).words).toEqual(original.words);
  await expect(restore({ ...original, pages: [] })).rejects.toThrow();
  expect((await backup()).books).toEqual(original.books);
  expect(() => validateBackup({ ...original, databaseVersion: 99 })).toThrow();
  expect(csv([{ ...original.words[0], example: '="light",x' }])).toContain(
    '"\'=""light"",x"',
  );
  await deleteBook(first.id, false);
  expect((await db.words.get("light"))?.sources.length).toBe(1);
  await deleteBook(second.id, true);
  expect(await db.words.count()).toBe(1);
});
