import { useEffect, useState } from "react";
import {
  BookOpen,
  LibraryBig,
  House,
  Layers3,
  ChartNoAxesColumn,
  Settings2,
  ChevronRight,
  LockKeyhole,
} from "lucide-react";
import { navigate } from "./ui";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./data/db";
import { appTheme, defaults } from "./data/schema";
import { Reader, Library } from "./features/Reader";
import { Home, Statistics } from "./features/Overview";
import { Vocabulary } from "./features/Vocabulary";
import { Review } from "./features/Review";
import { Settings } from "./features/Settings";
import { Announcement, rememberNotice, showFirstNotice } from "./features/Announcement";
import "./style.css";
export const pages = [
  ["home", "首页", House],
  ["reader", "阅读室", BookOpen],
  ["vocabulary", "生词本", LibraryBig],
  ["review", "复习", Layers3],
  ["statistics", "学习统计", ChartNoAxesColumn],
  ["settings", "设置", Settings2],
] as const;
export default function App() {
  const [notice, setNotice] = useState(showFirstNotice);
  useEffect(() => { if (notice) rememberNotice(); }, [notice]);
  const [route, setRoute] = useState(location.hash.slice(1) || "home");
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const prefs = useLiveQuery(
    async () => (await db.settings.get("main")) || defaults,
    [],
    defaults,
  );
  const [message, notify] = useState("");
  useEffect(() => {
    const listener = (e: PromiseRejectionEvent) => {
      e.preventDefault();
      notify(e.reason instanceof Error ? e.reason.message : String(e.reason));
    };
    window.addEventListener("unhandledrejection", listener);
    return () => window.removeEventListener("unhandledrejection", listener);
  }, []);
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const theme = appTheme(prefs);
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (mq.matches ? "night" : "white") : theme;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [prefs.theme, prefs.readingTheme]);
  const id = decodeURIComponent(route.split("/")[1] || "");
  const page = pages.find((p) => p[0] === route.split("/")[0]) || pages[0];
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <img src="./lexiflow-icon.png" height="38" width="38" alt="" />
          LexiFlow
        </div>
        <div className="navtag">个人工作区</div>
        <nav>
          {pages.map(([key, label, Icon]) => (
            <button
              key={key}
              className={page[0] === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="privacy">
          <LockKeyhole size={14} /> 本地工作区
        </div>
      </aside>
      <main>
        <div className="crumb">
          工作区 <ChevronRight size={13} /> <b>{page[1]}</b>
        </div>
        <section className="workspace">
          {page[0] === "reader" ? (
            id ? (
              <Reader key={id} id={id} prefs={prefs} />
            ) : (
              <Library />
            )
          ) : page[0] === "home" ? (
            <Home prefs={prefs} />
          ) : page[0] === "vocabulary" ? (
            <Vocabulary id={id} />
          ) : page[0] === "review" ? (
            <Review />
          ) : page[0] === "statistics" ? (
            <Statistics />
          ) : (
            <Settings prefs={prefs} openNotice={() => setNotice(true)} />
          )}
        </section>
      </main>
      {notice && <Announcement close={() => setNotice(false)} />}
      {message && (
        <button className="notice" role="alert" onClick={() => notify("")}>
          {message} ×
        </button>
      )}
    </div>
  );
}
