const { chromium } = require("playwright-core");
const fs = require("fs"),
  assert = require("assert/strict");
if (!process.env.LEXIFLOW_BROWSER)
  throw Error("Set LEXIFLOW_BROWSER to a Chromium executable");
const base = process.env.LEXIFLOW_URL || "http://127.0.0.1:1421";
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.LEXIFLOW_BROWSER,
    headless: true,
  });
  const ctx = await browser.newContext({
    viewport: { width: 1240, height: 850 },
    acceptDownloads: true,
  });
  const page = await ctx.newPage(),
    errors = [],
    outside = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ctx.route("**/*", (route) => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") {
      outside.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const btn = (n) => page.getByRole("button", { name: n, exact: true });
  async function nav(n) {
    await page
      .locator("nav")
      .getByRole("button", { name: n, exact: true })
      .click();
  }
  async function load(name, txt) {
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name,
        mimeType: "text/plain",
        buffer: Buffer.from(txt),
      });
    await page.locator(".prose").waitFor();
  }
  async function saveWord() {
    await page.locator("[data-word=Morning]").first().click();
    await btn("收藏生词").or(btn("关联此文章")).click();
    await btn("取消标记").waitFor();
    await btn("关闭").click();
  }
  try {
    await page.goto(base);
    await page.getByRole("dialog", { name: "读者公告" }).getByRole("button", { name: "知道了" }).click();
    await page.getByText("阅读工作台").waitFor();
    await nav("阅读室");
    await load("中文 & 场景.txt", "Morning light in the forest.\n".repeat(800));
    await saveWord();
    await btn("下一页").click();
    await page.locator(".prose").evaluate((s) => (s.scrollTop = 620));
    await page.waitForTimeout(300);
    const pos = await page.locator(".prose").evaluate((s) => s.scrollTop);
    await page.reload();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="跳至页码"]')?.value === "2",
    );
    await page.waitForTimeout(250);
    const restored = await page.locator(".prose").evaluate((s) => s.scrollTop);
    assert(Math.abs(pos - restored) < 100, [pos, restored]);
    await nav("阅读室");
    await load(
      "第二篇.md",
      "# Morning\nMorning flowers. Blorpljzz. egotripped elephat.",
    );
    await saveWord();
    await page.locator("[data-word=Blorpljzz]").click();
    await page.getByText("本地词典未收录此词。").waitFor();
    await btn("关闭").click();
    await page.locator("[data-word=egotripped]").click();
    await page.getByText("原形 egotrip").waitFor();
    await btn("关闭").click();
    await page.locator("[data-word=elephat]").click();
    await btn("elephant").click();
    await page.locator(".dictdef").waitFor();
    await btn("关闭").click();
    await nav("生词本");
    await page.getByText("已收藏 1 个词条").waitFor();
    await page.locator(".list .lead").click();
    await page.getByLabel("例句", { exact: true }).fill("A soft morning.");
    await btn("保存词条").click();
    await btn("添加单词").click();
    await page.getByLabel("单词", { exact: true }).fill("quiet");
    await page.getByLabel("中文释义", { exact: true }).fill("安静的");
    await btn("保存词条").click();
    await page.getByText("已收藏 2 个词条").waitFor();
    await nav("复习");
    await btn("复习到期词").click();
    await btn("显示释义").click();
    await page.getByRole("button", { name: "Good 基本掌握" }).click();
    await page.reload();
    await page.getByText("剩余 1 词").waitFor();
    await btn("跳过此词").click();
    await page.getByText("本轮复习结束").waitFor();
    await nav("学习统计");
    await page.getByLabel("统计周期").selectOption("month");
    await nav("设置");
    await page.getByRole("button", { name: "深色", exact: true }).click();
    await page.locator("html[data-theme=night]").waitFor();
    for (const section of [
      "首页",
      "阅读室",
      "生词本",
      "复习",
      "学习统计",
      "设置",
    ]) {
      await nav(section);
      assert.equal(
        await page
          .locator("body")
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        "rgb(38, 40, 38)",
      );
    }
    await btn("跟随系统").click();
    await page.emulateMedia({ colorScheme: "dark" });
    await page.locator("html[data-theme=night]").waitFor();
    await page.emulateMedia({ colorScheme: "light" });
    await page.locator("html[data-theme=white]").waitFor();
    await btn("纯白").click();
    const download = page.waitForEvent("download");
    await btn("导出 JSON 备份").click();
    const dl = await download;
    const file = await dl.path();
    const backup = JSON.parse(fs.readFileSync(file));
    assert.equal(backup.books.length, 2);
    assert.equal(backup.words.length, 2);
    assert.equal(backup.reviews.length, 1);
    assert.equal(
      backup.words.find((w) => w.key === "morning").sources.length,
      2,
    );
    assert(backup.sessions.length > 0);
    const sel = page.locator('input[accept=".json"]');
    await sel.setInputFiles({
      name: "损坏.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"x":1}'),
    });
    await page.getByText("备份格式、字段或数据库版本不受支持。").waitFor();
    await sel.setInputFiles(file);
    await btn("取消").click();
    await sel.setInputFiles(file);
    await btn("确认恢复").click();
    await page.getByText("备份恢复成功。").waitFor();
    const csv = page.waitForEvent("download");
    await btn("导出全部词汇 CSV").click();
    assert(
      fs
        .readFileSync(await (await csv).path(), "utf8")
        .includes("A soft morning."),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    for (const n of ["首页", "阅读室", "生词本", "复习", "学习统计", "设置"]) {
      await nav(n);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "overflow " + n,
      );
    }
    await nav("阅读室");
    await page.locator(".list .lead").first().click();
    assert.equal(outside.length, 0);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          passed: true,
          pages: backup.pages.length,
          sessions: backup.sessions.length,
          position: [pos, restored],
          external: outside,
          errors,
          mobile: 390,
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
