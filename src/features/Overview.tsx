import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  ArrowRight,
  Clock3,
  Hourglass,
  Bookmark,
  Layers3,
  Activity,
} from "lucide-react";
import { db } from "../data/db";
import type { Prefs, Session } from "../data/schema";
import { dateLabel, duration, Empty, navigate } from "../ui";
import { ArticleImport } from "./Reader";
export function dayStart(stamp = Date.now()) {
  const d = new Date(stamp);
  d.setHours(0, 0, 0, 0);
  return +d;
}
export function timeIn(sessions: Session[], from = 0, to = Infinity) {
  return sessions.reduce(
    (n, s) => n + Math.max(0, Math.min(to, s.end) - Math.max(from, s.start)),
    0,
  );
}
function useLearning() {
  return useLiveQuery(
    async () =>
      db.transaction(
        "r",
        db.books,
        db.words,
        db.sessions,
        db.reviews,
        async () => ({
          books: await db.books.orderBy("openedAt").reverse().toArray(),
          words: await db.words.toArray(),
          sessions: await db.sessions.toArray(),
          reviews: await db.reviews.orderBy("at").reverse().toArray(),
        }),
      ),
    [],
    { books: [], words: [], sessions: [], reviews: [] },
  );
}
export const metricLabels = {
  today: "今日阅读",
  total: "累计阅读",
  words: "收藏单词",
  due: "待复习",
};
export function Home({ prefs }: { prefs: Prefs }) {
  const { books, words, sessions, reviews } = useLearning(),
    recent = books[0];
  const metrics = {
      today: duration(timeIn(sessions, dayStart())),
      total: duration(timeIn(sessions)),
      words: words.length + " 词",
      due: words.filter((w) => w.due <= Date.now()).length + " 词",
    },
    icons = { today: Clock3, total: Hourglass, words: Bookmark, due: Layers3 };
  const events = [
    ...books.map((b) => ({
      at: b.createdAt,
      label: "导入文章",
      name: b.title,
    })),
    ...words.map((w) => ({ at: w.createdAt, label: "收藏生词", name: w.word })),
    ...reviews.map((r) => ({ at: r.at, label: "复习单词", name: r.wordKey })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 4);
  return (
    <>
      <div className="heading">
        <div>
          <p className="dateline">
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </p>
          <h1>阅读工作台</h1>
        </div>
        <ArticleImport />
      </div>
      <div className="hero">
        <div>
          <div className="eyebrow">
            <BookOpen size={16} />
            {recent ? "继续阅读" : "我的阅读室"}
          </div>
          <h2>{recent ? recent.title : "从一篇英文开始"}</h2>
          <p>
            {recent
              ? import.meta.env.MODE === "iphone" && recent.format === "TXT"
                ? "从上次停下的地方继续阅读。"
                : "上次读到第 " +
                  (recent.page + 1) +
                  " 页，共 " +
                  recent.pages +
                  " 页。"
              : "带上你想读的文章，在上下文里认识新词。"}
          </p>
          <button
            onClick={() => navigate(recent ? "reader/" + recent.id : "reader")}
          >
            {recent ? "回到文章" : "打开阅读室"}
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="bookart" aria-hidden="true">
          <i />
          <i />
          <i />
          <b />
        </div>
      </div>
      {prefs.homeMetrics.length > 0 && (
        <div className="metrics">
          {prefs.homeMetrics.map((k) => {
            const Icon = icons[k];
            return (
              <div key={k}>
                <span>
                  <Icon size={15} />
                  {metricLabels[k]}
                </span>
                <strong>{metrics[k]}</strong>
              </div>
            );
          })}
        </div>
      )}
      <div className="overviewcols">
        <div>
          <div className="sectionhead">
            <h2>最近阅读</h2>
            <button className="plain" onClick={() => navigate("reader")}>
              查看书架 <ArrowRight size={14} />
            </button>
          </div>
          {books.length ? (
            <div className="list">
              {books.slice(0, 5).map((b) => (
                <div key={b.id} className="row">
                  <span className="miniicon">
                    <BookOpen size={18} />
                  </span>
                  <button
                    className="lead"
                    onClick={() => navigate("reader/" + b.id)}
                  >
                    <span>
                      <strong>{b.title}</strong>
                      <br />
                      <small>
                        {b.format} · {b.wordCount.toLocaleString()} 词
                      </small>
                    </span>
                  </button>
                  <small>{dateLabel(b.openedAt)}</small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="还没有阅读记录"
              text="导入文章后，你可以从这里接着读。"
            />
          )}
        </div>
        <div>
          <div className="sectionhead">
            <h2>学习动态</h2>
            <Activity size={17} />
          </div>
          {events.length ? (
            events.map((e, i) => (
              <div className="event" key={i}>
                <span />
                <div>
                  <small>
                    {e.label} · {dateLabel(e.at)}
                  </small>
                  <p>{e.name}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="quiet">
              收藏单词或开始阅读后，这里会留下你的学习记录。
            </p>
          )}
        </div>
      </div>
    </>
  );
}
export function Statistics() {
  const data = useLearning(),
    [period, setPeriod] = useState<"day" | "week" | "month">("week"),
    [offset, setOffset] = useState(0);
  const start = new Date(dayStart()),
    end = new Date(start);
  if (period === "month") {
    start.setDate(1);
    start.setMonth(start.getMonth() + offset);
    end.setTime(+start);
    end.setMonth(end.getMonth() + 1);
  } else {
    const days = period === "week" ? 7 : 1;
    start.setDate(
      start.getDate() +
        (period === "week" ? -((start.getDay() + 6) % 7) : 0) +
        offset * days,
    );
    end.setTime(+start);
    end.setDate(end.getDate() + days);
  }
  const bars: { label: string; ms: number }[] = [];
  for (const d = new Date(start); d < end; ) {
    const next = new Date(d);
    if (period === "day") next.setHours(next.getHours() + 1);
    else next.setDate(next.getDate() + 1);
    bars.push({
      label: period === "day" ? d.getHours() + "时" : dateLabel(+d),
      ms: timeIn(data.sessions, +d, +next),
    });
    d.setTime(+next);
  }
  const max = Math.max(1, ...bars.map((b) => b.ms)),
    inside = (n: number) => n >= +start && n < +end;
  const articles = new Set(
    data.sessions
      .filter((s) => s.end > +start && s.start < +end)
      .map((s) => s.bookId),
  ).size;
  return (
    <>
      <div className="heading">
        <div>
          <h1>学习统计</h1>
          <p>累计阅读 {duration(timeIn(data.sessions))}</p>
        </div>
        <select
          aria-label="统计周期"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value as typeof period);
            setOffset(0);
          }}
        >
          <option value="day">按日</option>
          <option value="week">按周</option>
          <option value="month">按月</option>
        </select>
      </div>
      <div className="row">
        <button onClick={() => setOffset(offset - 1)}>上一期</button>
        <b>
          {dateLabel(+start)} – {dateLabel(+end - 1)}
        </b>
        <button disabled={offset === 0} onClick={() => setOffset(offset + 1)}>
          下一期
        </button>
      </div>
      <div className="sectionhead">
        <h2>阅读时间</h2>
        <b>{duration(timeIn(data.sessions, +start, +end))}</b>
      </div>
      <div className="chart">
        {bars.map((b, i) => (
          <div
            key={i}
            title={b.label + " · " + duration(b.ms)}
            style={{
              height: b.ms ? Math.max(2, (100 * b.ms) / max) + "%" : "2px",
            }}
          />
        ))}
      </div>
      <div className="row small">
        <span>{bars[0].label}</span>
        <span>{bars.at(-1)?.label}</span>
      </div>
      <div className="metrics">
        <div>
          <span>阅读文章</span>
          <strong>{articles} 篇</strong>
        </div>
        <div>
          <span>新增词汇</span>
          <strong>
            {data.words.filter((w) => inside(w.createdAt)).length} 词
          </strong>
        </div>
        <div>
          <span>已复习词汇</span>
          <strong>
            {
              new Set(
                data.reviews.filter((r) => inside(r.at)).map((r) => r.wordKey),
              ).size
            }{" "}
            词
          </strong>
        </div>
      </div>
      <details className="setting">
        <summary>查看明细</summary>
        {bars.map((b) => (
          <div className="row setting" key={b.label}>
            {b.label}
            <span>{duration(b.ms)}</span>
          </div>
        ))}
      </details>
    </>
  );
}
