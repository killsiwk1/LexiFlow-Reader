import type { PDFDocumentProxy } from "pdfjs-dist";
import type { NavItem } from "./schema";
import { readOriginal, originalParts, storePublication } from "./publication";
type Engine = typeof import("pdfjs-dist");
let ready: Promise<Engine> | undefined;
const base = () => new URL("./pdf-engine/", document.baseURI).href;
export function pdfEngine() {
  return (ready ??= (
    import(/* @vite-ignore */ base() + "pdf.js") as Promise<Engine>
  )
    .then((engine) => {
      engine.GlobalWorkerOptions.workerSrc = base() + "worker.js";
      return engine;
    })
    .catch((e) => {
      ready = undefined;
      throw e;
    }));
}
export async function openPdf(bytes: Uint8Array) {
  const engine = await pdfEngine();
  const task = engine.getDocument({
    data: bytes,
    cMapUrl: base() + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: base() + "standard_fonts/",
    isEvalSupported: false,
    useSystemFonts: true,
  });
  try {
    return await task.promise;
  } catch (e) {
    await task.destroy();
    if ((e as Error).name === "PasswordException")
      throw Error("此 PDF 受密码保护，请导入已解锁的副本。");
    throw e;
  }
}
export async function loadPdf(bookId: string) {
  return openPdf(await readOriginal(bookId));
}
async function outline(doc: PDFDocumentProxy) {
  type Items = NonNullable<Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>>;
  const result: NavItem[] = [];
  async function walk(items: Items, depth: number) {
    for (const item of items) {
      const dest =
        typeof item.dest === "string"
          ? await doc.getDestination(item.dest)
          : item.dest;
      if (dest?.[0] != null) {
        try {
          const n =
            typeof dest[0] === "number"
              ? dest[0]
              : await doc.getPageIndex(dest[0]);
          if (n >= 0 && n < doc.numPages)
            result.push({
              page: n,
              paragraph: 0,
              depth,
              title: item.title.slice(0, 1024),
            });
        } catch {
          /* A broken bookmark need not stop the book opening. */
        }
      }
      if (item.items.length) await walk(item.items, depth + 1);
    }
  }
  await walk((await doc.getOutline()) || [], 0);
  return result;
}
export async function importPdf(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()),
    id = crypto.randomUUID();
  const resources = originalParts(id, bytes, "application/pdf");
  const doc = await openPdf(bytes);
  try {
    const now = Date.now(),
      info = (await doc.getMetadata()).info as { Title?: string };
    return await storePublication(
      {
        id,
        title: (
          info.Title?.trim() ||
          file.name.replace(/\.pdf$/i, "") ||
          file.name
        ).slice(0, 1024),
        fileName: file.name,
        format: "PDF",
        pages: doc.numPages,
        page: 0,
        paragraph: 0,
        createdAt: now,
        openedAt: now,
        wordCount: 0,
        toc: await outline(doc),
      },
      [],
      resources,
    );
  } finally {
    await doc.destroy();
  }
}
