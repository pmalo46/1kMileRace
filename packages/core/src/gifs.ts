/**
 * GIFs from GIPHY for comments. The gifs edge function searches GIPHY and trims each result
 * down to the one small rendition the app shows, in a picker and in the thread.
 */

export interface Gif {
  id: string;
  url: string;
  width: number;
  height: number;
  /** GIPHY's description, for screen readers. */
  title: string;
}

/** The only hosts a comment's GIF may come from. Mirrors the check on comments.gif_url. */
export const GIPHY_MEDIA = /^https:\/\/media[0-9]*\.giphy\.com\//;

interface Rendition {
  url?: string;
  webp?: string;
  width?: string;
  height?: string;
}

/** GIPHY's search or trending response as a list of GIFs, skipping any that can't be shown. */
export function gifsFromGiphy(response: unknown): Gif[] {
  const data = (response as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((g: { id?: unknown; title?: unknown; images?: { fixed_width?: Rendition } }) => {
    const r = g.images?.fixed_width;
    // WebP is a fraction of the size of the same GIF.
    const url = r?.webp ?? r?.url;
    const width = Number(r?.width);
    const height = Number(r?.height);
    if (typeof g.id !== "string" || !url || !GIPHY_MEDIA.test(url) || !(width > 0) || !(height > 0)) return [];
    return [{ id: g.id, url, width, height, title: typeof g.title === "string" ? g.title : "" }];
  });
}
