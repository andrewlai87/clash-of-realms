// Minimal zero-dependency static file server (works on old Node too).
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.normalize(__dirname + "/..");
const port = process.argv[2] ? +process.argv[2] : 4173;

const MIME = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const full = path.normalize(path.join(root, p));
  if (!full.startsWith(root)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(port, () => console.log("listening on " + port));
