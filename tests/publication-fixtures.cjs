const { zipSync, strToU8 } = require("fflate");
const fs = require("node:fs"),
  path = require("node:path");
function epub(ncx = false) {
  const files = {
    mimetype: "application/epub+zip",
    "META-INF/container.xml":
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    "OPS/book.opf":
      '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Garden Papers</dc:title></metadata><manifest><item id="s2" href="two.xhtml" media-type="application/xhtml+xml"/><item id="s1" href="one.xhtml" media-type="application/xhtml+xml"/><item id="img" href="leaf.png" media-type="image/png"/>' +
      (ncx
        ? '<item id="nav" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
        : '<item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>') +
      '</manifest><spine toc="nav"><itemref idref="s1"/><itemref idref="s2"/></spine></package>',
    "OPS/nav.xhtml":
      '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">First leaf</a><ol><li><a href="one.xhtml#note">Field note</a></li></ol></li><li><a href="two.xhtml">Winter</a></li></ol></nav></body></html>',
    "OPS/toc.ncx":
      '<ncx><navMap><navPoint><navLabel><text>First leaf</text></navLabel><content src="one.xhtml"/><navPoint><navLabel><text>Field note</text></navLabel><content src="one.xhtml#note"/></navPoint></navPoint><navPoint><navLabel><text>Winter</text></navLabel><content src="two.xhtml"/></navPoint></navMap></ncx>',
    "OPS/one.xhtml":
      '<html><body><h1>Spring</h1><p><em>Morning</em> light fills the garden.</p><img src="leaf.png" alt="Green leaf"/>' +
      "<p>Rain returns to the valley.</p>".repeat(85) +
      '<p id="note">Birds carry seeds.</p></body></html>',
    "OPS/two.xhtml":
      "<html><body><h1>Winter</h1><p>Morning snow blankets the valley.</p></body></html>",
  };
  const encoded = Object.fromEntries(
    Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
  );
  encoded["OPS/leaf.png"] = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a+S8AAAAASUVORK5CYII=",
    "base64",
  );
  return Buffer.from(zipSync(encoded));
}
function pdf() {
  const stream = (s) =>
    "<< /Length " + Buffer.byteLength(s) + " >>\nstream\n" + s + "\nendstream";
  const page = (content) =>
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 560] /Resources << /Font << /F1 3 0 R >> >> /Contents " +
    content +
    " 0 R >>";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R /Outlines 10 0 R >>",
    "<< /Type /Pages /Count 3 /Kids [4 0 R 6 0 R 8 0 R] >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    page(5),
    stream("BT /F1 18 Tf 30 470 Td (Morning light fills the garden.) Tj ET"),
    page(7),
    stream("BT /F1 18 Tf 30 470 Td (Winter returns to the valley.) Tj ET"),
    page(9),
    stream("0.3 0.5 0.4 rg 50 60 200 300 re f"),
    "<< /Type /Outlines /First 11 0 R /Last 11 0 R /Count 1 >>",
    "<< /Title (Winter chapter) /Parent 10 0 R /Dest [6 0 R /Fit] >>",
  ];
  let body = "%PDF-1.4\n",
    offsets = [0];
  for (const [i, o] of objs.entries()) {
    offsets.push(body.length);
    body += i + 1 + " 0 obj\n" + o + "\nendobj\n";
  }
  const pos = body.length;
  body +=
    "xref\n0 " +
    offsets.length +
    "\n0000000000 65535 f \n" +
    offsets
      .slice(1)
      .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
      .join("") +
    "trailer\n<< /Size " +
    offsets.length +
    " /Root 1 0 R >>\nstartxref\n" +
    pos +
    "\n%%EOF\n";
  return Buffer.from(body);
}
module.exports = { epub, pdf };
if (require.main === module) {
  const dir = process.argv[2];
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "Garden.epub"), epub());
  fs.writeFileSync(path.join(dir, "Garden.pdf"), pdf());
}
