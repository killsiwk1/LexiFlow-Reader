import Dexie, { type Table } from "dexie";
import {
  defaults,
  type Book,
  type Resource,
  type Sentence,
  type Page,
  type Word,
  type Session,
  type Review,
  type Prefs,
  type Practice,
} from "./schema";
export class Library extends Dexie {
  resources!: Table<Resource, [string, string]>;
  sentences!: Table<Sentence, string>;
  books!: Table<Book, string>;
  pages!: Table<Page, [string, number]>;
  words!: Table<Word, string>;
  reviews!: Table<Review, string>;
  sessions!: Table<Session, string>;
  settings!: Table<Prefs, string>;
  practice!: Table<Practice, string>;
  constructor(name = "LexiFlow-Library") {
    super(name);
    this.version(1).stores({
      books: "id,openedAt,createdAt",
      pages: "[bookId+n],bookId",
      words: "key,createdAt,due,familiarity",
      reviews: "id,wordKey,at",
      sessions: "id,bookId,start",
      settings: "id",
    });
    this.version(2).stores({ practice: "id" });
    this.version(3).stores({
      resources: "[bookId+name],bookId",
      sentences: "id,bookId,[bookId+page],createdAt",
    });
  }
}
export const db = new Library();
export async function savePrefs(patch: Partial<Omit<Prefs, "id">>) {
  await db.transaction("rw", db.settings, async () => {
    await db.settings.put({
      ...defaults,
      ...(await db.settings.get("main")),
      ...patch,
    });
  });
}
