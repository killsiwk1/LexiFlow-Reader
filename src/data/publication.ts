import { db } from "./db";
import type { Book, Page, Resource } from "./schema";

export function encodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
export function decodeBytes(data: string) {
  return Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
}
export async function storePublication(
  book: Book,
  pages: Page[],
  resources: Resource[],
) {
  await db.transaction("rw", [db.books, db.pages, db.resources], async () => {
    await db.books.add(book);
    await db.pages.bulkAdd(pages);
    await db.resources.bulkAdd(resources);
  });
  return book;
}

export async function readOriginal(bookId: string) {
  const parts = (
    await db.resources.where("bookId").equals(bookId).toArray()
  ).sort((a, b) => Number(a.name) - Number(b.name));
  const bytes = parts.map((p) => decodeBytes(p.data));
  const joined = new Uint8Array(bytes.reduce((sum, b) => sum + b.length, 0));
  let offset = 0;
  for (const b of bytes) {
    joined.set(b, offset);
    offset += b.length;
  }
  return joined;
}
export function originalParts(
  bookId: string,
  bytes: Uint8Array,
  mime: Resource["mime"],
) {
  const resources: Resource[] = [];
  const chunk = 1024 * 1024;
  for (let at = 0; at < bytes.length; at += chunk)
    resources.push({
      bookId,
      name: String(resources.length),
      mime,
      data: encodeBytes(bytes.subarray(at, at + chunk)),
    });
  return resources;
}
