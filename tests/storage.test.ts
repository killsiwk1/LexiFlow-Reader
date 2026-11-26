import "fake-indexeddb/auto";
import { test, expect } from "vitest";
import { db } from "../src/data/db";
import { importBook } from "../src/data/books";
test("中文文件名、大文件、特殊字符、分页与数据库重开", async () => {
  const f = new File(
    [
      "# Reading\n" +
        ("Hello world & <script>字".repeat(100) + "\n").repeat(4600),
    ],
    "长篇 & 测试.md",
  );
  const b = await importBook(f);
  expect(b.pages).toBeGreaterThan(1000);
  expect(b.title).toBe("长篇 & 测试");
  await db.books.update(b.id, { page: 12, paragraph: 0 });
  db.close();
  await db.open();
  expect((await db.books.get(b.id))?.page).toBe(12);
  expect((await db.pages.get([b.id, 0]))?.blocks[0].kind).toBe("h1");
  await expect(
    importBook(new File([new Uint8Array([0, 1, 2])], "bad.txt")),
  ).rejects.toThrow();
  await expect(importBook(new File([" "], "空.txt"))).rejects.toThrow();
}, 30000);
