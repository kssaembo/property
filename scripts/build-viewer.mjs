import { build } from "vite";
import { mkdirSync, writeFileSync } from "node:fs";
// A self-contained viewer: no editor, IndexedDB calls, API tokens, or remote assets.
const result = await build({
  configFile: false,
  base: "./",
  publicDir: false,
  build: {
    write: false,
    assetsInlineLimit: 50_000_000,
    minify: true,
    rollupOptions: {
      input: "viewer.html",
      output: { inlineDynamicImports: true },
    },
    cssCodeSplit: false,
  },
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(
  (r) => r.output,
);
let html = String(outputs.find((x) => x.fileName === "viewer.html").source);
html = html.replace(
  /<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_, path) => {
    const file = outputs.find((x) => path.endsWith(x.fileName));
    if (!file || file.type !== "chunk") throw Error("Viewer JS missing");
    return (
      "<script>" + file.code.replace(/<\/script/gi, "<\\/script") + "</script>"
    );
  },
);
html = html.replace(/<link\b[^>]*href="([^"]+\.css)"[^>]*>/g, (_, path) => {
  const file = outputs.find((x) => path.endsWith(x.fileName));
  if (!file) throw Error("Viewer CSS missing");
  return "<style>" + String(file.source) + "</style>";
});
html = html.replace(
  "<head>",
  "<head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'\">",
);
// Vite places JS in the head; defer its execution until the data and root exist.
html = html.replace(
  /<script>([\s\S]*?)<\/script>/,
  (_, js) =>
    '<script>document.addEventListener("DOMContentLoaded",()=>{' +
    js +
    "});</script>",
);
mkdirSync("public", { recursive: true });
writeFileSync("public/published-template.html", html);
console.log("Self-contained read-only template ready:", html.length, "bytes");
