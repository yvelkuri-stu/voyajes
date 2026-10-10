#!/usr/bin/env node
import { Command } from "commander";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from "node:fs";
import { resolve, join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brand,
  VoyajesProjectSchema,
  migrateProject,
  type VoyajesProject,
  type CatalogManifest,
  type BeatSync,
  type Aspect,
  type DurationTarget,
  type TemplatePack,
  safeParseProject,
  type TransitionKind,
  type TextStyle,
  type TextTransition,
  parsePackRef,
  TRANSITION_KINDS,
  TEXT_STYLE_KINDS,
  TEXT_TRANSITION_KINDS,
} from "@voyajes/core";
import {
  findFfmpeg,
  ffmpegInstallHint,
  findTheme,
  findTemplate,
  findBeat,
  generateSampleImages,
  parseTransitionKind,
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
    return VoyajesProjectSchema.parse(migrateProject(JSON.parse(readFileSync(abs, "utf8"))));
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


const EXPORT_PRESETS: Record<
  string,
  { aspect: Aspect; label: string; durationTargets: DurationTarget[] }
> = {
  youtube: { aspect: "16:9", label: "YouTube 16:9", durationTargets: [60] },
  tiktok: { aspect: "9:16", label: "TikTok 9:16", durationTargets: [15, 30, 60] },
  "instagram-reels": {
    aspect: "9:16",
    label: "IG Reels 9:16",
    durationTargets: [15, 30, 60],
  },
  "instagram-feed": {
    aspect: "1:1",
    label: "IG Feed 1:1",
    durationTargets: [30, 60],
  },
  "instagram-portrait": {
    aspect: "4:5",
    label: "IG Feed 4:5",
    durationTargets: [30, 60],
  },
};

function parseDurationTarget(value: string): DurationTarget {
  const n = Number(value);
  if (n === 15 || n === 30 || n === 60) return n;
  console.error(`Invalid --duration-target: ${value} (use 15|30|60)`);
  process.exit(1);
}

function applyExportPreset(
  project: VoyajesProject,
  opts: {
    presetId?: string;
    aspectOverride?: string;
    durationTarget?: DurationTarget;
    watermark?: boolean;
  },
): VoyajesProject {
  let next = { ...project };
  if (opts.presetId && EXPORT_PRESETS[opts.presetId]) {
    const p = EXPORT_PRESETS[opts.presetId];
    const durationTargetSec =
      opts.durationTarget ??
      (p.durationTargets.length === 1
        ? p.durationTargets[0]
        : next.export?.durationTargetSec);
    next = {
      ...next,
      aspect: p.aspect,
      export: {
        watermark: opts.watermark ?? next.export?.watermark ?? false,
        durationTargetSec,
        destination: opts.presetId as
          | "youtube"
          | "tiktok"
          | "instagram-reels"
          | "instagram-feed"
          | "instagram-portrait"
          | "custom",
      },
    };
    console.error(
      `  preset:   ${p.label} → aspect ${p.aspect}` +
        (durationTargetSec ? ` · target ${durationTargetSec}s` : ""),
    );
  } else if (opts.durationTarget != null || opts.watermark != null) {
    next = {
      ...next,
      export: {
        watermark: opts.watermark ?? next.export?.watermark ?? false,
        durationTargetSec:
          opts.durationTarget ?? next.export?.durationTargetSec,
        destination: next.export?.destination ?? "custom",
      },
    };
  }
  if (
    opts.aspectOverride &&
    ["9:16", "16:9", "1:1", "4:5"].includes(opts.aspectOverride)
  ) {
    next = { ...next, aspect: opts.aspectOverride as Aspect };
    console.error(`  aspect:   ${opts.aspectOverride}`);
  }
  return next;
}

/** Apply a catalog template pack onto a project (theme/beat/transition/text defaults). */
function applyTemplatePack(
  project: VoyajesProject,
  tpl: TemplatePack,
  themeVersion: string,
  beatVersion: string,
): VoyajesProject {
  return {
    ...project,
    theme: `${tpl.themeId}@${themeVersion}`,
    template: `${tpl.id}@${tpl.version}`,
    transition: tpl.transition,
    aspect: tpl.aspect ?? project.aspect,
    textStyle: tpl.textStyle,
    textTransition: tpl.textTransition,
    audio: {
      track: `${tpl.beatId}@${beatVersion}`,
      beatSync: tpl.beatSync,
      ducking: project.audio?.ducking ?? true,
      mixMode: project.audio?.mixMode ?? "replace",
      customSounds: project.audio?.customSounds,
    },
    export: {
      watermark: project.export?.watermark ?? false,
      durationTargetSec:
        tpl.durationTargetSec ?? project.export?.durationTargetSec,
      destination: project.export?.destination,
    },
  };
}

function resolveCustomAudioIntoProject(
  project: VoyajesProject,
  projectDir: string,
  audioPath: string,
): VoyajesProject {
  const abs = resolve(audioPath);
  if (!existsSync(abs)) {
    console.error(`Custom audio not found: ${abs}`);
    process.exit(1);
  }
  const audioDir = join(projectDir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const destName = basename(abs);
  const dest = join(audioDir, destName);
  if (resolve(abs) !== resolve(dest)) {
    copyFileSync(abs, dest);
  }
  const rel = join("audio", destName).replace(/\\/g, "/");
  const id = `import-${Date.now().toString(36)}`;
  const custom = {
    id,
    name: destName.replace(/\.[^.]+$/, "") || "Imported sound",
    source: "file" as const,
    path: rel,
    mimeType: destName.match(/\.mp3$/i)
      ? "audio/mpeg"
      : destName.match(/\.wav$/i)
        ? "audio/wav"
        : destName.match(/\.m4a$/i)
          ? "audio/mp4"
          : undefined,
  };
  return {
    ...project,
    audio: {
      track: `custom:${id}`,
      beatSync: project.audio?.beatSync ?? "medium",
      ducking: project.audio?.ducking ?? true,
      mixMode: "replace",
      customSounds: [...(project.audio?.customSounds ?? []), custom],
    },
  };
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
  .option(
    "--template <id>",
    "Template pack id (applies theme + motion transition + beat + text style)",
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
  .option(
    "--transition <kind>",
    `Global clip transition (${TRANSITION_KINDS.join("|")})`,
  )
  .option(
    "--text-style <style>",
    `Default text style (${TEXT_STYLE_KINDS.join("|")})`,
  )
  .option(
    "--text-transition <kind>",
    `Default text enter (${TEXT_TRANSITION_KINDS.join("|")})`,
  )
  .option(
    "--audio <path>",
    "Import a custom audio file into audio/ and set track to custom:<id>",
  )
  .option(
    "--duration-target <sec>",
    "Soft social duration target: 15 | 30 | 60",
  )
  .option("--no-samples", "Do not generate sample PNGs when media/ is empty")
  .action(
    (
      mediaPath: string,
      opts: {
        theme: string;
        template?: string;
        aspect: string;
        out: string;
        title?: string;
        beatSync: string;
        beat: string;
        transition?: string;
        textStyle?: string;
        textTransition?: string;
        audio?: string;
        durationTarget?: string;
        samples: boolean;
      },
    ) => {
      const manifest = loadManifest();

      let themeId = opts.theme;
      let beatId = opts.beat;
      let beatSync = parseBeatSync(opts.beatSync);
      let transition: TransitionKind | undefined;
      let textStyle: TextStyle | undefined;
      let textTransition: TextTransition | undefined;
      let aspect = opts.aspect;
      let templateRef: string | undefined;
      let durationTarget: DurationTarget | undefined;
      let tplPack: TemplatePack | undefined;

      if (opts.template) {
        tplPack = findTemplate(manifest, opts.template);
        if (!tplPack) {
          console.error(`Template not found: ${opts.template}`);
          console.error("Try: voyajes catalog list --kind template");
          process.exit(1);
        }
        themeId = tplPack.themeId;
        beatId = tplPack.beatId;
        beatSync = tplPack.beatSync;
        transition = tplPack.transition;
        textStyle = tplPack.textStyle;
        textTransition = tplPack.textTransition;
        if (tplPack.aspect) aspect = tplPack.aspect;
        if (tplPack.durationTargetSec) durationTarget = tplPack.durationTargetSec;
        templateRef = `${tplPack.id}@${tplPack.version}`;
        console.error(`  template: ${tplPack.name} (${tplPack.id})`);
      }

      // Explicit flags override template defaults
      if (opts.theme !== "theme.ocean-pop" || !opts.template) {
        if (opts.theme) themeId = opts.theme;
      }
      if (opts.template && opts.theme !== "theme.ocean-pop") {
        themeId = opts.theme;
      }
      if (opts.beat !== "audio.warm-acoustic-092" || !opts.template) {
        if (!opts.template) beatId = opts.beat;
      }
      if (opts.template && opts.beat !== "audio.warm-acoustic-092") {
        beatId = opts.beat;
      }
      if (opts.beatSync !== "medium" || !opts.template) {
        if (!opts.template) beatSync = parseBeatSync(opts.beatSync);
      }
      if (opts.template && opts.beatSync !== "medium") {
        beatSync = parseBeatSync(opts.beatSync);
      }
      if (opts.transition) {
        const t = parseTransitionKind(opts.transition);
        if (!t) {
          console.error(
            `Invalid --transition: ${opts.transition} (use ${TRANSITION_KINDS.join("|")})`,
          );
          process.exit(1);
        }
        transition = t;
      }
      if (opts.textStyle) {
        if (!(TEXT_STYLE_KINDS as string[]).includes(opts.textStyle)) {
          console.error(`Invalid --text-style: ${opts.textStyle}`);
          process.exit(1);
        }
        textStyle = opts.textStyle as TextStyle;
      }
      if (opts.textTransition) {
        if (!(TEXT_TRANSITION_KINDS as string[]).includes(opts.textTransition)) {
          console.error(`Invalid --text-transition: ${opts.textTransition}`);
          process.exit(1);
        }
        textTransition = opts.textTransition as TextTransition;
      }
      if (opts.durationTarget) {
        durationTarget = parseDurationTarget(opts.durationTarget);
      }
      if (opts.aspect && opts.aspect !== "9:16") {
        aspect = opts.aspect;
      } else if (!opts.template) {
        aspect = opts.aspect;
      }

      const themePack = findTheme(manifest, themeId);
      if (!themePack) {
        console.error(`Theme not found: ${themeId}`);
        console.error("Try: voyajes catalog list --kind theme");
        process.exit(1);
      }

      const beatPack = findBeat(manifest, beatId);
      if (!beatPack) {
        console.error(`Beat not found: ${beatId}`);
        console.error("Try: voyajes catalog list --kind audio-beat");
        process.exit(1);
      }

      if (!transition) transition = themePack.transition;

      const abs = resolve(mediaPath);
      mkdirSync(abs, { recursive: true });
      const mediaDir = join(abs, "media");
      mkdirSync(mediaDir, { recursive: true });

      const title = opts.title ?? basename(abs) ?? "Untitled voyage";

      const MEDIA_RE = /\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i;
      let files = existsSync(mediaDir)
        ? readdirSync(mediaDir).filter((f) => MEDIA_RE.test(f)).sort()
        : [];

      const rootFiles = readdirSync(abs).filter(
        (f) => MEDIA_RE.test(f) && f !== opts.out,
      );

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
              `  voyajes init ${mediaPath} --theme ${themeId}`,
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
          // Seed per-clip transitionOut from template/global so edges match Create
          ...(transition && transition !== "cut"
            ? { transitionOut: transition }
            : {}),
        });
      }
      // Last clip has nowhere to go — clear its transitionOut
      if (media.length > 0) {
        const last = media[media.length - 1];
        if (last) {
          const { transitionOut: _drop, ...rest } = last;
          media[media.length - 1] = rest;
        }
      }

      let project = VoyajesProjectSchema.parse({
        schema: 2,
        title,
        aspect,
        theme: `${themePack.id}@${themePack.version}`,
        ...(templateRef ? { template: templateRef } : {}),
        media,
        ...(transition ? { transition } : {}),
        audio: {
          track: `${beatPack.id}@${beatPack.version}`,
          beatSync,
          ducking: true,
        },
        text: [
          {
            at: 0,
            role: "title",
            value: title,
            ...(textStyle ? { style: textStyle } : {}),
            ...(textTransition ? { animationIn: textTransition } : {}),
            position: "bottom",
          },
        ],
        ...(textStyle ? { textStyle } : {}),
        ...(textTransition ? { textTransition } : {}),
        share: { title, public: true },
        ...(durationTarget
          ? {
              export: {
                watermark: false,
                durationTargetSec: durationTarget,
                destination: "custom",
              },
            }
          : {}),
      });

      if (opts.audio) {
        project = resolveCustomAudioIntoProject(project, abs, opts.audio);
        // Keep beat-sync from template/flags even with custom audio
        project = {
          ...project,
          audio: {
            ...project.audio!,
            beatSync,
            ducking: true,
          },
        };
        project = VoyajesProjectSchema.parse(project);
      }

      const outPath = resolve(abs, opts.out);
      writeFileSync(outPath, JSON.stringify(project, null, 2) + "\n");

      console.error(`Created ${outPath}`);
      if (project.template) console.error(`  template: ${project.template}`);
      console.error(`  theme:     ${project.theme}`);
      console.error(
        `  beat:      ${project.audio?.track} (sync=${project.audio?.beatSync})`,
      );
      if (project.transition) {
        console.error(`  transition:${project.transition}`);
      }
      if (project.textStyle) {
        console.error(
          `  text:      ${project.textStyle}` +
            (project.textTransition ? ` · ${project.textTransition}` : ""),
        );
      }
      console.error(`  media:     ${project.media.length} clip(s) under media/`);
      console.error(
        `  next:      voyajes render ${relative(process.cwd(), outPath) || outPath} -o out.webm`,
      );
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
  .option("--kind <kind>", "Filter by kind: theme, template, audio-beat, motion")
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

      const themes = packs.filter((p) => p.kind === "theme").length;
      const templates = packs.filter((p) => p.kind === "template").length;
      const beats = packs.filter((p) => p.kind === "audio-beat").length;
      console.error(
        `Catalog ${manifest.catalogVersion} — ${packs.length} pack(s)` +
          ` · ${themes} themes · ${templates} templates · ${beats} beats\n`,
      );
      for (const p of packs) {
        const name = "name" in p && p.name ? String(p.name) : "";
        const tier = "tier" in p ? String(p.tier) : "";
        let extra = "";
        if (p.kind === "template") {
          const t = p as TemplatePack;
          extra = ` → ${t.themeId} · ${t.transition} · ${t.beatId} · sync=${t.beatSync} · ${t.textStyle}`;
        } else if (p.kind === "theme") {
          const t = p as { transition?: string; motion?: string };
          extra = t.transition ? ` · ${t.motion ?? ""} · ${t.transition}` : "";
        } else if (p.kind === "audio-beat") {
          const b = p as { bpm?: number; mood?: string[] };
          extra = b.bpm ? ` · ${b.bpm}bpm` : "";
        }
        console.log(
          `${p.id.padEnd(28)} ${String(p.kind).padEnd(12)} v${p.version}  [${tier}]  ${name}${extra}`,
        );
      }
    },
  );

program
  .command("template")
  .description(
    "Write a template's complete sample project (library images, audio clips, text, grade) — then `voyajes render` it",
  )
  .argument("[id]", "Template id (e.g. template.birthday-blast); omit with --list")
  .option("-o, --out <file>", "Project JSON path", "voyajes.project.json")
  .option("--list", "List templates that ship a sample")
  .action((id: string | undefined, opts: { out: string; list?: boolean }) => {
    const manifest = loadManifest();
    const samplesPath = join(catalogRoot(), "library", "samples.json");
    if (!existsSync(samplesPath)) {
      console.error(`No samples at ${samplesPath}`);
      process.exit(3);
    }
    const samples = JSON.parse(readFileSync(samplesPath, "utf8")).samples as Record<string, any>;
    const templates = manifest.packs.filter((p) => p.kind === "template") as TemplatePack[];
    if (opts.list || !id) {
      for (const t of templates) {
        const s0 = samples[t.id];
        console.log(`${t.id.padEnd(30)} ${s0 ? `${s0.clips.length} clips · ${s0.audio.length} audio · ${s0.durationSec}s` : "(no sample)"}  ${t.name}`);
      }
      return;
    }
    const want = id.startsWith("template.") ? id : `template.${id}`;
    const tpl = templates.find((t) => t.id === want || `${t.id}@${t.version}` === id);
    const sample = tpl ? samples[tpl.id] : undefined;
    if (!tpl || !sample) {
      console.error(`Template sample not found: ${id} (try --list)`);
      process.exit(1);
    }
    const theme = manifest.packs.find((p) => p.id === tpl.themeId);
    const beat = manifest.packs.find((p) => p.id === tpl.beatId);
    const inv = (sample.invitation ?? {}) as Record<string, string>;
    const fill = (v: string) => v.replace(/\{(\w+)\}/g, (_m, k) => inv[k] ?? "");
    const project = {
      schema: 3,
      title: inv.eventName ?? tpl.name,
      aspect: tpl.aspect ?? "9:16",
      theme: `${tpl.themeId}@${theme?.version ?? "1.0.0"}`,
      template: `${tpl.id}@${tpl.version}`,
      transition: tpl.transition,
      textStyle: tpl.textStyle,
      textTransition: tpl.textTransition,
      grade: sample.grade,
      media: sample.clips.map((c: any) => ({
        path: `lib:${c.media}`,
        mute: true,
        durationSec: c.durationSec,
        ...(c.animation ? { animation: c.animation } : {}),
        ...(c.transitionOut ? { transitionOut: c.transitionOut } : {}),
        ...(c.transitionSpec ? { transitionSpec: c.transitionSpec } : {}),
      })),
      text: sample.text.map((t: any) => ({
        at: t.at,
        end: t.end,
        role: t.role,
        value: fill(t.value),
        position: t.position,
        ...(t.animation ? { animation: t.animation } : {}),
      })),
      audio: {
        track: `${tpl.beatId}@${beat?.version ?? "1.0.0"}`,
        beatSync: "off",
        ducking: true,
        clips: sample.audio.map((a: any, i: number) => ({
          id: `a${i}`,
          ref: a.ref,
          at: a.at,
          durationSec: a.durationSec,
          ...(a.volume != null ? { volume: a.volume } : {}),
          ...(a.fadeInSec != null ? { fadeInSec: a.fadeInSec } : {}),
          ...(a.fadeOutSec != null ? { fadeOutSec: a.fadeOutSec } : {}),
          ...(a.loop != null ? { loop: a.loop } : {}),
        })),
      },
      ...(sample.invitation
        ? { share: { public: true, mode: "invitation", invitation: { ...inv, eventType: tpl.eventType } } }
        : {}),
    };
    const parsed = safeParseProject(project);
    if (!parsed.success) {
      console.error("Sample project failed validation:", parsed.error.issues.slice(0, 5));
      process.exit(1);
    }
    writeFileSync(resolve(opts.out), JSON.stringify(project, null, 2) + "\n");
    console.error(`✓ Wrote ${opts.out} · ${tpl.name} sample (${sample.clips.length} clips, ${sample.audio.length} audio)`);
    console.error(`  Next: voyajes render ${opts.out} -o ${tpl.id.replace("template.", "")}.mp4`);
    console.log(resolve(opts.out));
  });

program
  .command("render")
  .description(
    "Render a project to WebM/MP4 with local ffmpeg (theme grades, per-clip transitions, text overlays, beat/custom audio)",
  )
  .argument("<project>", "Path to voyajes.project.json")
  .option("-o, --out <file>", "Output path (.webm or .mp4)", "out.webm")
  .option("--quality <q>", "720p | 1080p | 4k", "1080p")
  .option(
    "--preset <name>",
    "Social export preset: youtube | tiktok | instagram-reels | instagram-feed | instagram-portrait",
  )
  .option(
    "-a, --aspect <ratio>",
    "Override aspect: 9:16 | 16:9 | 1:1 | 4:5",
  )
  .option(
    "--duration-target <sec>",
    "Soft social duration target: 15 | 30 | 60",
  )
  .option("--watermark", "Stamp export.watermark=true in project meta (drawtext stub)")
  .option(
    "-t, --theme <ref>",
    "Override theme pack id (e.g. theme.neon-night)",
  )
  .option(
    "--template <id>",
    "Apply template pack before render (theme + transition + beat + text defaults)",
  )
  .option(
    "--transition <kind>",
    `Override global transition (${TRANSITION_KINDS.join("|")})`,
  )
  .option(
    "--beat-sync <mode>",
    "Override beat sync: off | soft | medium | hard",
  )
  .option("--title <title>", "Override on-video title")
  .option("--beat <id>", "Override audio beat pack id")
  .option(
    "--audio <path>",
    "Import custom audio file and mux instead of catalog beat",
  )
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
        preset?: string;
        aspect?: string;
        durationTarget?: string;
        watermark?: boolean;
        theme?: string;
        template?: string;
        transition?: string;
        beatSync?: string;
        title?: string;
        beat?: string;
        audio?: string;
        json?: boolean;
        engine: string;
      },
    ) => {
      const abs = resolve(projectPath);
      // Always Zod-validate first (even if ffmpeg is missing)
      let project = loadProject(abs);
      const manifest = loadManifest();
      const projectDir = dirname(abs);

      if (opts.template) {
        const tpl = findTemplate(manifest, opts.template);
        if (!tpl) {
          console.error(`Template not found: ${opts.template}`);
          console.error("Try: voyajes catalog list --kind template");
          process.exit(1);
        }
        const themePack = findTheme(manifest, tpl.themeId);
        const beatPack = findBeat(manifest, tpl.beatId);
        if (!themePack || !beatPack) {
          console.error(
            `Template ${tpl.id} references missing theme/beat — run voyajes sync`,
          );
          process.exit(1);
        }
        project = applyTemplatePack(
          project,
          tpl,
          themePack.version,
          beatPack.version,
        );
        console.error(`  template: ${tpl.name} applied`);
      }

      project = applyExportPreset(project, {
        presetId: opts.preset,
        aspectOverride: opts.aspect,
        durationTarget: opts.durationTarget
          ? parseDurationTarget(opts.durationTarget)
          : undefined,
        watermark: opts.watermark,
      });

      if (opts.transition) {
        const t = parseTransitionKind(opts.transition);
        if (!t) {
          console.error(
            `Invalid --transition: ${opts.transition} (use ${TRANSITION_KINDS.join("|")})`,
          );
          process.exit(1);
        }
        project = { ...project, transition: t };
        console.error(`  transition: ${t}`);
      }

      if (opts.audio) {
        project = resolveCustomAudioIntoProject(project, projectDir, opts.audio);
        console.error(`  audio:    custom import → ${project.audio?.track}`);
      }

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
                  template: project.template,
                  clips: project.media.length,
                  transition: project.transition,
                  export: project.export,
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
        migrateProject(JSON.parse(readFileSync(abs, "utf8"))),
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
      if (project.template) {
        let tid = project.template;
        try {
          tid = parsePackRef(project.template).id;
        } catch {
          /* bare */
        }
        const tpl = findTemplate(manifest, tid);
        console.error(
          tpl
            ? `✓ template ${project.template}`
            : `⚠ template ${project.template} not in catalog`,
        );
      }
      if (project.transition) {
        console.error(`✓ transition default: ${project.transition}`);
      }
      const edged = project.media.filter((m) => m.transitionOut).length;
      if (edged) {
        console.error(`✓ per-clip transitionOut on ${edged} clip(s)`);
      }
      if (project.audio?.track?.startsWith("custom:")) {
        const cid = project.audio.track.slice("custom:".length);
        const custom = project.audio.customSounds?.find((s) => s.id === cid);
        const ap = custom?.path
          ? resolve(projectDir, custom.path)
          : undefined;
        console.error(
          ap && existsSync(ap)
            ? `✓ custom audio: ${custom?.path}`
            : `⚠ custom audio track ${project.audio.track} path missing`,
        );
      } else if (project.audio?.track) {
        console.error(
          `✓ beat: ${project.audio.track} (sync=${project.audio.beatSync})`,
        );
      }
      if (project.export?.destination) {
        console.error(
          `✓ export preset: ${project.export.destination}` +
            (project.export.durationTargetSec
              ? ` · ${project.export.durationTargetSec}s`
              : ""),
        );
      }
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
