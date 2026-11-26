import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, test } from "vitest";
import { Library } from "../src/data/db";
import { backup, restore, validateBackup } from "../src/data/backup";
import { newWord } from "../src/data/words";
test("v2 数据库原地升级，旧 JSON 可恢复，缺失 PDF 资源时保留现有数据", async () => {
  const old = new Dexie("v11-upgrade");
  old
    .version(2)
    .stores({
      books: "id,openedAt,createdAt",
      pages: "[bookId+n],bookId",
      words: "key,createdAt,due,familiarity",
      reviews: "id,wordKey,at",
      sessions: "id,bookId,start",
      settings: "id",
      practice: "id",
    });
  const word = newWord("garden");
  await old.table("words").add(word);
  await old
    .table("practice")
    .add({ id: "active", keys: ["garden"], done: 0, skipped: 0 });
  old.close();
  const updated = new Library("v11-upgrade");
  expect(await updated.words.get("garden")).toEqual(word);
  expect((await updated.practice.get("active"))?.keys).toEqual(["garden"]);
  expect(await updated.resources.count()).toBe(0);
  updated.close();
  const snapshot = await backup();
  const { resources, sentences, ...v2 } = snapshot;
  await restore({ ...v2, databaseVersion: 2, words: [word] });
  expect((await backup()).words).toEqual([word]);
  const bad = {
    ...snapshot,
    books: [
      {
        id: "lost",
        title: "Missing",
        fileName: "lost.pdf",
        format: "PDF",
        createdAt: 1,
        openedAt: 1,
        pages: 1,
        page: 0,
        paragraph: 0,
        wordCount: 0,
      },
    ],
  };
  expect(() => validateBackup(bad)).toThrow(/PDF/);
  expect((await backup()).words).toEqual([word]);
});
