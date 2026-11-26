import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, test } from "vitest";
import { Library, db } from "../src/data/db";
import { newWord } from "../src/data/words";
import { backup, restore } from "../src/data/backup";

test("v1 IndexedDB 原地升级会保留词条并添加复习队列", async () => {
  const name = "LexiFlow-upgrade-test";
  const old = new Dexie(name);
  old.version(1).stores({
    books: "id,openedAt,createdAt",
    pages: "[bookId+n],bookId",
    words: "key,createdAt,due,familiarity",
    reviews: "id,wordKey,at",
    sessions: "id,bookId,start",
    settings: "id",
  });
  const original = newWord("persist");
  await old.table("words").add(original);
  old.close();
  const current = new Library(name);
  expect(await current.words.get("persist")).toEqual(original);
  expect(await current.practice.count()).toBe(0);
  current.close();
});

test("恢复写入中断会回滚所有表", async () => {
  const original = newWord("original");
  await db.words.put(original);
  const snapshot = await backup();
  const fail = () => {
    throw Error("模拟存储写入失败");
  };
  db.words.hook("creating", fail);
  try {
    await expect(
      restore({ ...snapshot, words: [newWord("replacement")] }),
    ).rejects.toThrow();
  } finally {
    db.words.hook("creating").unsubscribe(fail);
  }
  expect(await db.words.get(original.key)).toEqual(original);
  expect(await db.words.get("replacement")).toBeUndefined();
});
