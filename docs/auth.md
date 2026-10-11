# Auth (dormant since v0.6 "Focus")

v0.6 ships a single **local session** ("Continue on this device" → `signInDemo`).
The provider suite (GitHub / Google / Apple OAuth via `lib/auth.ts`), QR pairing and the
SMS/email OTP stubs are still in `apps/web/src/pages/SignIn.tsx` (`SignInFull`) and
`apps/web/src/lib/auth.ts`.

Re-enable for development: build with `VITE_AUTH_SUITE=1`.

Kids Mode is dormant the same way: with `VITE_KIDS_MODE=1` a saved `kidsMode` pref is honoured
again (kid-safe templates, bigger targets); there is no header toggle in v0.6.
