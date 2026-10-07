import type { InvitationMeta } from "@voyajes/core";

export type InviteCardLines = {
  headline: string;
  subline: string;
  detail: string;
  hasContent: boolean;
};

/**
 * Build who/what/when/where lines for invitation intro/end cards.
 * Falls back gracefully when fields are blank.
 */
export function buildInviteCardLines(
  invitation?: InvitationMeta | null,
  titleFallback?: string,
): InviteCardLines {
  const host = invitation?.hostName?.trim() || "";
  const guest = invitation?.guestName?.trim() || "";
  const eventName = invitation?.eventName?.trim() || "";
  const eventType = invitation?.eventType?.trim() || "";
  const when = invitation?.eventWhen?.trim() || "";
  const where = invitation?.eventWhere?.trim() || "";

  let headline = "";
  if (host && guest) headline = `${host} invites ${guest}`;
  else if (host) headline = `${host} invites you`;
  else if (guest) headline = `You're invited, ${guest}`;
  else headline = "You're invited";

  let subline = "";
  if (eventName) subline = `to ${eventName}`;
  else if (eventType) subline = `to a ${eventType}`;
  else if (titleFallback?.trim() && titleFallback.trim() !== "You're invited!") {
    subline = titleFallback.trim();
  }

  const detailParts = [when, where].filter(Boolean);
  const detail = detailParts.join(" · ");

  const hasContent = Boolean(
    host || guest || eventName || eventType || when || where,
  );

  return { headline, subline, detail, hasContent };
}
