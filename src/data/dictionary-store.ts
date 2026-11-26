import Dexie, { type Table } from "dexie";
import { z } from "zod";
import type { Prefs } from "./schema";

const part = z.object({
  size: z
    .number()
    .int()
    .min(1)
    .max(64 * 1024 * 1024),
  raw: z
    .number()
    .int()
    .min(512)
    .max(96 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const manifestSchema = z.object({
  format: z.literal("LexiFlow-SQLite-1"),
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(100),
  count: z.number().int().positive(),
  source: z.string().max(500),
  license: z.string().max(20000),
  csvSha256: z.string(),
  parts: z.array(part).length(128),
});
export type Manifest = z.infer<typeof manifestSchema>;
export type Entry = {
  word: string;
  phonetic: string;
  definition: string;
  translation: string;
  pos: string;
  collins: string;
  oxford: string;
  tag: string;
  bnc: string;
  frq: string;
  exchange: string;
  detail: string;
  audio: string;
};
export type Lookup = { entry?: Entry; lemma?: string; suggestions: string[] };
type Pack = { id: string; blob: Blob; manifest: Manifest; offset: number };
class Dictionaries extends Dexie {
  packs!: Table<Pack, string>;
  constructor() {
    super("LexiFlow-Dictionaries");
    this.version(1).stores({ packs: "id" });
  }
}
export const dictionaries = new Dictionaries();
let builtin: Promise<Manifest> | undefined;
export async function manifest(mode: Prefs["dictionary"]) {
  if (mode === "installed") {
    const p = await dictionaries.packs.get("active");
    if (!p) throw Error("请重新安装此词典，或在设置中选择内置词典。");
    return p.manifest;
  }
  builtin ??= fetch("/dictionary/manifest.json")
    .then((r) => {
      if (!r.ok) throw Error("内置词典清单读取失败。");
      return r.json();
    })
    .then((m) => manifestSchema.parse(m))
    .catch((e) => {
      builtin = undefined;
      throw e;
    });
  return builtin;
}
export async function digest(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function installDictionary(blob: Blob) {
  const header = await blob.slice(0, 8).arrayBuffer();
  if (
    header.byteLength !== 8 ||
    new TextDecoder().decode(header.slice(0, 4)) !== "LFD1"
  )
    throw Error("请选择 LexiFlow 的 .lexdict 词典包。");
  const size = new DataView(header).getUint32(4, true);
  if (size > 100000) throw Error("词典清单过大。");
  const m = manifestSchema.parse(
    JSON.parse(await blob.slice(8, 8 + size).text()),
  );
  let pos = 8 + size;
  if (pos + m.parts.reduce((n, p) => n + p.size, 0) !== blob.size)
    throw Error("词典包不完整。");
  for (const p of m.parts) {
    if (
      (await digest(await blob.slice(pos, pos + p.size).arrayBuffer())) !==
      p.sha256
    )
      throw Error("词典包校验失败。");
    pos += p.size;
  }
  await dictionaries.packs.put({
    id: "active",
    blob,
    manifest: m,
    offset: 8 + size,
  });
  return m;
}
export async function shard(mode: Prefs["dictionary"], i: number, m: Manifest) {
  let bytes: ArrayBuffer;
  if (mode === "builtin") {
    const r = await fetch("/dictionary/" + i + ".bin");
    if (!r.ok) throw Error("词典分片读取失败。");
    bytes = await r.arrayBuffer();
  } else {
    const pack = await dictionaries.packs.get("active");
    if (!pack || pack.manifest.csvSha256 !== m.csvSha256)
      throw Error("词典已更换，请重新查词。");
    const start =
      pack.offset + m.parts.slice(0, i).reduce((n, p) => n + p.size, 0);
    bytes = await pack.blob.slice(start, start + m.parts[i].size).arrayBuffer();
  }
  if ((await digest(bytes)) !== m.parts[i].sha256)
    throw Error("本地词典分片损坏。");
  return bytes;
}
