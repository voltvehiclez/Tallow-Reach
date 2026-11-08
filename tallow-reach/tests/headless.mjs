// Run gameplay code in a test with no browser.
//
// `sim/` files still import the 3D scene, the mesh builders and the sound (refactor
// steps 6 and 7 close that). To test the real gameplay code anyway, this helper
// bundles the file with esbuild and swaps `src/render/**` and `src/core/**` for
// do-nothing stand-ins. Every call into a stand-in is recorded, so a test can ask
// "which colour and scale was this enemy's model built with?".
//
// It is not a test file itself (no `.test.` in the name), so `npm test` does not
// run it; test files import it. esbuild is already a dev dependency of the build,
// so this adds no package.
//
// Usage:
//   import { loadHeadless } from "./headless.mjs";
//   const sim = await loadHeadless("src/sim/ai.js", { state: "src/state/state.js" });
//   sim.spawnEnemy("raider", { x: 0, y: 0, z: 0 });
//   sim.state.world.enemies.length;   // 1
//   sim.__calls.filter(c => c.name === "mkShip");

import * as esbuild from "esbuild";
import { writeFileSync, rmSync, readdirSync, readFileSync, statSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

/** The project root (this file lives in `tests/`). */
export const root = fileURLToPath(new URL("..", import.meta.url));

let stubNames = null;

/**
 * Every name imported from `src/render/` or `src/core/` anywhere in `src/`.
 * The stand-in module exports all of them, so a new import needs no edit here.
 */
function stubbedNames() {
  if (stubNames) return stubNames;
  const names = new Set();
  const walk = dir => {
    for (const file of readdirSync(dir)) {
      const p = path.join(dir, file);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!p.endsWith(".js")) continue;
      const src = readFileSync(p, "utf8");
      // Resolve each relative import the way the bundler will, so "./scene.js"
      // from inside render/ counts as a render import too.
      for (const m of src.matchAll(/import\s*(?:\*\s*as\s*\w+\s*)?\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
        if (!m[2].startsWith(".")) continue;
        const abs = path.resolve(path.dirname(p), m[2]);
        if (!/[\\/]src[\\/](render|core)[\\/][^\\/]*\.js$/.test(abs)) continue;
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/).pop().trim();
          if (name) names.add(name);
        }
      }
    }
  };
  walk(path.join(root, "src"));
  stubNames = [...names].sort();
  return stubNames;
}

/**
 * The stand-in module. Each export is a proxy that can be called, constructed,
 * read from and written to, and every call is pushed onto `__calls`.
 */
function standInSource() {
  return `
export const __calls = globalThis.__trHeadlessCalls;
// Calls on a stand-in's result are recorded under a longer name
// ("mkShip().position.copy"), so a test can filter for the real call by exact name.
const stand = name => new Proxy(function () {}, {
  get: (t, k) => (k === "then" ? undefined : k === Symbol.toPrimitive ? () => 0 : stand(name + "." + String(k))),
  apply: (t, self, args) => { __calls.push({ name, args }); return stand(name + "()"); },
  construct: (t, args) => { __calls.push({ name, args }); return stand(name + "()"); },
  set: () => true,
});
${stubbedNames().map(n => `export const ${n} = stand(${JSON.stringify(n)});`).join("\n")}
`;
}

/**
 * Stands in for `src/render/**` and `src/core/**`. `keep` names files that must
 * be bundled for real instead — that is how `tests/views.test.mjs` loads
 * `render/views.js` itself (the code under test) while the scene and the mesh
 * builders it calls stay stand-ins.
 */
function stubbedLayerFor(keep) {
  const kept = new Set(keep);
  const isKept = p => {
    const base = p.split(/[\\/]/).pop();
    return kept.has(base);
  };
  return {
  name: "tr-stub-screen-and-sound",
  setup(build) {
    // `./scene.js` (inside render/) has no "render/" in it, so the check is done
    // on where the import would land, not on how it is spelled.
    const inLayer = abs => /[\\/]src[\\/](render|core)[\\/][^\\/]*\.js$/.test(abs);
    build.onResolve({ filter: /^(\.{1,2}\/|\/)/ }, args => {
      const abs = path.resolve(args.resolveDir, args.path);
      if (!inLayer(abs)) return undefined;
      if (isKept(args.path)) return undefined;
      return { path: "stand-in", namespace: "tr-stand-in" };
    });
    const filters = [/[\\/]render[\\/][^"']*\.js$/, /[\\/]core[\\/][^"']*\.js$/];
    for (const filter of filters) {
      // Absolute and bare paths ("../render/scene.js" from sim/, or a project
      // file named by a test's extras) arrive here.
      build.onResolve({ filter }, args => {
        if (isKept(args.path)) return undefined;      // bundle the real file
        return { path: "stand-in", namespace: "tr-stand-in" };
      });
    }
    build.onLoad({ filter: /.*/, namespace: "tr-stand-in" }, () => ({
      contents: standInSource(),
      loader: "js",
    }));
  },
  };
}

const cache = new Map();

/**
 * Bundle `entry` (a project-relative path such as "src/sim/ai.js") and import it.
 * `extras` is `{ exportName: "module path" }`, re-exported by name so a test can
 * reach the same live state object the bundle uses — something a plain import
 * cannot do, because the bundle has its own copy.
 *
 * `opts.keep` is a list of file names under `src/render/` or `src/core/` that must
 * be loaded for real instead of stubbed (default: none). `tests/views.test.mjs`
 * uses it to test `render/views.js`, which is a render file itself.
 *
 * Resolves to the module namespace, plus `__calls` (the recorded stand-in calls).
 */
export async function loadHeadless(entry, extras = {}, opts = {}) {
  const keep = opts.keep || [];
  const key = entry + "|" + JSON.stringify(extras) + "|" + JSON.stringify(keep);
  if (cache.has(key)) return cache.get(key);

  // Stub calls are recorded here (the bundle and the test share one process).
  globalThis.__trHeadlessCalls = [];

  const reexports = Object.entries(extras)
    .map(([name, from]) => `export { ${name} } from ${JSON.stringify("./" + from.replace(/^\.?\//, ""))};`)
    .join("\n");

  const built = await esbuild.build({
    stdin: {
      contents: `export * from ${JSON.stringify("./" + entry.replace(/^\.?\//, ""))};\n${reexports}\n`,
      resolveDir: root,
      sourcefile: "headless-entry.js",
      loader: "js",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [stubbedLayerFor(keep)],
  });

  const file = path.join(os.tmpdir(), `tallow-reach-headless-${process.pid}-${cache.size}.mjs`);
  writeFileSync(file, built.outputFiles[0].text);
  try {
    const mod = await import(pathToFileURL(file).href);
    // The namespace is read-only, so hand back a plain copy plus the call log.
    const out = { __calls: globalThis.__trHeadlessCalls };
    for (const name of Object.keys(mod)) out[name] = mod[name];
    cache.set(key, out);
    return out;
  } finally {
    // The module is already evaluated, so the file is no longer needed.
    rmSync(file, { force: true });
  }
}
