/**
 * v1.1 Indian-language support: caption phrase packs + Story Brain / capsule / year UI strings.
 * Fonts are Noto (Google Fonts, free) loaded in index.html; canvas text falls back to them.
 */
export const LANGS = [
  { id: "en", label: "English", native: "English", script: "Latin" },
  { id: "hi", label: "Hindi", native: "हिन्दी", script: "Devanagari" },
  { id: "te", label: "Telugu", native: "తెలుగు", script: "Telugu" },
  { id: "ta", label: "Tamil", native: "தமிழ்", script: "Tamil" },
  { id: "kn", label: "Kannada", native: "ಕನ್ನಡ", script: "Kannada" },
  { id: "ml", label: "Malayalam", native: "മലയാളം", script: "Malayalam" },
  { id: "bn", label: "Bengali", native: "বাংলা", script: "Bengali" },
  { id: "mr", label: "Marathi", native: "मराठी", script: "Devanagari" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી", script: "Gujarati" },
  { id: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", script: "Gurmukhi" },
] as const;
export type Lang = (typeof LANGS)[number]["id"];

/** Canvas + CSS fallback chain so every script renders (Latin first). */
export const INDIC_FONTS =
  '"Noto Sans Devanagari", "Noto Sans Telugu", "Noto Sans Tamil", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Bengali", "Noto Sans Gujarati", "Noto Sans Gurmukhi"';
const FONT_OF: Record<string, string> = {
  Devanagari: "Noto Sans Devanagari", Telugu: "Noto Sans Telugu", Tamil: "Noto Sans Tamil", Kannada: "Noto Sans Kannada",
  Malayalam: "Noto Sans Malayalam", Bengali: "Noto Sans Bengali", Gujarati: "Noto Sans Gujarati", Gurmukhi: "Noto Sans Gurmukhi",
};
const RANGES: [RegExp, Lang][] = [
  [/[\u0C00-\u0C7F]/, "te"], [/[\u0B80-\u0BFF]/, "ta"], [/[\u0C80-\u0CFF]/, "kn"], [/[\u0D00-\u0D7F]/, "ml"],
  [/[\u0980-\u09FF]/, "bn"], [/[\u0A80-\u0AFF]/, "gu"], [/[\u0A00-\u0A7F]/, "pa"], [/[\u0900-\u097F]/, "hi"],
];
export function detectScript(text: string): Lang | null {
  for (const [re, l] of RANGES) if (re.test(text)) return l;
  return null;
}
/** Make sure the right Noto face is ready before drawing to a canvas. */
export async function ensureFontsFor(text: string): Promise<void> {
  const l = detectScript(text);
  if (!l || typeof document === "undefined" || !document.fonts) return;
  const fam = FONT_OF[LANGS.find((x) => x.id === l)!.script];
  try {
    await Promise.race([document.fonts.load(`600 48px "${fam}"`, text), new Promise((r) => setTimeout(r, 2500))]);
  } catch {
    /* offline: system fallback */
  }
}

type Mood = "trip" | "party" | "family" | "wedding" | "food" | "calm" | "default";
/** Caption phrase packs: {place} is filled in when we know it. */
export const PHRASES: Record<Lang, Record<Mood, { title: string; caption: string }>> = {
  en: {
    trip: { title: "{place} Diaries", caption: "Roads, light and us" }, party: { title: "Best Night Ever", caption: "Turn it up 🎉" },
    family: { title: "Family Days", caption: "Our people, our place" }, wedding: { title: "Forever Starts Here", caption: "Two hearts, one story" },
    food: { title: "Taste of {place}", caption: "Every bite a memory" }, calm: { title: "Slow Days", caption: "Breathe it in" },
    default: { title: "Our Voyage", caption: "Moments worth keeping" },
  },
  hi: {
    trip: { title: "{place} की यादें", caption: "राहें, रोशनी और हम" }, party: { title: "सबसे शानदार रात", caption: "धूम मचा दो 🎉" },
    family: { title: "परिवार के दिन", caption: "अपने लोग, अपना घर" }, wedding: { title: "हमेशा का साथ", caption: "दो दिल, एक कहानी" },
    food: { title: "{place} का स्वाद", caption: "हर निवाला एक याद" }, calm: { title: "सुकून के पल", caption: "बस महसूस करो" },
    default: { title: "हमारा सफ़र", caption: "संजोने लायक पल" },
  },
  te: {
    trip: { title: "{place} జ్ఞాపకాలు", caption: "దారులు, వెలుగు, మనం" }, party: { title: "అదిరిపోయే రాత్రి", caption: "సందడి చేద్దాం 🎉" },
    family: { title: "కుటుంబ రోజులు", caption: "మన వాళ్ళు, మన ఇల్లు" }, wedding: { title: "ఎప్పటికీ కలిసి", caption: "రెండు హృదయాలు, ఒక కథ" },
    food: { title: "{place} రుచులు", caption: "ప్రతి ముద్ద ఒక జ్ఞాపకం" }, calm: { title: "ప్రశాంత క్షణాలు", caption: "ఆస్వాదించండి" },
    default: { title: "మన ప్రయాణం", caption: "దాచుకోదగ్గ క్షణాలు" },
  },
  ta: {
    trip: { title: "{place} நினைவுகள்", caption: "பாதைகள், ஒளி, நாம்" }, party: { title: "அசத்தலான இரவு", caption: "கொண்டாடுவோம் 🎉" },
    family: { title: "குடும்ப நாட்கள்", caption: "நம் மக்கள், நம் வீடு" }, wedding: { title: "என்றென்றும் ஒன்றாக", caption: "இரு இதயங்கள், ஒரு கதை" },
    food: { title: "{place} சுவை", caption: "ஒவ்வொரு கடியும் ஒரு நினைவு" }, calm: { title: "அமைதியான நாட்கள்", caption: "ரசித்து வாழ்" },
    default: { title: "நம் பயணம்", caption: "பொக்கிஷமான தருணங்கள்" },
  },
  kn: {
    trip: { title: "{place} ನೆನಪುಗಳು", caption: "ದಾರಿ, ಬೆಳಕು ಮತ್ತು ನಾವು" }, party: { title: "ಅದ್ಭುತ ರಾತ್ರಿ", caption: "ಸಂಭ್ರಮಿಸೋಣ 🎉" },
    family: { title: "ಕುಟುಂಬದ ದಿನಗಳು", caption: "ನಮ್ಮವರು, ನಮ್ಮ ಮನೆ" }, wedding: { title: "ಎಂದೆಂದಿಗೂ ಜೊತೆ", caption: "ಎರಡು ಹೃದಯ, ಒಂದು ಕಥೆ" },
    food: { title: "{place} ರುಚಿ", caption: "ಪ್ರತಿ ತುತ್ತು ಒಂದು ನೆನಪು" }, calm: { title: "ಶಾಂತ ದಿನಗಳು", caption: "ಆಸ್ವಾದಿಸಿ" },
    default: { title: "ನಮ್ಮ ಪ್ರಯಾಣ", caption: "ಉಳಿಸಿಕೊಳ್ಳುವ ಕ್ಷಣಗಳು" },
  },
  ml: {
    trip: { title: "{place} ഓർമ്മകൾ", caption: "വഴികൾ, വെളിച്ചം, നമ്മൾ" }, party: { title: "അടിപൊളി രാത്രി", caption: "ആഘോഷിക്കാം 🎉" },
    family: { title: "കുടുംബ ദിനങ്ങൾ", caption: "നമ്മുടെ ആളുകൾ, നമ്മുടെ വീട്" }, wedding: { title: "എന്നെന്നും ഒന്നിച്ച്", caption: "രണ്ട് ഹൃദയം, ഒരു കഥ" },
    food: { title: "{place} രുചി", caption: "ഓരോ കടിയും ഒരു ഓർമ്മ" }, calm: { title: "ശാന്ത ദിനങ്ങൾ", caption: "ആസ്വദിക്കൂ" },
    default: { title: "നമ്മുടെ യാത്ര", caption: "സൂക്ഷിക്കേണ്ട നിമിഷങ്ങൾ" },
  },
  bn: {
    trip: { title: "{place} স্মৃতি", caption: "পথ, আলো আর আমরা" }, party: { title: "সেরা রাত", caption: "জমিয়ে দাও 🎉" },
    family: { title: "পরিবারের দিন", caption: "আমাদের মানুষ, আমাদের ঘর" }, wedding: { title: "চিরকালের শুরু", caption: "দুই হৃদয়, এক গল্প" },
    food: { title: "{place} স্বাদ", caption: "প্রতিটি কামড় একটি স্মৃতি" }, calm: { title: "শান্ত দিন", caption: "অনুভব করো" },
    default: { title: "আমাদের যাত্রা", caption: "রেখে দেওয়ার মতো মুহূর্ত" },
  },
  mr: {
    trip: { title: "{place} आठवणी", caption: "वाटा, प्रकाश आणि आपण" }, party: { title: "भन्नाट रात्र", caption: "धमाल करूया 🎉" },
    family: { title: "कुटुंबाचे दिवस", caption: "आपली माणसं, आपलं घर" }, wedding: { title: "कायमचं नातं", caption: "दोन हृदयं, एक गोष्ट" },
    food: { title: "{place} ची चव", caption: "प्रत्येक घास एक आठवण" }, calm: { title: "निवांत क्षण", caption: "अनुभवा" },
    default: { title: "आपला प्रवास", caption: "जपून ठेवावे असे क्षण" },
  },
  gu: {
    trip: { title: "{place} ની યાદો", caption: "રસ્તા, પ્રકાશ અને આપણે" }, party: { title: "શાનદાર રાત", caption: "ધમાલ કરીએ 🎉" },
    family: { title: "પરિવારના દિવસો", caption: "આપણા લોકો, આપણું ઘર" }, wedding: { title: "હંમેશનો સાથ", caption: "બે દિલ, એક વાર્તા" },
    food: { title: "{place} નો સ્વાદ", caption: "દરેક કોળિયો એક યાદ" }, calm: { title: "શાંત ક્ષણો", caption: "માણો" },
    default: { title: "આપણી સફર", caption: "સાચવવા જેવી ક્ષણો" },
  },
  pa: {
    trip: { title: "{place} ਦੀਆਂ ਯਾਦਾਂ", caption: "ਰਾਹ, ਰੌਸ਼ਨੀ ਤੇ ਅਸੀਂ" }, party: { title: "ਸਭ ਤੋਂ ਵਧੀਆ ਰਾਤ", caption: "ਧਮਾਲ ਪਾਓ 🎉" },
    family: { title: "ਪਰਿਵਾਰ ਦੇ ਦਿਨ", caption: "ਸਾਡੇ ਲੋਕ, ਸਾਡਾ ਘਰ" }, wedding: { title: "ਸਦਾ ਦਾ ਸਾਥ", caption: "ਦੋ ਦਿਲ, ਇੱਕ ਕਹਾਣੀ" },
    food: { title: "{place} ਦਾ ਸੁਆਦ", caption: "ਹਰ ਬੁਰਕੀ ਇੱਕ ਯਾਦ" }, calm: { title: "ਸ਼ਾਂਤ ਪਲ", caption: "ਮਾਣੋ" },
    default: { title: "ਸਾਡਾ ਸਫ਼ਰ", caption: "ਸਾਂਭਣ ਯੋਗ ਪਲ" },
  },
};
export type { Mood };

const UI: Record<string, Partial<Record<Lang, string>>> = {
  brain: { en: "Story Brain", hi: "स्टोरी ब्रेन", te: "స్టోరీ బ్రెయిన్", ta: "ஸ்டோரி பிரைன்" },
  prompt: { en: "Describe your story", hi: "अपनी कहानी बताइए", te: "మీ కథ చెప్పండి", ta: "உங்கள் கதையைச் சொல்லுங்கள்", kn: "ನಿಮ್ಮ ಕಥೆ ಹೇಳಿ", ml: "നിങ്ങളുടെ കഥ പറയൂ", bn: "আপনার গল্প বলুন", mr: "तुमची गोष्ट सांगा", gu: "તમારી વાર્તા કહો", pa: "ਆਪਣੀ ਕਹਾਣੀ ਦੱਸੋ" },
  make: { en: "Make my story", hi: "मेरी कहानी बनाओ", te: "నా కథ తయారు చేయి", ta: "என் கதையை உருவாக்கு", kn: "ನನ್ನ ಕಥೆ ಮಾಡು", ml: "എന്റെ കഥ ഉണ്ടാക്കൂ", bn: "আমার গল্প বানাও", mr: "माझी गोष्ट बनवा", gu: "મારી વાર્તા બનાવો", pa: "ਮੇਰੀ ਕਹਾਣੀ ਬਣਾਓ" },
  best: { en: "Best shots", hi: "बेहतरीन तस्वीरें", te: "ఉత్తమ చిత్రాలు", ta: "சிறந்த படங்கள்" },
  route: { en: "Route-map intro", hi: "रूट-मैप इंट्रो", te: "రూట్ మ్యాప్ ఇంట్రో", ta: "பாதை வரைபட அறிமுகம்" },
  lang: { en: "Caption language", hi: "कैप्शन भाषा", te: "క్యాప్షన్ భాష", ta: "தலைப்பு மொழி" },
  capsule: { en: "Time capsule", hi: "टाइम कैप्सूल", te: "టైమ్ క్యాప్సూల్", ta: "கால பெட்டகம்" },
  opensIn: { en: "Opens in", hi: "खुलेगा", te: "తెరుచుకుంటుంది", ta: "திறக்கும்" },
  year: { en: "Year in Voyages", hi: "सफ़र का साल", te: "ప్రయాణాల సంవత్సరం", ta: "பயணங்களின் ஆண்டு" },
};
export function getLang(): Lang {
  try {
    const l = localStorage.getItem("voyajes.lang") as Lang | null;
    return l && LANGS.some((x) => x.id === l) ? l : "en";
  } catch {
    return "en";
  }
}
export function setLang(l: Lang) {
  try {
    localStorage.setItem("voyajes.lang", l);
    document.documentElement.lang = l;
  } catch {
    /* ignore */
  }
}
export const t = (k: keyof typeof UI, l: Lang = getLang()) => UI[k][l] ?? UI[k].en ?? String(k);
