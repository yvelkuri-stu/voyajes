// Published contact for takedowns/support. Set VITE_CONTACT_EMAIL at build time.
const email = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim();
export const CONTACT = email
  ? { href: `mailto:${email}?subject=${encodeURIComponent("Voyajes report")}`, label: email, email }
  : { href: "https://github.com/yvelkuri-stu/voyajes/issues/new?labels=report&title=Content%20report", label: "our report form", email: null };
export const TAKEDOWN_HOURS = 24;
