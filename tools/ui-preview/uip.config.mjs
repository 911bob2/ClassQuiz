// ClassQuiz UI Preview - Vite configuration.
// Reuses the *frontend's* installed vite / svelte / tailwind / preprocessors so the
// preview always renders with exactly the same toolchain versions as the real app.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import fs from "node:fs";
import { previewEndpoints } from "./lib/endpoints.mjs";

export const UIP_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(UIP_ROOT, "../..");
export const FRONTEND = path.join(REPO_ROOT, "frontend");
export const FRONTEND_SRC = path.join(FRONTEND, "src");
export const FRONTEND_NM = path.join(FRONTEND, "node_modules");
export const PORT = Number(process.env.UIP_PORT || 9999);

if (!fs.existsSync(path.join(FRONTEND_NM, "vite"))) {
  console.error(
    "[uip] frontend/node_modules is missing. Install the frontend dependencies first (cd frontend && pnpm install).",
  );
  process.exit(1);
}

/** Import a package from frontend/node_modules (honours its "exports" map). */
const fromFrontend = async (spec) => {
  const { createRequire } = await import("node:module");
  const req = createRequire(path.join(FRONTEND, "package.json"));
  let resolved;
  try {
    resolved = req.resolve(spec);
  } catch {
    // ESM-only packages: resolve the package.json and follow "exports"/"module" manually
    const pkgDir = path.join(FRONTEND_NM, spec);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
    );
    const exp = pkg.exports?.["."];
    const entry =
      (typeof exp === "string"
        ? exp
        : (exp?.import?.default ?? exp?.import ?? exp?.default)) ||
      pkg.module ||
      pkg.main;
    resolved = path.join(pkgDir, entry);
  }
  return import(pathToFileURL(resolved).href);
};

export const loadVite = () => fromFrontend("vite");

const toPosix = (p) => p.split(path.sep).join("/");

/** Redirects imports that cannot / must not resolve to the real frontend modules. */
function uipResolver(FRONTEND_SRC, UIP_ROOT) {
  const socketReal = toPosix(path.join(FRONTEND_SRC, "lib", "socket.ts"));
  const shimDir = toPosix(path.join(UIP_ROOT, "src", "shims"));
  const uipSrc = toPosix(path.join(UIP_ROOT, "src"));
  const frontendAnchor = path.join(FRONTEND_SRC, "app.d.ts");
  return {
    name: "uip-resolver",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // SvelteKit virtual modules -> shims
      const m =
        /^\$app\/(environment|state|navigation|paths|stores|forms)$/.exec(
          source,
        );
      if (m) return `${shimDir}/app-${m[1]}.ts`;
      // Bare imports coming from ui-preview sources: resolve them as if imported from
      // frontend/src so a single copy of svelte (and every other lib) is used.
      if (
        importer &&
        toPosix(importer).startsWith(uipSrc) &&
        !toPosix(importer).includes("/node_modules/") &&
        /^[a-z@]/i.test(source) &&
        !source.startsWith("virtual:")
      ) {
        const r = await this.resolve(source, frontendAnchor, {
          ...options,
          skipSelf: true,
        });
        if (r) return r;
      }
      return null;
    },
    load(id) {
      // Any import of frontend/src/lib/socket.ts ($lib/socket, ./socket, ...) gets the mock
      if (toPosix(id.split("?")[0]) === socketReal) {
        return `export { socket } from '${shimDir}/socket.ts';`;
      }
      return null;
    },
    transform(code, id) {
      const file = toPosix(id.split("?")[0]);
      if (file === toPosix(path.join(FRONTEND_SRC, "app.css"))) {
        return (
          code +
          `\n@source "${toPosix(FRONTEND_SRC)}/**/*.{svelte,ts,js}";\n@custom-variant dark (&:where(.dark, .dark *));\n`
        );
      }
      if (
        file.startsWith(toPosix(FRONTEND_SRC) + "/") &&
        /\.(svelte|ts|js)$/.test(file)
      ) {
        return code
          .replaceAll("window.location", "window.__UIP_LOCATION__")
          .replaceAll("https://http.cat/", "/__mock-assets/cat-");
      }
    },
  };
}

export async function createConfig(options = {}) {
  const REPO_ROOT = options.repo ?? path.resolve(UIP_ROOT, "../..");
  const root = options.root ?? UIP_ROOT;
  const FRONTEND = path.join(REPO_ROOT, "frontend");
  const FRONTEND_SRC = path.join(FRONTEND, "src");
  if (options.revision && !fs.existsSync(path.join(FRONTEND, "node_modules"))) {
    fs.symlinkSync(
      FRONTEND_NM,
      path.join(FRONTEND, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  if (options.revision) {
    fs.mkdirSync(path.join(FRONTEND, ".svelte-kit"), { recursive: true });
    fs.writeFileSync(
      path.join(FRONTEND, ".svelte-kit/tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          verbatimModuleSyntax: true,
          isolatedModules: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
        },
      }),
    );
  }

  // Share the installed runtime packages. Junctions work without elevation on Windows.
  const pkg = JSON.parse(
    fs.readFileSync(path.join(FRONTEND, "package.json"), "utf8"),
  );
  for (const name of Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })) {
    const from = path.join(FRONTEND_NM, name),
      to = path.join(root, "node_modules", name);
    if (!fs.existsSync(to) && fs.existsSync(from)) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.symlinkSync(
        from,
        to,
        process.platform === "win32" ? "junction" : "dir",
      );
    }
  }
  const { svelte } = await fromFrontend("@sveltejs/vite-plugin-svelte");
  const tailwind = (await fromFrontend("@tailwindcss/postcss")).default;
  // Reuse the frontend's own preprocess chain (svelte-preprocess + mdsvex).
  const svelteConfig = (
    await import(
      pathToFileURL(path.join(path.dirname(FRONTEND_NM), "svelte.config.js"))
        .href
    )
  ).default;
  const preprocess = (await fromFrontend("svelte-preprocess")).default;
  const { mdsvex } = await fromFrontend("mdsvex");
  const { transformWithEsbuild } = await loadVite();
  const basePreprocess = preprocess({
    sourceMap: true,
    postcss: false,
    typescript: {
      compilerOptions: { verbatimModuleSyntax: true, sourceMap: true },
    },
  });
  // Svelte dev DOM locations refer to the preprocessed markup. Keep its line/column
  // positions identical to the original .svelte file, even when TS erases types.
  const linePreserving = {
    ...basePreprocess,
    async script(input) {
      let result = await basePreprocess.script(input);
      if (!result) return result;
      const lines = input.content.split("\n").length;
      if (result.code.split("\n").length > lines) {
        const compact = await transformWithEsbuild(
          result.code,
          input.filename + ".js",
          { loader: "js", minifyWhitespace: true, legalComments: "none" },
          result.map,
        );
        result = { ...result, code: compact.code, map: compact.map };
      }
      result.code += "\n".repeat(
        Math.max(0, lines - result.code.split("\n").length),
      );
      return result;
    },
  };

  return {
    configFile: false,
    root,
    base: options.base ?? "/",
    publicDir: path.join(FRONTEND, "static"),
    cacheDir: path.join(
      UIP_ROOT,
      "node_modules",
      ".cache",
      "uip",
      String(PORT),
      options.revision ?? "working",
    ),
    logLevel: process.env.UIP_QUIET ? "silent" : "info",
    clearScreen: false,
    plugins: [
      uipResolver(FRONTEND_SRC, root),
      ...(!options.revision
        ? [
            previewEndpoints({
              root,
              repo: REPO_ROOT,
              frontend: FRONTEND_SRC,
              port: PORT,
            }),
          ]
        : []),
      svelte({
        configFile: false,
        extensions: svelteConfig.extensions,
        preprocess: [linePreserving, mdsvex()],
        compilerOptions: { dev: true },
        onwarn: () => {},
      }),
    ],
    resolve: {
      alias: [
        {
          find: /^\$lib\//,
          replacement: toPosix(path.join(FRONTEND_SRC, "lib")) + "/",
        },
        {
          find: /^\$lib$/,
          replacement: toPosix(path.join(FRONTEND_SRC, "lib")),
        },
        {
          find: /^\$routes\//,
          replacement: toPosix(path.join(FRONTEND_SRC, "routes")) + "/",
        },
        {
          find: /^\$uip\//,
          replacement: toPosix(path.join(root, "src")) + "/",
        },
      ],
    },
    css: {
      postcss: { plugins: [tailwind()] },
    },
    define: {
      "import.meta.env.VITE_GOOGLE_AUTH_ENABLED": JSON.stringify("true"),
      "import.meta.env.VITE_GITHUB_AUTH_ENABLED": JSON.stringify("true"),
      "import.meta.env.VITE_CAPTCHA_ENABLED": JSON.stringify(""),
      "import.meta.env.VITE_CUSTOM_OAUTH_NAME": JSON.stringify(""),
      "import.meta.env.VITE_REGISTRATION_DISABLED": JSON.stringify(""),
      "import.meta.env.VITE_HCAPTCHA": JSON.stringify(""),
      "import.meta.env.VITE_SENTRY": JSON.stringify(""),
      "import.meta.env.VITE_RECAPTCHA": JSON.stringify(""),
    },
    server: {
      port: PORT,
      watch: { ignored: ["**/ui-preview/out/**"] },
      ...(options.revision
        ? { middlewareMode: true, hmr: false, ws: false, watch: null }
        : {}),
      strictPort: true,
      host: "127.0.0.1",
      fs: { allow: [REPO_ROOT, path.dirname(UIP_ROOT)] },
    },
    optimizeDeps: {
      entries: ["index.html", "render.html"],
      include: [
        "dompurify",
        "swiper",
        "tippy.js",
        "svelte-range-slider-pips",
        "pikaso",
        "@uppy/svelte",
        "@uppy/core",
        "@uppy/drop-target",
        "@uppy/xhr-upload",
        "@uppy/image-editor",
        "@uppy/dashboard",
        "@uppy/compressor",
        "ckeditor5",
      ],
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util", "@ffmpeg/core"],
    },
    build: {
      rollupOptions: {
        input: {
          gallery: path.join(root, "index.html"),
          render: path.join(root, "render.html"),
        },
      },
    },
  };
}
