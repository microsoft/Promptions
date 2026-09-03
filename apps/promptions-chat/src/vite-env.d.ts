/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Injected by @promptions/promptions-openai-proxy. Non-secret values only:
    // the API key is read server-side from OPENAI_API_KEY and never exposed here.
    readonly VITE_OPENAI_PROXY_PATH: string;
    readonly VITE_OPENAI_PROXY_MODE: "azure" | "openai";
    readonly VITE_OPENAI_API_VERSION?: string;
    readonly VITE_OPENAI_MODEL?: string;
    // more env variables...
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
