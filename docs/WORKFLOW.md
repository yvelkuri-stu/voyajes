# Voyajes home-testing workflow (happy path)

No OAuth client IDs required. Sessions are **stub** demo sessions in `localStorage`.

**Live:** https://yvelkuri-stu.github.io/voyajes/

---

## 1. Continue (sign in / sign up unified)

1. Open the app → tap **Continue** in the header (or go to `/signin`).
2. Pick any path:
   - **Continue as demo voyager** — instant stub session.
   - **QR code** — tap **Simulate scan** (or open the shown link / QR on another tab). On-screen steps explain the demo.
   - **One-time code** — enter any phone/email → **Send code** → copy the **Demo code** shown on screen → **Verify & continue**.
3. You land on **Create** (or the `?next=` path you came from). Header shows your name + **Sign out**.

Session persists across Home / Create / Themes / Share until you sign out.

## 2. Create → edit → share

1. **Create** — drop photos/clips (or use an empty draft), pick a theme/template, set a title.
2. Optional: **Story coach** suggests a title + caption from theme + clip count; **Memory jar** saves a favorite moment; **Kids Mode** (header toggle) simplifies UI, filters templates, adds sticker stamps, and gates comments.
3. Tap **Share** → public link page `/v/:id` (localStorage stub).
4. Copy link, toggle password stub, react with emoji, leave a comment (or guardian-labeled comment in Kids Mode).

## 3. Sign out

1. Tap **Sign out** in the header.
2. Session clears; header returns to **Continue**. Drafts/shares in this browser stay (local only).

## 4. Kids Mode (optional)

Toggle **Kids** in the header:

- Bigger buttons / tap targets  
- Safer template subset  
- Sticker stamp tool on Create  
- Comments off by default unless labeled with a guardian name  

Toggle **Reduce motion** in the same prefs strip for accessibility.

## Quick demo script (≈2 min)

1. Continue as demo voyager  
2. Enable Kids Mode → stamp a sticker → Story coach → Share  
3. Post a guardian comment → Sign out → Continue again → still on Create  

*OTP codes and QR pairing are mock-only; real SMS/OAuth needs `SETUP_AUTH.md`.*
