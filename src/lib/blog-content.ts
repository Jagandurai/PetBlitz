/**
 * Blog rich-text document, shared by the server validator and the React renderer (safe to import in the browser).
 * Only the node and mark types listed here exist; there is no raw-HTML node.
 */
export interface RichMark { type: "bold" | "italic" | "link"; attrs?: { href?: string } }
export interface RichNode { type: string; text?: string; attrs?: { level?: number; start?: number; src?: string; alt?: string }; marks?: RichMark[]; content?: RichNode[] }

/** Links: web, e-mail, phone, same-site paths and anchors. Blocks javascript:, data: and protocol-relative URLs. */
export const isSafeHref = (v: string) => /^(https?:\/\/|mailto:|tel:|\/(?![/\\])|#)/i.test(v) && !/[\u0000- ]/.test(v);
export const isSafeImageSrc = (v: string) => /^https:\/\/[^\s]+$/i.test(v);

export const plainText = (n: RichNode | undefined): string => (!n ? "" : n.text ?? (n.content ?? []).map(plainText).join(n.type === "paragraph" || n.type === "heading" ? "" : " "));
export const readingMinutes = (n: RichNode | undefined) => Math.max(1, Math.ceil(plainText(n).split(/\s+/).filter(Boolean).length / 220));
export const hasBody = (n: RichNode | undefined): boolean => !!n && (!!n.text?.trim() || n.type === "image" || !!n.content?.some(hasBody));
