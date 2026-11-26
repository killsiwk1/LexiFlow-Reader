import { useEffect, useRef, type ReactNode } from "react";
import { X, BookOpen, Upload } from "lucide-react";

export const dateLabel = (t: number) =>
  new Date(t).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
export function duration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
    : ms > 0 && minutes === 0
      ? "不足 1 分"
      : minutes + " 分钟";
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  useEffect(() => {
    if (
      !("__TAURI_INTERNALS__" in window) ||
      !navigator.userAgent.includes("Android")
    )
      return;
    const subscription = import("@tauri-apps/api/app").then((api) =>
      api.onBackButtonPress(() => close()),
    );
    return () => {
      void subscription.then((listener) => listener.unregister());
    };
  }, [close]);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="modal">
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="关闭" onClick={close}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <BookOpen size={25} strokeWidth={1.4} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
export function ImportButton({
  onFile,
  accept,
  children,
  secondary = false,
}: {
  onFile: (f: File) => Promise<void>;
  accept: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />
      <button
        className={secondary ? "" : "primary"}
        onClick={() => input.current?.click()}
      >
        <Upload size={16} />
        {children}
      </button>
    </>
  );
}
export function navigate(path: string) {
  location.hash = path;
}
