export * from "./dictionary-store";
import { manifest, type Lookup } from "./dictionary-store";
import { db } from "./db";
let worker: Worker | undefined,
  seq = 0;
const pending = new Map<
  number,
  { resolve: (v: Lookup) => void; reject: (e: Error) => void }
>();
export async function lookup(word: string): Promise<Lookup> {
  const mode = (await db.settings.get("main"))?.dictionary || "builtin";
  if (!worker) {
    worker = new Worker(new URL("./lookup.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(Error(e.data.error));
      else p.resolve(e.data.result);
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(Error("词典引擎启动失败。"));
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const id = ++seq,
    m = await manifest(mode);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, word, mode, manifest: m });
  });
}
