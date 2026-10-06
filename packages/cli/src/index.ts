#!/usr/bin/env node
import { Command } from "commander";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { resolve, join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brand,
  VoyajesProjectSchema,
  type VoyajesProject,
  type CatalogManifest,
  type BeatSync,
  parsePackRef,
} from "@voyajes/core";
import {
  findFfmpeg,
  ffmpegInstallHint,
  findTheme,
  findBeat,
  generateSampleImages,
  renderWithFfmpeg,
  type RenderQuality,
} from "./render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function catalogPath(): string {
  if (process.env.VOYAJES_CATALOG) return resolve(process.env.VOYAJES_CATALOG);
  const candidates = [
    resolve(__dirname, "../../../catalog/manifest.json"),
    resolve(process.cwd(), "catalog/manifest.json"),
    resolve(process.cwd(), "../catalog/manifest.json"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

function catalogRoot(): string {
  return dirname(catalogPath());
}

function loadManifest(): CatalogManifest {
  const path = catalogPath();
  if (!existsSync(path)) {
    console.error(`Catalog not found at ${path}`);
    process.exit(3);
  }
  return JSON.parse(readFileSync(path, "utf8")) as CatalogManifest;
}

function cacheDir(): string {
  const dir = resolve(process.cwd(), ".voyajes-cache");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function loadProject(projectPath: string): VoyajesProject {
  const abs = resolve(projectPath);
  if (!existsSync(abs)) {
    console.error(`Project not found: ${abs}`);
    process.exit(1);
  }
  try {
    return VoyajesProjectSchema.parse(JSON.parse(readFileSync(abs, "utf8")));
  } catch (e) {
    console.error("Invalid project file (Zod validation failed):");
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

const BEAT_SYNC_VALUES: BeatSync[] = ["off", "soft", "medium", "hard"];

function parseBeatSync(value: string): BeatSync {
  if ((BEAT_SYNC_VALUES as string[]).includes(value)) return value as BeatSync;
  console.error(`Invalid --beat-sync: ${value} (use off|soft|medium|hard)`);
  process.exit(1);
}

const program = new Command();

program
  .name(brand.cli)
  .description(`${brand.name} — ${brand.tagline}`)
  .version("0.1.0");

program
  .command("init")
  .description(
    "Create a Voyajes project folder (media/ + voyajes.project.json). Drops sample stills when ffmpeg is available so `render` works immediately.",
  )
  .argument("[path]", "Project / media folder", ".")
  .option(
    "-t, --theme <ref>",
    "Theme pack id (without @version)",
    "theme.ocean-pop",
  )
  .option("-a, --aspect <ratio>", "Aspect ratio", "9:16")
  .option("-o, --out <file>", "Output project JSON (relative to folder)", "voyajes.project.json")
  .option("--title <title>", "Project title")
  .option(
    "--beat-sync <mode>",
    "Beat sync: off | soft | medium | hard",
    "medium",
  )
  .option(
    "--beat <id>",
    "Audio beat pack id",
    "audio.warm-acoustic-092",
  )
  .option("--no-samples", "Do not generate sample PNGs when media/ is empty")
  .action(
    (
      mediaPath: string,
      opts: {
        theme: string;
        aspect: string;
        out: string;
        title?: string;
        beatSync: string;
        beat: string;
        samples: boolean;
      },
    ) => {
      const manifest = loadManifest();
      const themePack = findTheme(manifest, opts.theme);
      if (!themePack) {
        console.error(`Theme not found: ${opts.theme}`);
        console.error("Try: voyajes catalog list --kind theme");
        process.exit(1);
      }

      const beatSync = parseBeatSync(opts.beatSync);
      const beatPack = findBeat(manifest, opts.beat);
      if (!beatPack) {
        console.error(`Beat not found: ${opts.beat}`);
        console.error("Try: voyajes catalog list --kind audio-beat");
        process.exit(1);
      }

      const abs = resolve(mediaPath);
      mkdirSync(abs, { recursive: true });
      const mediaDir = join(abs, "media");
      mkdirSync(mediaDir, { recursive: true });

      const title = opts.title ?? basename(abs) ?? "Untitled voyage";

      const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i;
      let files = existsSync(mediaDir)
        ? readdirSync(mediaDir).filter((f) => MEDIA_RE.test(f)).sort()
        : [];

      // Also scan the folder itself if user pointed at a media dump
      const rootFiles = readdirSync(abs).filter(
        (f) => MEDIA_RE.test(f) && f !== opts.out,
      );
      for (const f of rootFiles) {
        if (!files.includes(f)) {
          /* prefer media/ — if root has files and media empty, use root */
        }
      }

      if (files.length === 0 && rootFiles.length > 0) {
        files = rootFiles.sort();
      }

      if (files.length === 0 && opts.samples !== false) {
        console.error("No media yet — generating sample stills with ffmpeg…");
        const generated = generateSampleImages(mediaDir, [
          { name: "01-mint.png", color: "#3DDC97" },
          { name: "02-indigo.png", color: "#7C5CFF" },
          { name: "03-coral.png", color: "#FF6B4A" },
        ]);
        if (generated.length) {
          files = generated.map((p) => basename(p)).sort();
          console.error(`  wrote ${files.length} sample PNG(s) in media/`);
        } else {
          console.error(
            "  (ffmpeg unavailable — drop your own photos into media/ then re-run init)",
          );
          writeFileSync(
            join(mediaDir, "README.txt"),
            [
              "Drop JPG/PNG/WebP/MP4/WebM/MOV files here, then re-run:",
              `  voyajes init ${mediaPath} --theme ${opts.theme}`,
              "Or edit voyajes.project.json media[].path entries.",
              "",
            ].join("\n"),
          );
        }
      }

      const media: VoyajesProject["media"] = [];
      for (const f of files.slice(0, 50)) {
        const inMediaSub = existsSync(join(mediaDir, f));
        const rel = inMediaSub ? join("media", f) : f;
        media.push({
          path: rel.replace(/\\/g, "/"),
          mute: true,
          durationSec: undefined,
        });
      }

      const project = VoyajesProjectSchema.parse({
        schema: 1,
        title,
        aspect: opts.aspect,
        theme: `${themePack.id}@${themePack.version}`,
        media,
        audio: {
          track: `${beatPack.id}@${beatPack.version}`,
          beatSync,
          ducking: true,
        },
        text: [{ at: 0, role: "title", value: title }],
        share: { title, public: true },
      });

      const outPath = resolve(abs, opts.out);
      writeFileSync(outPath, JSON.stringify(project, null, 2) + "\n");

      console.error(`Created ${outPath}`);
      console.error(`  theme:     ${project.theme}`);
      console.error(`  beat:      ${project.audio?.track} (sync=${beatSync})`);
      console.error(`  media:     ${project.media.length} clip(s) under media/`);
      console.error(`  next:      voyajes render ${relative(process.cwd(), outPath) || outPath} -o out.webm`);
      console.log(outPath);
    },
  );

program
  .command("sync")
  .description("Refresh local catalog index (ETag/delta stub)")
  .option("--channel <name>", "Catalog channel", "stable")
  .option("--force", "Ignore ETag and re-copy manifest")
  .action((opts: { channel: string; force?: boolean }) => {
    const src = catalogPath();
    const dest = join(cacheDir(), "manifest.json");
    const metaPath = join(cacheDir(), "sync-meta.json");

    const manifest = loadManifest();
    let prevEtag: string | undefined;
    if (existsSync(metaPath) && !opts.force) {
      try {
        prevEtag = JSON.parse(readFileSync(metaPath, "utf8")).etag;
      } catch {
        /* ignore */
      }
    }

    if (prevEtag && prevEtag === manifest.etag && !opts.force) {
      console.error(`Already up to date (${manifest.catalogVersion})`);
      console.error(`Channel: ${opts.channel}`);
      process.exit(0);
    }

    writeFileSync(dest, readFileSync(src));
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          etag: manifest.etag,
          catalogVersion: manifest.catalogVersion,
          channel: opts.channel,
          syncedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
    console.error(`Synced catalog ${manifest.catalogVersion}`);
    console.error(`  packs: ${manifest.packs.length}`);
    console.error(`  cache: ${dest}`);
  });

program
  .command("catalog")
  .description("Browse official packs")
  .argument("[action]", "list | show", "list")
  .argument("[id]", "Pack id for show")
  .option("--kind <kind>", "Filter by kind: theme, audio-beat, motion")
  .option("--json", "Machine-readable stdout")
  .action(
    (
      action: string,
      id: string | undefined,
      opts: { kind?: string; json?: boolean },
    ) => {
      const manifest = loadManifest();
      if (action === "show" && id) {
        const pack = manifest.packs.find((p) => p.id === id);
        if (!pack) {
          console.error(`Pack not found: ${id}`);
          process.exit(1);
        }
        console.log(JSON.stringify(pack, null, 2));
        return;
      }

      let packs = manifest.packs;
      if (opts.kind) packs = packs.filter((p) => p.kind === opts.kind);

      if (opts.json) {
        console.log(JSON.stringify(packs, null, 2));
        return;
      }

      console.error(
        `Catalog ${manifest.catalogVersion} — ${packs.length} pack(s)\n`,
      );
      for (const p of packs) {
        const name = "name" in p && p.name ? String(p.name) : "";
        const tier = "tier" in p ? String(p.tier) : "";
        console.log(
          `${p.id.padEnd(28)} ${String(p.kind).padEnd(12)} v${p.version}  [${tier}]  ${name}`,
        );
      }
    },
  );

program
  .command("render")
  .description(
    "Render a project to WebM/MP4 with local ffmpeg (theme grades, transitions, beat audio)",
  )
  .argument("<project>", "Path to voyajes.project.json")
  .option("-o, --out <file>", "Output path (.webm or .mp4)", "out.webm")
  .option("--quality <q>", "720p | 1080p | 4k", "1080p")
  .option(
    "-t, --theme <ref>",
    "Override theme pack id (e.g. theme.neon-night)",
  )
  .option(
    "--beat-sync <mode>",
    "Override beat sync: off | soft | medium | hard",
  )
  .option("--title <title>", "Override on-video title")
  .option("--beat <id>", "Override audio beat pack id")
  .option("--json", "JSON result on stdout")
  .option(
    "--engine <engine>",
    "local (ffmpeg) — cloud reserved",
    "local",
  )
  .action(
    (
      projectPath: string,
      opts: {
        out: string;
        quality: string;
        theme?: string;
        beatSync?: string;
        title?: string;
        beat?: string;
        json?: boolean;
        engine: string;
      },
    ) => {
      const abs = resolve(projectPath);
      // Always Zod-validate first (even if ffmpeg is missing)
      const project = loadProject(abs);
      const manifest = loadManifest();

      const quality = (["720p", "1080p", "4k"] as RenderQuality[]).includes(
        opts.quality as RenderQuality,
      )
        ? (opts.quality as RenderQuality)
        : "1080p";

      const beatSyncOverride = opts.beatSync
        ? parseBeatSync(opts.beatSync)
        : undefined;

      if (opts.engine === "cloud") {
        const msg =
          "Cloud render is not implemented yet. Use --engine local (default) with ffmpeg.";
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                ok: false,
                error: "cloud_unimplemented",
                message: msg,
                project: { title: project.title, theme: project.theme },
              },
              null,
              2,
            ),
          );
        } else {
          console.error(msg);
        }
        process.exit(1);
      }

      const ffmpeg = findFfmpeg();
      if (!ffmpeg) {
        // Project already validated
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                ok: false,
                error: "ffmpeg_missing",
                message: ffmpegInstallHint(),
                validated: true,
                project: {
                  title: project.title,
                  theme: project.theme,
                  clips: project.media.length,
                },
              },
              null,
              2,
            ),
          );
        } else {
          console.error("✓ Project schema valid");
          console.error(ffmpegInstallHint());
        }
        process.exit(2);
      }

      console.error(`Rendering with ${ffmpeg}…`);
      console.error(`  project: ${abs}`);
      console.error(`  out:     ${resolve(opts.out)}`);

      const result = renderWithFfmpeg({
        project,
        projectPath: abs,
        out: opts.out,
        quality,
        themeOverride: opts.theme,
        beatSyncOverride,
        titleOverride: opts.title,
        beatOverride: opts.beat,
        catalog: manifest,
        catalogRoot: catalogRoot(),
      });

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.ok) {
        console.error(`✓ ${result.message}`);
        console.error(
          `  ${result.width}×${result.height} · ${result.durationSec}s · ${result.clips} clip(s)`,
        );
        console.error(`  theme ${result.theme} · beat-sync ${result.beatSync}`);
        console.log(result.out);
      } else {
        console.error(`✗ Render failed: ${result.error}`);
        console.error(result.message);
      }

      process.exit(result.ok ? 0 : 1);
    },
  );

program
  .command("doctor")
  .description("Validate a project file against the schema")
  .argument("<project>", "Path to voyajes.project.json")
  .action((projectPath: string) => {
    const abs = resolve(projectPath);
    if (!existsSync(abs)) {
      console.error(`Not found: ${abs}`);
      process.exit(1);
    }
    try {
      const project = VoyajesProjectSchema.parse(
        JSON.parse(readFileSync(abs, "utf8")),
      );
      const { id } = parsePackRef(project.theme);
      const manifest = loadManifest();
      const pack = manifest.packs.find((p) => p.id === id);
      const projectDir = dirname(abs);
      let missing = 0;
      for (const m of project.media) {
        const p = resolve(projectDir, m.path);
        if (!existsSync(p)) {
          console.error(`⚠ media missing: ${m.path}`);
          missing++;
        }
      }
      const ff = findFfmpeg();
      console.error(`✓ schema ok`);
      console.error(`✓ title: ${project.title}`);
      console.error(
        pack
          ? `✓ theme ${project.theme} found in catalog`
          : `⚠ theme ${project.theme} not in local catalog (run voyajes sync)`,
      );
      console.error(
        missing === 0
          ? `✓ media: ${project.media.length} clip(s) resolvable`
          : `⚠ media: ${missing}/${project.media.length} missing on disk`,
      );
      console.error(
        ff ? `✓ ffmpeg: ${ff}` : `⚠ ffmpeg not on PATH (needed for render)`,
      );
      process.exit(missing > 0 && project.media.length > 0 ? 1 : 0);
    } catch (e) {
      console.error("✗ validation failed");
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program.parse();
