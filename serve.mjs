// Serves the built game (game/tallow-reach.html) for play-testing in a browser.
// Usage: node serve.mjs [port]
//
// This is a *testing convenience only*: it is not part of the game and nothing in
// src/ imports it. The real build is still `npm run build`, which writes one
// self-contained HTML file the user opens with a double click.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";

const port = Number(process.argv[2] || process.env.PORT || 8080);
const root = "game";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  let file = join(root, url === "/" ? "tallow-reach.html" : url);

  if (!existsSync(file)) {
    // One file only: any unknown path is the game itself, so a refresh on a
    // hash route still loads.
    file = join(root, "tallow-reach.html");
    if (!existsSync(file)) {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("game/tallow-reach.html is missing — run: npm run build");
      return;
    }
  }

  const body = readFileSync(file);
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] || "application/octet-stream",
    "content-length": body.length,
    // No caching while testing, so a rebuild shows up on refresh.
    "cache-control": "no-store",
  });
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Tallow Reach is being served on http://0.0.0.0:${port}`);
});
