const {chromium}=require("playwright-core"), assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.LEXIFLOW_BROWSER,args:["--no-proxy-server"]});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844},acceptDownloads:true});
 const remote=[]; await page.route("**/*",r=>{if(/^https?:/.test(r.request().url())&&!r.request().url().startsWith(process.env.LEXIFLOW_URL)){remote.push(r.request().url());return r.abort()}return r.continue()});
 await page.goto(process.env.LEXIFLOW_URL);
    await page.getByRole("dialog", { name: "读者公告" }).getByRole("button", { name: "知道了" }).click();
 const button=name=>page.getByRole("button",{name,exact:true}).first();
 const hint=page.getByText("支持 TXT、Markdown、EPUB、PDF、Word（.docx）",{exact:true});
 await hint.waitFor(); await button("阅读室").click();await hint.waitFor();
 const file=path.join(__dirname,"fixtures","Field notebook.docx");
 await page.locator("input[type=file]").setInputFiles(file);
 const frame=page.frameLocator(".word-frame");
 const section=frame.locator("section.word:not([hidden])");
 await section.getByText("Rose",{exact:true}).waitFor();
 assert.equal(await section.locator("tr").count(),2);
 await section.getByText("Bring a notebook").waitFor();
 const img=section.locator("img").first(); await img.waitFor();assert(await img.evaluate(e=>e.naturalWidth>0));
 await section.getByText("Morning",{exact:true}).click({position:{x:5,y:7}});
 await page.locator(".dictdef").waitFor();await button("收藏生词").click();await button("关闭").click();
 await section.getByText("light falls on the garden.",{exact:false}).evaluate(el=>{const d=el.ownerDocument,r=d.createRange();r.selectNodeContents(el);const s=d.getSelection();s.removeAllRanges();s.addRange(r);d.dispatchEvent(new Event("selectionchange"))});
 await button("收藏所选句子").click();
 await page.getByLabel("下一页").click();await section.getByText("Winter returns.").waitFor();
 await page.reload();await section.getByText("Winter returns.").waitFor();
 await button("设置").click();const downloading=page.waitForEvent("download");await button("导出 JSON 备份").click();const dl=await downloading;
 const raw=JSON.parse(fs.readFileSync(await dl.path()));assert.equal(raw.books[0].format,"DOCX");assert.equal(raw.words.length,1);assert.equal(raw.sentences.length,1);assert(Buffer.from(raw.resources[0].data,"base64").equals(fs.readFileSync(file)));
 await page.locator('input[accept=".json"]').setInputFiles(await dl.path());await button("确认恢复").click();await page.getByText("备份恢复成功。").waitFor();
 await button("阅读室").click();await page.locator(".lead").click();await section.getByText("Winter returns.").waitFor();
 assert.deepEqual(remote,[]);
 console.log("PASS DOCX through both import entries, table, embedded image, list, page break, dictionary, vocabulary, sentence collection, reopen and JSON round trip.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
