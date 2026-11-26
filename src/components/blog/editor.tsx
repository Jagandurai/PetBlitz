"use client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { ReactNode, useRef, useState } from "react";
import { LuBold, LuHeading2, LuHeading3, LuHeading4, LuImage, LuItalic, LuLink, LuList, LuListOrdered, LuMinus, LuPilcrow, LuQuote, LuRedo2, LuUndo2, LuUpload } from "react-icons/lu";
import { RichNode, isSafeHref, isSafeImageSrc } from "@/lib/blog-content";
import { errText } from "@/lib/ui/api";
import { useToast } from "@/lib/ui/hooks";
import { uploadImage } from "@/lib/ui/upload";

/** WYSIWYG editor. Only enables what the server accepts (see validations/blog.validation.ts). */
export default function RichEditor({ initial, onChange }: { initial: RichNode; onChange: (doc: RichNode) => void }) {
  const { toast } = useToast();
  const [panel, setPanel] = useState<null | "link" | "image">(null);
  const [url, setUrl] = useState(""), [alt, setAlt] = useState(""), [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true, // keeps the toolbar state current
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, code: false, codeBlock: false, strike: false, underline: false, link: { openOnClick: false, autolink: true, isAllowedUri: (u) => isSafeHref(u) } }),
      Image,
    ],
    content: initial.content?.length ? initial : "",
    editorProps: { attributes: { "aria-label": "Article content", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichNode),
  });
  if (!editor) return <div className="bl-editor"><div className="spin" aria-label="Loading editor" /></div>;
  const s = ((e) => ({
      p: e.isActive("paragraph"), h2: e.isActive("heading", { level: 2 }), h3: e.isActive("heading", { level: 3 }), h4: e.isActive("heading", { level: 4 }),
      bold: e.isActive("bold"), italic: e.isActive("italic"), ul: e.isActive("bulletList"), ol: e.isActive("orderedList"), quote: e.isActive("blockquote"), link: e.isActive("link"),
      undo: e.can().undo(), redo: e.can().redo(),
  }))(editor);
  const run = () => editor.chain().focus();
  const btn = (label: string, icon: ReactNode, on: boolean, act: () => void, disabled = false) =>
    <button type="button" title={label} aria-label={label} aria-pressed={on} className={on ? "on" : ""} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={act}>{icon}</button>;
  const openPanel = (p: "link" | "image") => { setUrl(p === "link" ? (editor.getAttributes("link").href ?? "") : ""); setAlt(""); setPanel(panel === p ? null : p); };

  const applyLink = () => {
    const href = url.trim();
    if (!href) run().extendMarkRange("link").unsetLink().run();
    else if (!isSafeHref(href)) return toast("Use a link starting with https://, mailto:, tel: or /", "err");
    else if (editor.state.selection.empty && !s.link) run().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    else run().extendMarkRange("link").setLink({ href }).run();
    setPanel(null);
  };
  const insertImage = (src: string) => {
    if (!isSafeImageSrc(src)) return toast("Image links must start with https://", "err");
    run().setImage({ src, alt: alt.trim() }).run();
    setPanel(null);
  };
  const upload = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try { insertImage((await uploadImage(f, "blog")).url); } catch (e) { toast(errText(e), "err"); } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };
  const enter = (e: React.KeyboardEvent, act: () => void) => { if (e.key === "Enter") { e.preventDefault(); act(); } if (e.key === "Escape") setPanel(null); };

  return (
    <div className="bl-editor">
      <div className="bl-tools" role="toolbar" aria-label="Formatting">
        {btn("Paragraph", <LuPilcrow />, s.p && !s.quote && !s.ul && !s.ol, () => run().setParagraph().run())}
        {btn("Heading", <LuHeading2 />, s.h2, () => run().toggleHeading({ level: 2 }).run())}
        {btn("Sub-heading", <LuHeading3 />, s.h3, () => run().toggleHeading({ level: 3 }).run())}
        {btn("Minor heading", <LuHeading4 />, s.h4, () => run().toggleHeading({ level: 4 }).run())}
        <i />
        {btn("Bold", <LuBold />, s.bold, () => run().toggleBold().run())}
        {btn("Italic", <LuItalic />, s.italic, () => run().toggleItalic().run())}
        {btn("Link", <LuLink />, s.link, () => openPanel("link"))}
        <i />
        {btn("Bulleted list", <LuList />, s.ul, () => run().toggleBulletList().run())}
        {btn("Numbered list", <LuListOrdered />, s.ol, () => run().toggleOrderedList().run())}
        {btn("Quote", <LuQuote />, s.quote, () => run().toggleBlockquote().run())}
        {btn("Image", <LuImage />, false, () => openPanel("image"))}
        {btn("Divider", <LuMinus />, false, () => run().setHorizontalRule().run())}
        <i />
        {btn("Undo", <LuUndo2 />, false, () => run().undo().run(), !s.undo)}
        {btn("Redo", <LuRedo2 />, false, () => run().redo().run(), !s.redo)}
      </div>
      {panel === "link" && <div className="bl-panel"><input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => enter(e, applyLink)} placeholder="https://… (leave empty to remove the link)" aria-label="Link address" /><button type="button" className="btn sm" onClick={applyLink}>Apply</button><button type="button" className="btn sm ghost" onClick={() => setPanel(null)}>Cancel</button></div>}
      {panel === "image" && <div className="bl-panel">
        <input autoFocus value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Image description (alt text)" aria-label="Image description" maxLength={200} />
        <button type="button" className="btn sm" disabled={busy} onClick={() => file.current?.click()}><LuUpload /> {busy ? "Uploading…" : "Upload"}</button>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => enter(e, () => insertImage(url.trim()))} placeholder="…or paste an https:// image link" aria-label="Image address" />
        <button type="button" className="btn sm ghost" disabled={!url} onClick={() => insertImage(url.trim())}>Insert</button>
      </div>}
      <EditorContent editor={editor} />
    </div>
  );
}
