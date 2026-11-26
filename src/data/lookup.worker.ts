import init, { type Database } from "sql.js";
import wasm from "sql.js/dist/sql-wasm.wasm?url";
import { gunzipSync } from "fflate";
import {
  shard,
  type Entry,
  type Manifest,
  type Lookup,
} from "./dictionary-store";
import type { Prefs } from "./schema";
const engine = init({
  locateFile: () => wasm,
  useOldExtensionFunctions: false,
});
const cache = new Map<string, Database>();
type Request = {
  word: string;
  mode: Prefs["dictionary"];
  manifest: Manifest;
  id: number;
};
function bucket(word: string) {
  let n = 0;
  for (const ch of [...word.toLowerCase()].slice(0, 3))
    n = n * 31 + ch.codePointAt(0)!;
  return n % 128;
}
async function database(req: Request, w: string) {
  const i = bucket(w),
    key = req.manifest.parts[i].sha256;
  let d = cache.get(key);
  if (!d) {
    const bytes = await shard(req.mode, i, req.manifest);
    const tail = new DataView(bytes).getUint32(bytes.byteLength - 4, true);
    if (tail !== req.manifest.parts[i].raw) throw Error("词典尺寸错误。");
    const sql = await engine;
    d = new sql.Database(gunzipSync(new Uint8Array(bytes)));
    d.run("PRAGMA query_only=ON");
    if (cache.size >= 3) {
      const first = cache.keys().next().value!;
      cache.get(first)!.close();
      cache.delete(first);
    }
    cache.set(key, d);
  }
  return d;
}
function rows(d: Database, query: string, args: string[]) {
  const st = d.prepare(query);
  try {
    st.bind(args);
    const data: Record<string, unknown>[] = [];
    while (st.step()) data.push(st.getAsObject());
    return data;
  } finally {
    st.free();
  }
}
async function exact(req: Request, w: string) {
  return rows(
    await database(req, w),
    "SELECT * FROM entries WHERE word=? COLLATE NOCASE LIMIT 1",
    [w],
  )[0] as Entry | undefined;
}
function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++)
      next.push(
        Math.min(next[j] + 1, prev[j + 1] + 1, prev[j] + Number(a[i] !== b[j])),
      );
    prev = next;
  }
  return prev[b.length];
}
async function search(req: Request): Promise<Lookup> {
  const w = req.word.toLowerCase().replace(/’/g, "'").trim().slice(0, 180);
  const entry = await exact(req, w);
  if (entry)
    return {
      entry,
      lemma: entry.exchange?.match(/(?:^|\/)0:([^/]+)/)?.[1],
      suggestions: [],
    };
  const d = await database(req, w);
  const forms = rows(
    d,
    "SELECT lemma FROM forms WHERE form=? COLLATE NOCASE LIMIT 6",
    [w],
  ).map((r) => String(r.lemma));
  const stems = [...forms];
  if (w.endsWith("ies")) stems.push(w.slice(0, -3) + "y");
  for (const suffix of ["ing", "ed", "es", "s"])
    if (w.endsWith(suffix)) {
      const s = w.slice(0, -suffix.length);
      stems.push(s, s + "e");
      if (s.at(-1) === s.at(-2)) stems.push(s.slice(0, -1));
    }
  for (const stem of new Set(stems)) {
    const e = stem && (await exact(req, stem));
    if (e) return { entry: e, lemma: stem, suggestions: [] };
  }
  const prefix = w.slice(0, 3),
    candidates = rows(
      await database(req, w),
      "SELECT word FROM entries WHERE word>=? COLLATE NOCASE AND word<? COLLATE NOCASE AND length(word) BETWEEN ?-2 AND ?+2 LIMIT 6000",
      [prefix, prefix + "\uffff", String(w.length), String(w.length)],
    );
  return {
    suggestions: candidates
      .map((r) => String(r.word))
      .map((s) => ({ s, d: distance(s.toLowerCase(), w) }))
      .filter((x) => x.d <= 2)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map((x) => x.s),
  };
}
let queue = Promise.resolve();
self.onmessage = (e: MessageEvent<Request>) => {
  queue = queue.then(async () => {
    try {
      self.postMessage({ id: e.data.id, result: await search(e.data) });
    } catch (error) {
      self.postMessage({
        id: e.data.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
