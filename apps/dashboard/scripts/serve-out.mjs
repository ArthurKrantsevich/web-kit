// Serves out/ under /web-kit/ the way GitHub Pages does: folders resolve to index.html, misses get 404.html.
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "/web-kit";
const PORT = Number(process.env.PORT ?? 4173);
const root = fileURLToPath(new URL("../out/", import.meta.url));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function resolveFile(pathname) {
  const rel = normalize(decodeURIComponent(pathname.slice(BASE.length))).replace(/^[/\\]+/, "");
  if (rel.startsWith("..")) return null;
  let file = join(root, rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    await stat(file);
    return file;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  const file = pathname.startsWith(`${BASE}/`) ? await resolveFile(pathname) : null;
  if (!file) {
    res.writeHead(404, { "content-type": TYPES[".html"] });
    res.end(await readFile(join(root, "404.html")));
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(await readFile(file));
}).listen(PORT, () => console.log(`serving ${root} at http://localhost:${PORT}${BASE}/`));
