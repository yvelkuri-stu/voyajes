/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

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

/** CompressionStream / DecompressionStream (portable share packs) */
interface CompressionStream extends GenericTransformStream {}
interface DecompressionStream extends GenericTransformStream {}
declare var CompressionStream: {
  prototype: CompressionStream;
  new (format: "deflate" | "deflate-raw" | "gzip"): CompressionStream;
};
declare var DecompressionStream: {
  prototype: DecompressionStream;
  new (format: "deflate" | "deflate-raw" | "gzip"): DecompressionStream;
};
