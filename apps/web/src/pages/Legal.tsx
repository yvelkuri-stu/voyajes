import { Link } from "react-router-dom";
import { CONTACT, TAKEDOWN_HOURS } from "../lib/legal";

const Contact = () => (
  <a href={CONTACT.href} data-contact>
    {CONTACT.label}
  </a>
);

export function Terms() {
  return (
    <article className="vj-legal" data-legal="terms">
      <h1>Terms of use</h1>
      <p className="muted">Last updated: 12 October 2026</p>
      <h2>The short version</h2>
      <ul>
        <li>Voyajes is free. Your exports never carry a forced watermark.</li>
        <li>You own what you make. You give us only the permission needed to store and show it to the people you share it with.</li>
        <li>Only upload photos, videos and music you have the right to share.</li>
        <li>Be kind. No harassment, hate, sexual content involving minors, non-consensual intimate imagery, threats, spam or illegal content.</li>
      </ul>
      <h2>Guest content</h2>
      <p>
        Guests can react, comment, RSVP and add photos to a voyage. Hosts can hide comments, reject photos and block a device from
        posting. Anyone can report a voyage, photo or comment with the ⚑ button.
      </p>
      <h2>Reports and takedowns</h2>
      <p data-takedown-note>
        We review reports and act on valid ones within <strong>{TAKEDOWN_HOURS} hours</strong>, removing the content and, where needed, the
        whole voyage. To report something urgently or send a legal/copyright notice, contact <Contact />.
      </p>
      <h2>Availability</h2>
      <p>
        Voyajes is provided as-is. Hosts can delete a published voyage at any time from the Manage panel; that removes its media from
        our servers.
      </p>
      <p>
        See also our <Link to="/privacy">privacy policy</Link> and <Link to="/credits">sound credits</Link> (CC BY attributions for the bundled music).
      </p>
    </article>
  );
}

export function Privacy() {
  return (
    <article className="vj-legal" data-legal="privacy">
      <h1>Privacy</h1>
      <p className="muted">Last updated: 12 October 2026</p>
      <ul>
        <li>
          <strong>No account needed.</strong> Editing happens on your device; drafts stay in your browser.
        </li>
        <li>
          <strong>Short links (optional).</strong> When you publish, the story and its media are stored on Cloudflare (Workers, D1) so
          guests can open it. Hosts can delete it any time.
        </li>
        <li>
          <strong>Guests.</strong> We store what guests choose to send (name, RSVP, comments, photos) plus a random device id so they can
          change their RSVP and hosts can block abuse. No ad tracking, no selling data.
        </li>
        <li>
          <strong>Abuse prevention.</strong> We keep short-lived rate-limit counters keyed by IP address and device id.
        </li>
        <li>
          <strong>Photo location &amp; analysis.</strong> Story Brain reads each photo's location, time and look (for smart crops and best
          shots) on your device only. If you turn on the route-map intro and publish, approximate locations (rounded to about 1 km) travel
          with the story so guests see the map; otherwise no location leaves your device.
        </li>
        <li>
          <strong>Notifications.</strong> If you tap "notify me", we store your browser's push address for that voyage so we can tell you when
          the after-movie or a time capsule is ready. Unsubscribe by turning notifications off for Voyajes.
        </li>
        <li>
          <strong>Camera.</strong> The party camera only uses the camera while it is open, and only uploads the photos you take and send.
        </li>
        <li>
          <strong>Link previews.</strong> Apps like WhatsApp fetch the title, details and cover image of a short link to show a preview.
        </li>
      </ul>
      <p>
        Questions or deletion requests: <Contact />. We respond within {TAKEDOWN_HOURS} hours for takedowns.
      </p>
      <p>
        <Link to="/terms">Terms of use</Link>
      </p>
    </article>
  );
}
