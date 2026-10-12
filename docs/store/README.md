# Store kit
- **LAUNCH.md**: the step-by-step for each store (start here)
- listing.md: names, descriptions, keywords, categories, URLs
- privacy-data-safety.md: Apple privacy label, Google Data safety, Microsoft answers
- content-rating.md: Apple age rating, IARC answers
- ugc-moderation.md: user-generated-content requirements and review notes
- screenshots/: real screenshots of the live app (regenerate with `cd apps/web && node scripts/store-screenshots.mjs`)

  | folder | size | store slot |
  |---|---|---|
  | ios-6.9 | 1320×2868 | App Store iPhone 6.9" (required) |
  | ios-6.5 | 1284×2778 | App Store iPhone 6.5" |
  | ipad-13 | 2064×2752 | App Store iPad 13" (required because the app runs on iPad) |
  | android-phone | 1080×1920 | Play phone |
  | android-tablet-10 | 2560×1600 | Play 7" and 10" tablet |
  | windows-desktop | 1920×1080 | Microsoft Store desktop |
- graphics/: Play icon 512, feature graphic 1024×500, App Store icon 1024, Microsoft logos and poster
- twa/assetlinks.json: for the optional TWA (see LAUNCH.md §1)
