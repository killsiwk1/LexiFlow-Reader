import { Modal, navigate } from "../ui";

const noticeKey = "lexiflow.notice.reader.seen";
export function showFirstNotice() {
  if (import.meta.env.MODE === "iphone") return false;
  try { return localStorage.getItem(noticeKey) !== "1"; }
  catch { return true; }
}

export function rememberNotice() {
  try { localStorage.setItem(noticeKey, "1"); }
  catch { /* The open dialog can still be dismissed if storage is disabled. */ }
}

export function Announcement({ close }: { close: () => void }) {
  return (
    <Modal title="读者公告" close={close}>
      <article className="notice-copy" tabIndex={0} aria-label="公告正文">
        <h3>开始离线阅读</h3>
        <p>在首页或阅读室点「导入文章」，选择本机的 TXT、Markdown、EPUB、PDF 或 DOCX。软件会记住每份文件的阅读位置。</p>
        <p>读到陌生的英文单词，点词查看离线释义，点「收藏生词」保存。选中想记住的英文句子也可以收藏。隔几章再到「生词本」回看，或进入「复习」练习到期词汇。</p>
        <p>想读自己的文章，可以在首页或阅读室点「导入文章」。阅读进度和学习记录保存在本机。以后可在「设置 → 读者公告」重读这份说明。</p>
      </article>
      <div className="notice-actions">
        <button onClick={close}>知道了</button>
        <button className="primary" onClick={() => { close(); navigate("reader"); }}>去阅读室</button>
      </div>
    </Modal>
  );
}
