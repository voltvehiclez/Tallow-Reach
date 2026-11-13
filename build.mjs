// Builds a single self-contained HTML file (game/tallow-reach.html).
// Usage: node build.mjs            one-off build
//        node build.mjs --watch    rebuild on every save
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const watch = process.argv.includes("--watch");
const shell = readFileSync("src/index.html", "utf8");
const css = readFileSync("src/styles.css", "utf8");

function writeBundle(result) {
  if (result.errors.length) {
    console.error("build failed");
    return;
  }
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const html = shell.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js);
  mkdirSync("game", { recursive: true });
  writeFileSync("game/tallow-reach.html", html);
  console.log(`built game/tallow-reach.html (${(html.length / 1024).toFixed(0)} KB)`);
}

const options = {
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  legalComments: "none",
  write: false,
  plugins: [
    {
      name: "html-shell",
      setup(build) {
        build.onEnd(writeBundle);
      },
    },
  ],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src/ ...");
} else {
  await esbuild.build(options); // the html-shell plugin writes the file
}
