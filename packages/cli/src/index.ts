#!/usr/bin/env node
import { Command } from "commander";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brand,
  VoyajesProjectSchema,
  type VoyajesProject,
  type CatalogManifest,
  parsePackRef,
} from "@voyajes/core";

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

const program = new Command();

program
  .name(brand.cli)
  .description(`${brand.name} — ${brand.tagline}`)
  .version("0.1.0");

program
  .command("init")
  .description("Create a Voyajes project from a folder of media")
  .argument("[path]", "Media folder", ".")
  .option(
    "-t, --theme <ref>",
    "Theme pack id (without @version)",
    "theme.ocean-pop",
  )
  .option("-a, --aspect <ratio>", "Aspect ratio", "9:16")
  .option("-o, --out <file>", "Output project JSON", "voyajes.project.json")
  .option("--title <title>", "Project title")
  .action(
    (
      mediaPath: string,
      opts: { theme: string; aspect: string; out: string; title?: string },
    ) => {
      const manifest = loadManifest();
      const themePack = manifest.packs.find(
        (p) => p.id === opts.theme && p.kind === "theme",
      );
      if (!themePack) {
        console.error(`Theme not found: ${opts.theme}`);
        console.error("Try: voyajes catalog list --kind theme");
        process.exit(1);
      }

      const abs = resolve(mediaPath);
      const title = opts.title ?? basename(abs) ?? "Untitled voyage";

      const media: VoyajesProject["media"] = [];
      if (existsSync(abs)) {
        try {
          const files = readdirSync(abs).filter((f) =>
            /\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i.test(f),
          );
          for (const f of files.slice(0, 50)) {
            media.push({ path: join(mediaPath, f), mute: true });
          }
        } catch {
          /* empty ok */
        }
      }

      const project = VoyajesProjectSchema.parse({
        schema: 1,
        title,
        aspect: opts.aspect,
        theme: `${themePack.id}@${themePack.version}`,
        media,
        audio: { beatSync: "medium", ducking: true },
        share: { title, public: true },
      });

      writeFileSync(opts.out, JSON.stringify(project, null, 2) + "\n");
      console.error(`Created ${opts.out}`);
      console.error(`  theme: ${project.theme}`);
      console.error(`  media: ${project.media.length} clip(s)`);
      console.log(opts.out);
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
  .description("Render a project (STUB — no real encoding yet)")
  .argument("<project>", "Path to voyajes.project.json")
  .option("-o, --out <file>", "Output MP4 path", "out.mp4")
  .option("--engine <engine>", "cloud | local", "cloud")
  .option("--quality <q>", "720p | 1080p | 4k", "1080p")
  .option("--json", "JSON result on stdout")
  .action(
    (
      projectPath: string,
      opts: { out: string; engine: string; quality: string; json?: boolean },
    ) => {
      const abs = resolve(projectPath);
      if (!existsSync(abs)) {
        console.error(`Project not found: ${abs}`);
        process.exit(1);
      }

      let project: VoyajesProject;
      try {
        project = VoyajesProjectSchema.parse(
          JSON.parse(readFileSync(abs, "utf8")),
        );
      } catch (e) {
        console.error("Invalid project file:");
        console.error(e instanceof Error ? e.message : e);
        process.exit(1);
      }

      // TODO: FFmpeg / Remotion / cloud workers — encoding not implemented
      const result = {
        ok: false,
        stub: true,
        message:
          "Render is not implemented yet. Project validated; encoding pipeline TBD.",
        todo: [
          "Local: FFmpeg or Remotion still-frame compose",
          "Cloud: queue job + signed download URL",
          "HLS derivatives for share pages",
        ],
        project: {
          title: project.title,
          theme: project.theme,
          aspect: project.aspect,
          clips: project.media.length,
        },
        requested: {
          out: opts.out,
          engine: opts.engine,
          quality: opts.quality,
        },
      };

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error("⚠  RENDER STUB — video encoding not implemented");
        console.error(`   Project OK: "${project.title}" (${project.theme})`);
        console.error(
          `   Would write: ${opts.out} via ${opts.engine} @ ${opts.quality}`,
        );
        console.error("   See README → Roadmap for real render work.");
        console.log(JSON.stringify({ ok: false, stub: true }, null, 2));
      }
      process.exit(0);
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
      console.error(`✓ schema ok`);
      console.error(`✓ title: ${project.title}`);
      console.error(
        pack
          ? `✓ theme ${project.theme} found in catalog`
          : `⚠ theme ${project.theme} not in local catalog (run voyajes sync)`,
      );
      process.exit(0);
    } catch (e) {
      console.error("✗ validation failed");
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  });

program.parse();
