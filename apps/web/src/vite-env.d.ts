/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_GOOGLE_CLIENT_ID?: string;
  readonly VITE_AUTH_APPLE_CLIENT_ID?: string;
  readonly VITE_AUTH_MICROSOFT_CLIENT_ID?: string;
  readonly VITE_AUTH_META_CLIENT_ID?: string;
  readonly VITE_AUTH_GITHUB_CLIENT_ID?: string;
  readonly VITE_AUTH_REDIRECT_URI?: string;
  readonly VITE_BASE_PATH?: string;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
