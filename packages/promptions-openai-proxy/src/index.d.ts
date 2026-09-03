import type { Plugin } from "vite";

export interface OpenAIProxyOptions {
    /** Path the browser calls. Defaults to `/api/openai`. */
    path?: string;
    /**
     * Largest request body forwarded upstream, in bytes. Defaults to 10 MiB.
     * Larger requests are rejected with 413.
     */
    maxBodyBytes?: number;
}

/**
 * Proxies OpenAI / Azure OpenAI traffic through the Vite dev and preview
 * servers so the API key stays on the server and never reaches the bundle.
 */
export declare function openaiProxy(options?: OpenAIProxyOptions): Plugin;
