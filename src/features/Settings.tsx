import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download } from "lucide-react";
import { savePrefs, db } from "../data/db";
import { type Prefs } from "../data/schema";
import {
  manifest,
  installDictionary,
  dictionaries,
  type Manifest,
} from "../data/dictionary-store";
import {
  backup,
  validateBackup,
  restore,
  saveFile,
  csv,
  type Backup,
} from "../data/backup";
import { ReaderPrefs } from "./Reader";
import { metricLabels } from "./Overview";
import { ImportButton, Modal } from "../ui";
export function Settings({ prefs, openNotice }: { prefs: Prefs; openNotice: () => void }) {
  const [info, setInfo] = useState<Manifest>(),
    [message, setMessage] = useState(""),
    [candidate, setCandidate] = useState<Backup>(),
    [busy, setBusy] = useState(false);
  const installed = useLiveQuery(() => dictionaries.packs.get("active"));
  useEffect(() => {
    let active = true;
    manifest(prefs.dictionary).then(
      (m) => {
        if (active) setInfo(m);
      },
      (e) => {
        if (active) setMessage(e.message);
      },
    );
    return () => {
      active = false;
    };
  }, [prefs.dictionary, installed?.manifest.csvSha256]);
  async function task(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="heading">
        <h1>设置</h1>
        <small>LexiFlow 1.1.5</small>
      </div>
      <div className="settings">
        {import.meta.env.MODE !== "iphone" && (
          <section>
            <h2>读者公告</h2>
            <div className="row setting">
              <span>离线阅读与学习使用说明</span>
              <button onClick={openNotice}>查看公告</button>
            </div>
          </section>
        )}
        <section>
          <h2>外观与阅读</h2>
          <ReaderPrefs prefs={prefs} />
          <h3>首页统计项目</h3>
          <div className="actions">
            {(Object.keys(metricLabels) as Prefs["homeMetrics"]).map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={prefs.homeMetrics.includes(k)}
                  onChange={(e) =>
                    void savePrefs({
                      homeMetrics: e.target.checked
                        ? [...prefs.homeMetrics, k]
                        : prefs.homeMetrics.filter((v) => v !== k),
                    })
                  }
                />{" "}
                {metricLabels[k]}
              </label>
            ))}
          </div>
        </section>
        <section>
          <h2>离线词典</h2>
          <div className="row setting">
            <label htmlFor="dict">默认词典</label>
            <select
              id="dict"
              value={prefs.dictionary}
              onChange={(e) =>
                void savePrefs({
                  dictionary: e.target.value as Prefs["dictionary"],
                })
              }
            >
              <option value="builtin">内置 ECDICT</option>
              {(installed || prefs.dictionary === "installed") && (
                <option value="installed">已导入词典</option>
              )}
            </select>
          </div>
          {info && (
            <>
              <p>
                {info.name} · {info.count.toLocaleString()} 条 · 版本{" "}
                {info.version.slice(0, 10)}
              </p>
              <details>
                <summary>来源与许可</summary>
                <p className="wrap">{info.source}</p>
                <pre>{info.license}</pre>
              </details>
            </>
          )}
          <ImportButton
            secondary
            accept=".lexdict"
            onFile={(f) =>
              task(async () => {
                const m = await installDictionary(f);
                await savePrefs({ dictionary: "installed" });
                setMessage(
                  "已验证并安装 " + m.count.toLocaleString() + " 条词典数据。",
                );
              })
            }
          >
            安装词典包
          </ImportButton>
        </section>
        <section>
          <h2>备份与恢复</h2>
          <p>
            JSON
            包含文章正文、阅读位置、生词、复习进度、学习记录和设置。词典数据包独立保存。
          </p>
          <div className="actions">
            <button
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  if (
                    await saveFile(
                      "LexiFlow-" +
                        new Date().toISOString().slice(0, 10) +
                        ".json",
                      JSON.stringify(await backup()),
                      "application/json",
                    )
                  )
                    setMessage("已导出学习数据备份。");
                })
              }
            >
              <Download size={16} />
              导出 JSON 备份
            </button>
            <ImportButton
              secondary
              accept=".json"
              onFile={(f) =>
                task(async () => {
                  let raw;
                  try {
                    raw = JSON.parse(await f.text());
                  } catch {
                    throw Error("无法解析 JSON 备份。");
                  }
                  setCandidate(validateBackup(raw));
                })
              }
            >
              从 JSON 恢复
            </ImportButton>
            <button
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  if (
                    await saveFile(
                      "LexiFlow-vocabulary.csv",
                      csv(await db.words.toArray()),
                      "text/csv",
                    )
                  )
                    setMessage("已导出词汇 CSV。");
                })
              }
            >
              导出全部词汇 CSV
            </button>
          </div>
          <small>
            备份位置 ·{" "}
            {localStorage.getItem("lexiflow-export-directory") ||
              "导出时选择，浏览器版使用下载位置"}
          </small>
        </section>
        {busy && <p role="status">正在处理本地文件…</p>}
        {message && (
          <p className="feedback" role="status">
            {message}
          </p>
        )}
      </div>
      {candidate && (
        <Modal title="替换本机学习数据？" close={() => setCandidate(undefined)}>
          <p>
            这份备份创建于{" "}
            {new Date(candidate.exportedAt).toLocaleString("zh-CN")}，包含{" "}
            {candidate.books.length} 篇文章、{candidate.words.length} 个词条、
            {candidate.reviews.length} 条复习记录。确认后将替换当前学习数据。
          </p>
          <div className="actions">
            <button onClick={() => setCandidate(undefined)}>取消</button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void task(async () => {
                  await restore(candidate);
                  setCandidate(undefined);
                  setMessage("备份恢复成功。");
                })
              }
            >
              确认恢复
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
