import { describe, expect, it } from "vitest";
import { gifsFromGiphy } from "./gifs.ts";

const giphy = (id: string, fixed: Record<string, string>, title = "Running dog") => ({
  id,
  title,
  images: { fixed_width: fixed },
});

describe("gifsFromGiphy", () => {
  it("keeps the small WebP rendition and its size", () => {
    const gifs = gifsFromGiphy({
      data: [
        giphy("a1", {
          url: "https://media2.giphy.com/media/a1/200w.gif",
          webp: "https://media2.giphy.com/media/a1/200w.webp",
          width: "200",
          height: "150",
        }),
      ],
    });
    expect(gifs).toEqual([
      { id: "a1", url: "https://media2.giphy.com/media/a1/200w.webp", width: 200, height: 150, title: "Running dog" },
    ]);
  });

  it("falls back to the GIF, and skips anything without a size or off GIPHY's hosts", () => {
    const gifs = gifsFromGiphy({
      data: [
        giphy("a1", { url: "https://media.giphy.com/media/a1/200w.gif", width: "200", height: "112" }),
        giphy("a2", { url: "https://media.giphy.com/media/a2/200w.gif", width: "200" }),
        giphy("a3", { url: "https://example.com/a3.gif", width: "200", height: "200" }),
      ],
    });
    expect(gifs.map((g) => [g.id, g.url])).toEqual([["a1", "https://media.giphy.com/media/a1/200w.gif"]]);
  });

  it("returns nothing for an error response", () => {
    expect(gifsFromGiphy({ meta: { status: 401 } })).toEqual([]);
    expect(gifsFromGiphy(null)).toEqual([]);
  });
});
