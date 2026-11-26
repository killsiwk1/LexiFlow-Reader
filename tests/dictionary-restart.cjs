const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  assert = require("assert/strict"),
  { chromium } = require("playwright-core");
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lexiflow-qa-"));
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      executablePath: process.env.LEXIFLOW_BROWSER,
      headless: true,
    });
  let c = await launch();
  try {
    const p = await c.newPage();
    p.setDefaultTimeout(45000);
    await p.goto(
      (process.env.LEXIFLOW_URL || "http://127.0.0.1:1421") + "/#settings",
    );
    await p.getByRole("dialog", { name: "读者公告" }).getByRole("button", { name: "知道了" }).click();
    await p
      .locator('input[accept=".lexdict"]')
      .setInputFiles(process.env.LEXIFLOW_PACK || "../ECDICT.lexdict");
    await p.getByText(/已验证并安装/).waitFor({ timeout: 120000 });
    assert.equal(await p.locator("#dict").inputValue(), "installed");
    await p
      .locator('input[accept=".lexdict"]')
      .setInputFiles({
        name: "bad.lexdict",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("LFD1"),
      });
    await p.getByText("请选择 LexiFlow 的 .lexdict 词典包。").waitFor();
    await p.locator("nav button").filter({ hasText: "阅读室" }).click();
    await p
      .locator("input[type=file]")
      .setInputFiles({
        name: "复开测试.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Reading music. Walkethzy. Morning."),
      });
    await p.locator("[data-word=Morning]").click();
    await p.getByRole("button", { name: "收藏生词" }).click();
    await p.getByRole("button", { name: "取消标记" }).waitFor();
    const route = p.url();
    await c.close();
    c = await launch();
    const reopened = await c.newPage();
    reopened.setDefaultTimeout(45000);
    await reopened.goto(route);
    await reopened.locator("[data-word=Morning]").click();
    await reopened.getByRole("button", { name: "取消标记" }).waitFor();
    await reopened.locator(".dictdef").waitFor();
    await reopened.getByRole("button", { name: "取消标记" }).click();
    await reopened.getByRole("button", { name: "标记生词" }).waitFor();
    await reopened.getByRole("button", { name: "查看生词详情" }).click();
    await reopened
      .getByRole("textbox", { name: "中文释义", exact: true })
      .waitFor();
    console.log(
      "Full replacement pack validated and used across a fresh browser process. Rejected invalid pack. Removing a mark preserved the vocabulary entry.",
    );
  } finally {
    await c.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
