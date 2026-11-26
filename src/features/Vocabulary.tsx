import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, Download, Bookmark } from "lucide-react";
import { db } from "../data/db";
import { newWord, keyOf, removeWord } from "../data/words";
import { grades, wordSchema, type Word, type Grade } from "../data/schema";
import { csv, saveFile } from "../data/backup";
import { Empty, Modal, navigate, dateLabel } from "../ui";
export const gradeLabels = {
  Again: "不熟悉",
  Hard: "较困难",
  Good: "基本掌握",
  Easy: "很熟悉",
};
function Editor({
  word,
  adding,
  close,
}: {
  word: Word;
  adding: boolean;
  close: () => void;
}) {
  const [w, set] = useState(word),
    [error, setError] = useState(""),
    [remove, setRemove] = useState(false);
  function field(
    k:
      | "word"
      | "phonetic"
      | "partOfSpeech"
      | "definitionZh"
      | "definitionEn"
      | "example",
    label: string,
    long = false,
  ) {
    return (
      <label className="field">
        {label}
        {long ? (
          <textarea
            value={w[k]}
            onChange={(e) => set({ ...w, [k]: e.target.value })}
          />
        ) : (
          <input
            required={k === "word"}
            disabled={k === "word" && !adding}
            value={w[k]}
            onChange={(e) => set({ ...w, [k]: e.target.value })}
          />
        )}
      </label>
    );
  }
  return (
    <Modal title={adding ? "手动添加单词" : w.word} close={close}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const v = wordSchema.parse({
              ...w,
              word: w.word.trim(),
              key: keyOf(w.word),
            });
            if (adding) await db.words.add(v);
            else {
              const count = await db.words.update(v.key, {
                phonetic: v.phonetic,
                partOfSpeech: v.partOfSpeech,
                definitionZh: v.definitionZh,
                definitionEn: v.definitionEn,
                example: v.example,
                familiarity: v.familiarity,
              });
              if (!count) throw Error("词条已删除。");
            }
            close();
          } catch (e) {
            setError(
              e instanceof Error && e.name === "ConstraintError"
                ? "生词本中已有这个单词。"
                : "无法保存，请检查词条和字段长度。",
            );
          }
        }}
      >
        {field("word", "单词")}
        {field("phonetic", "音标")}
        {field("partOfSpeech", "词性")}
        {field("definitionZh", "中文释义", true)}
        {field("definitionEn", "英文释义", true)}
        {field("example", "例句", true)}
        <label className="field">
          熟悉程度
          <select
            value={w.familiarity}
            onChange={(e) =>
              set({ ...w, familiarity: e.target.value as Grade })
            }
          >
            {grades.map((g) => (
              <option value={g} key={g}>
                {gradeLabels[g]}
              </option>
            ))}
          </select>
        </label>
        {w.sources.map((s) => (
          <div className="stack" key={s.bookId}>
            <small>来源 · {s.title}</small>
            <blockquote>{s.context}</blockquote>
          </div>
        ))}
        {error && <p role="alert">{error}</p>}
        <div className="actions">
          <button className="primary" type="submit">
            保存词条
          </button>
          {!adding && (
            <button type="button" onClick={() => setRemove(true)}>
              删除词条
            </button>
          )}
        </div>
      </form>
      {remove && (
        <div className="stack">
          <p>同时删除这个单词的复习历史？</p>
          <button
            onClick={async () => {
              await removeWord(w.key);
              close();
            }}
          >
            确认删除词条
          </button>
        </div>
      )}
    </Modal>
  );
}
export function Vocabulary({ id }: { id: string }) {
  const words = useLiveQuery(() => db.words.toArray(), [], []),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [filter, setFilter] = useState("all"),
    [adding, setAdding] = useState(false),
    [limit, setLimit] = useState(80);
  const filtered = words
    .filter(
      (w) =>
        (filter === "all" || w.familiarity === filter) &&
        (w.word + " " + w.definitionZh)
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === "alpha"
        ? a.word.localeCompare(b.word, "en")
        : b.createdAt - a.createdAt,
    );
  const selected = words.find((w) => w.key === id);
  return (
    <>
      <div className="heading">
        <div>
          <h1>生词本</h1>
          <p>已收藏 {words.length} 个词条</p>
        </div>
        <div className="actions">
          <button
            onClick={() =>
              void saveFile(
                "LexiFlow-vocabulary.csv",
                csv(filtered),
                "text/csv",
              )
            }
          >
            <Download size={16} />
            导出 CSV
          </button>
          <button className="primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            添加单词
          </button>
        </div>
      </div>
      <div className="filters">
        <label>
          <Search size={15} />
          <input
            aria-label="搜索单词或释义"
            placeholder="搜索单词或释义"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="熟悉程度筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">全部熟悉程度</option>
          {grades.map((g) => (
            <option value={g} key={g}>
              {gradeLabels[g]}
            </option>
          ))}
        </select>
        <select
          aria-label="排序方式"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">最近收藏</option>
          <option value="alpha">字母顺序</option>
        </select>
      </div>
      {filtered.length ? (
        <div className="list">
          {filtered.slice(0, limit).map((w) => (
            <div className="row" key={w.key}>
              <Bookmark size={16} />
              <button
                className="lead"
                onClick={() =>
                  navigate("vocabulary/" + encodeURIComponent(w.key))
                }
              >
                <span>
                  <strong>{w.word}</strong>
                  <span className="excerpt">
                    {w.definitionZh || "尚无释义"}
                  </span>
                </span>
              </button>
              <small>
                {gradeLabels[w.familiarity]}
                <br />
                {dateLabel(w.createdAt)}
              </small>
            </div>
          ))}
          {filtered.length > limit && (
            <button onClick={() => setLimit(limit + 80)}>显示更多</button>
          )}
        </div>
      ) : (
        <Empty
          title={words.length ? "没有匹配的词条" : "尚未收藏生词"}
          text={
            words.length
              ? "可以调整搜索条件。"
              : "在文章里点击单词收藏，或手动添加词条。"
          }
        />
      )}
      {(selected || adding) && (
        <Editor
          key={selected?.key || "new"}
          word={selected || newWord("")}
          adding={!selected}
          close={() => {
            setAdding(false);
            navigate("vocabulary");
          }}
        />
      )}
    </>
  );
}
