import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { rate } from "../data/words";
import { grades, type Grade } from "../data/schema";
import { Empty, dateLabel } from "../ui";
import { gradeLabels } from "./Vocabulary";
async function skip(key: string) {
  await db.transaction("rw", db.practice, async () => {
    const run = await db.practice.get("active");
    if (run?.keys[0] === key)
      await db.practice.update("active", {
        keys: run.keys.slice(1),
        skipped: run.skipped + 1,
      });
  });
}
export function Review() {
  const words = useLiveQuery(() => db.words.orderBy("due").toArray(), [], []),
    run = useLiveQuery(() => db.practice.get("active")),
    history = useLiveQuery(
      () => db.reviews.orderBy("at").reverse().toArray(),
      [],
      [],
    );
  const [shown, setShown] = useState(""),
    [now, setNow] = useState(Date.now()),
    [limit, setLimit] = useState(15),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);
  const key = run?.keys[0],
    w = words.find((w) => w.key === key),
    due = words.filter((w) => w.due <= now);
  async function start(all: boolean) {
    setShown("");
    await db.practice.put({
      id: "active",
      keys: (all ? words : due).map((w) => w.key),
      done: 0,
      skipped: 0,
    });
  }
  async function answer(g: Grade) {
    if (!w || busy) return;
    setBusy(true);
    try {
      await rate(w.key, g, w.due);
      setShown("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="heading">
        <div>
          <h1>单词复习</h1>
          <p>{due.length} 个词条已到复习时间</p>
        </div>
      </div>
      {key && w ? (
        <div className="reviewcard">
          <small>剩余 {run!.keys.length} 词</small>
          <h2>{w.word}</h2>
          <p>{w.phonetic}</p>
          {shown === key ? (
            <>
              <div className="meaning">
                {w.definitionZh || w.definitionEn || "尚无释义"}
              </div>
              {(w.example || w.sources[0]?.context) && (
                <blockquote>{w.example || w.sources[0].context}</blockquote>
              )}
              <div className="ratings">
                {grades.map((g) => (
                  <button
                    disabled={busy}
                    onClick={() => void answer(g)}
                    key={g}
                  >
                    {g}
                    <small>{gradeLabels[g]}</small>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button className="primary" onClick={() => setShown(key)}>
              显示释义
            </button>
          )}
          <button className="plain" onClick={() => void skip(key)}>
            跳过此词
          </button>
        </div>
      ) : key ? (
        <button onClick={() => void skip(key)}>跳过已删除词条</button>
      ) : words.length ? (
        <div className="reviewcard">
          <h2>{run ? "本轮复习结束" : "按自己的节奏复习"}</h2>
          {run && (
            <p>
              已复习 {run.done} 词，跳过 {run.skipped} 词。
            </p>
          )}
          <div className="actions">
            {due.length > 0 && (
              <button className="primary" onClick={() => void start(false)}>
                复习到期词
              </button>
            )}
            <button onClick={() => void start(true)}>自由复习全部词条</button>
          </div>
        </div>
      ) : (
        <Empty
          title="尚无可复习的词条"
          text="在阅读时收藏生词，它们会出现在这里。"
        />
      )}
      <div className="sectionhead">
        <h2>复习历史</h2>
        <small>{history.length} 次</small>
      </div>
      {history.length ? (
        <div className="list">
          {history.slice(0, limit).map((r) => (
            <div className="row" key={r.id}>
              <strong>{r.wordKey}</strong>
              <small>
                {r.grade} · {dateLabel(r.at)} · 下次{" "}
                {new Date(r.due).toLocaleString("zh-CN")}
              </small>
            </div>
          ))}
          {limit < history.length && (
            <button onClick={() => setLimit(limit + 30)}>更多记录</button>
          )}
        </div>
      ) : (
        <p className="quiet">
          完成一次复习后，可在这里查看反馈和下次复习时间。
        </p>
      )}
    </>
  );
}
