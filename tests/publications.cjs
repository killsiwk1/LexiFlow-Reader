const { chromium } = require("playwright-core"),
  assert = require("node:assert/strict");
const { epub, pdf } = require("./publication-fixtures.cjs");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.LEXIFLOW_BROWSER,
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 800 },
    });
    const page = await context.newPage();
    const url = process.env.LEXIFLOW_URL || "http://127.0.0.1:1421";
    const external = [];
    await context.route("**/*", (route) => {
      const uri = route.request().url();
      if (/^https?:/.test(uri) && !uri.startsWith(url)) {
        external.push(uri);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(url);
    await page.getByRole("dialog", { name: "读者公告" }).getByRole("button", { name: "知道了" }).click();
    const btn = (name) => page.getByRole("button", { name, exact: true });
    const upload = async (name, data) => {
      await btn("首页").first().click();
      await page.locator("input[type=file]").first().setInputFiles({
        name,
        mimeType: "application/octet-stream",
        buffer: data,
      });
    };
    for (const ncx of [false, true]) {
      await upload(ncx ? "Old.epub" : "Garden.epub", epub(ncx));
      await page.getByRole("heading", { name: "Garden Papers" }).waitFor();
      assert.equal(
        await page
          .getByAltText("Green leaf")
          .evaluate((img) => img.complete && img.naturalWidth),
        1,
      );
      await btn("目录").click();
      await btn("Field note").click();
      await page.getByText("Birds", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("跳至页码").inputValue(), "2");
      await btn("下一章").click();
      await btn("Morning").first().waitFor();
      await page.reload();
      await btn("Morning").first().click();
      await btn("收藏生词").or(btn("关联此文章")).first().click();
      await btn("关闭").click();
      assert.equal(await page.getByLabel("跳至页码").inputValue(), "3");
    }
    console.log(
      "EPUB 2/3: spine, nested TOC anchor, local image, chapter navigation, reopen, real dictionary and vocabulary passed.",
    );
    await upload("Field guide.pdf", pdf());
    const pdfLine = page
      .locator(".textLayer span")
      .filter({ hasText: "Morning light" })
      .first();
    await pdfLine.waitFor();
    assert.ok(
      await page.locator(".pdf-sheet canvas").evaluate((c) => c.width > 150),
    );
    await pdfLine.click({ position: { x: 8, y: 8 } });
    await btn("关联此文章").click();
    await btn("关闭").click();
    await pdfLine.evaluate((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    });
    await btn("收藏所选句子").click();
    await btn("目录").click();
    await btn("Winter chapter").click();
    await page
      .locator(".textLayer span")
      .filter({ hasText: "Winter returns" })
      .first()
      .waitFor();
    for (const width of [390, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      await page.getByLabel("PDF 缩放").selectOption("0");
      await page.waitForFunction(() => {
        const sheet = document.querySelector(".pdf-sheet"),
          view = document.querySelector(".pdf-scroll");
        return (
          sheet.offsetHeight > 0 &&
          sheet.offsetHeight <= view.clientHeight &&
          sheet.offsetWidth <= view.clientWidth
        );
      });
      assert.equal(
        await page.getByRole("toolbar").getByLabel("跳至页码").inputValue(),
        "2",
      );
    }
    await page.getByLabel("PDF 缩放").selectOption("1.5");
    await btn("下一页").click();
    await page.getByText(/本页没有可选文字/).waitFor();
    await page.getByLabel("PDF 文本搜索").fill("garden");
    await btn("搜索").click();
    await page.getByLabel("搜索结果").waitFor();
    assert.equal(await page.getByLabel("跳至页码").inputValue(), "1");
    await btn("下一页").click();
    await page.reload();
    await page
      .locator(".textLayer span")
      .filter({ hasText: "Winter returns" })
      .first()
      .waitFor();
    console.log(
      "PDF: painted canvas, selectable text, dictionary/collect, sentence, outline, zoom, paged search, scan notice and reopen passed.",
    );
    await btn("阅读排版").click();
    assert.equal(await page.getByLabel("字号", { exact: true }).count(), 0);
    await btn("深色").click();
    await btn("关闭").click();
    await page.reload();
    await page.locator("html[data-theme=night] .document-view").waitFor();
    for (const [name, data] of [
      ["draft.md", Buffer.from("# Notebook\nMorning light fills the garden.")],
      ["letter.txt", Buffer.from("Morning light fills the garden.")],
    ]) {
      await upload(name, data);
      await btn("Morning").first().waitFor();
      await btn("阅读排版").click();
      await btn("纯白").click();
      await btn("米黄色").click();
      await page.getByLabel("字号", { exact: true }).fill("24");
      await page.getByLabel("行间距", { exact: true }).fill("2");
      await page.getByLabel("段落间距", { exact: true }).fill("1.3");
      await page.getByLabel("阅读区域宽度", { exact: true }).fill("740");
      await page.getByLabel("阅读字体").selectOption("sans-serif");
      await btn("关闭").click();
      await page.reload();
      await page
        .locator("html[data-theme=paper] .classic-view .token")
        .first()
        .waitFor();
      assert.equal(
        await page
          .locator(".prose")
          .evaluate((el) => getComputedStyle(el).fontSize),
        "24px",
      );
      assert.equal(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(244, 235, 216)",
      );
      await btn("沉浸阅读").click();
      await page.locator(".reading.immersive").waitFor();
      await btn("沉浸阅读").click();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.setViewportSize({ width: 1024, height: 800 });
    }
    console.log(
      "Themes: paper, white, night, typography, width, re-open, immersion, mobile viewport and fixed PDF controls passed.",
    );
    // Reuse the actual export, restore and review routes.
    for (const format of ["MD", "TXT"]) {
      await btn("阅读室").first().click();
      await page
        .locator(".lead")
        .filter({ hasText: format === "MD" ? "draft" : "letter" })
        .click();
      await btn("Morning").first().click();
      await btn("关联此文章").click();
      await btn("关闭").click();
      await page
        .locator(".prose > [data-kind=p]")
        .first()
        .evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          const s = getSelection();
          s.removeAllRanges();
          s.addRange(r);
        });
      await btn("收藏所选句子").click();
    }
    await btn("阅读室").first().click();
    await page
      .locator(".lead")
      .filter({ hasText: "Garden Papers" })
      .first()
      .click();
    await page
      .locator(".prose > [data-kind=p]")
      .first()
      .evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        const s = getSelection();
        s.removeAllRanges();
        s.addRange(r);
      });
    await btn("收藏所选句子").click();
    await btn("设置").first().click();
    const dl = page.waitForEvent("download");
    await btn("导出 JSON 备份").click();
    const raw = JSON.parse(
      require("node:fs").readFileSync(await (await dl).path()),
    );
    assert.equal(raw.databaseVersion, 3);
    assert.equal(raw.words.length, 1);
    assert.equal(raw.words[0].sources.length, 5);
    assert.equal(raw.sentences.length, 4);
    assert.equal(raw.books.length, 5);
    assert.ok(raw.resources.some((r) => r.mime === "application/pdf"));
    assert.ok(raw.sessions.length > 0);
    await page.locator('input[accept=".json"]').setInputFiles({
      name: "library.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(raw)),
    });
    await btn("确认恢复").click();
    await page.getByText("备份恢复成功。", { exact: true }).waitFor();
    await btn("阅读室").first().click();
    await btn("收藏句子").click();
    await page.locator(".excerpt").nth(3).waitFor();
    assert.equal(await page.locator(".excerpt").count(), 4);
    await btn("关闭").click();
    await page.locator(".lead").filter({ hasText: "Field guide" }).click();
    await page
      .locator(".textLayer span")
      .filter({ hasText: "Winter returns" })
      .first()
      .waitFor();
    console.log(
      "Integration: all four formats share words (five sources), four saved sentences, reading sessions, restored PDF source, EPUB images and local JSON round trip.",
    );
    assert.deepEqual(external, []);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
