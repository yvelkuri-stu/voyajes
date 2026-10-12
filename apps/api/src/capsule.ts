/** v1.1 time capsules: when unlock_at passes, notify everyone following the voyage. */
import { notify, type PushEnv } from "./aftermovie";

export async function openCapsules(env: PushEnv, rid: () => string): Promise<string[]> {
  const now = Date.now();
  const rows = await env.DB.prepare("SELECT id, title FROM voyages WHERE unlock_at IS NOT NULL AND unlock_at <= ? AND unlock_notified IS NULL AND status = 'live' LIMIT 200").bind(now).all<{ id: string; title: string }>();
  for (const r of rows.results) {
    await env.DB.prepare("UPDATE voyages SET unlock_notified = ? WHERE id = ?").bind(now, r.id).run();
    await notify(env, r.id, "capsule", "Your time capsule just opened 🔓", `${r.title || "A voyage"} is ready to watch.`, rid());
  }
  return rows.results.map((r) => r.id);
}
