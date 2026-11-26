/** Cloudinary on-the-fly resize/format (f_auto,q_auto). Non-Cloudinary URLs are returned unchanged. Usable on server and client. */
export function cdn(url: string | undefined | null, width = 600): string | undefined {
  if (!url) return undefined;
  const m = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(v\d+\/.+)$/.exec(url);
  return m ? `${m[1]}f_auto,q_auto,c_limit,w_${width}/${m[2]}` : url;
}
