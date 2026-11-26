import { unzipSync } from "fflate";
import { renderAsync } from "docx-preview";
import { originalParts, readOriginal, storePublication } from "./publication";

// Only the document preview frame receives these styles. Word's run styles,
// numbering rules and section settings therefore cannot restyle the app.
const pageStyle = `
html { color-scheme: light; }
body { background: #deded9; margin: 0; color: #242424; }
.word-wrapper { padding: 12px !important; }
section.word { box-sizing:border-box; margin:0 auto !important; max-width:100%; }
section.word[hidden] { display:none !important; }
img { max-width:100%; object-fit:contain; }
@media(max-width:600px) {
  .word-wrapper { padding:4px !important; }
  section.word { padding-left:16px !important; padding-right:16px !important; }
}
`;
async function prepare(bytes: Uint8Array) {
  let count = 0,
    total = 0;
  let documentPart = false,
    types = false;
  try {
    // Read central-directory sizes before allowing the renderer to inflate parts.
    unzipSync(bytes, {
      filter(entry) {
        total += entry.originalSize;
        if (
          ++count > 16000 ||
          total > 160 * 1024 ** 2 ||
          entry.originalSize > 32 * 1024 ** 2
        )
          throw new RangeError();
        if (entry.name === "[Content_Types].xml") types = true;
        if (entry.name === "word/document.xml") documentPart = true;
        return false;
      },
    });
  } catch (error) {
    if (error instanceof RangeError)
      throw Error("DOCX 解压后过大，请拆分文档后导入。");
    throw Error(
      "无法打开 DOCX，请确认文件完整，并在 Word 中另存为未加密的 .docx。",
    );
  }
  if (!types || !documentPart)
    throw Error("文件缺少 Word 正文，请在 Word 中另存为 .docx。");
  const body = document.createElement("div"),
    styles = document.createElement("div");
  await renderAsync(bytes, body, styles, {
    className: "word",
    renderAltChunks: false,
    ignoreLastRenderedPageBreak: false,
    useBase64URL: true,
  });
  body
    .querySelectorAll("iframe,script,object,embed,form,link")
    .forEach((el) => el.remove());
  body.querySelectorAll("a").forEach((el) => el.removeAttribute("href"));
  const sections = Array.from(body.querySelectorAll("section.word"));
  if (!sections.length) throw Error("没有找到可阅读的 Word 正文。");
  const wordCount = Array.from(body.querySelectorAll("p")).reduce(
    (n, p) =>
      n + (p.textContent?.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)?.length ?? 0),
    0,
  );
  sections.forEach((section) => section.setAttribute("hidden", ""));
  const markup = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">${styles.innerHTML}<style>${pageStyle}</style></head><body>${body.innerHTML}</body></html>`;
  return { markup, pages: sections.length, wordCount };
}
let recent: { id: string; markup: string } | undefined;
export async function openWord(id: string) {
  if (recent?.id === id) {
    const markup = recent.markup;
    recent = undefined;
    return markup;
  }
  return (await prepare(await readOriginal(id))).markup;
}
export async function importWord(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer()),
    id = crypto.randomUUID();
  const result = await prepare(bytes);
  const now = Date.now();
  const book = await storePublication(
    {
      id,
      fileName: file.name,
      title: file.name.replace(/\.docx$/i, "") || file.name,
      format: "DOCX",
      pages: result.pages,
      wordCount: result.wordCount,
      page: 0,
      paragraph: 0,
      createdAt: now,
      openedAt: now,
    },
    [],
    originalParts(
      id,
      bytes,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ),
  );
  recent = { id, markup: result.markup };
  return book;
}
