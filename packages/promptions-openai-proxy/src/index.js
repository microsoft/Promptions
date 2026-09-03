import { readFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { loadEnv } from "vite";

const DEFAULT_UPSTREAM = "https://api.openai.com";
const DEFAULT_PROXY_PATH = "/api/openai";

/**
 * Request bodies are buffered before being forwarded, so they need a ceiling:
 * the proxy is unauthenticated, and a dev server bound to a reachable
 * interface would otherwise let one request grow the process heap without
 * limit. Chat and image prompts are JSON payloads far below this.
 */
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

/** Name of the build manifest used to detect build/preview config drift. */
const CLIENT_CONFIG_FILE = "openai-proxy.config.json";

/**
 * Request headers forwarded upstream. Everything else (cookies, the client's
 * placeholder credential, hop-by-hop headers) is dropped.
 */
const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "openai-beta"];

/** Response headers forwarded back to the browser. */
const FORWARDED_RESPONSE_HEADERS = ["content-type", "cache-control"];

/**
 * @typedef {"azure" | "openai"} ApiStyle
 *
 * @typedef {object} OpenAIProxyOptions
 * @property {string} [path] Path the browser calls. Defaults to `/api/openai`.
 * @property {number} [maxBodyBytes] Largest request body forwarded upstream.
 *   Defaults to 10 MiB. Larger requests are rejected with 413.
 *
 * @typedef {object} ProxySettings
 * @property {string} [apiKey]
 * @property {string} upstream
 * @property {ApiStyle} mode
 * @property {number} maxBodyBytes
 */

/**
 * Proxies OpenAI / Azure OpenAI traffic through the Vite dev and preview
 * servers so the credential stays on the server.
 *
 * The key is read from `OPENAI_API_KEY` without the `VITE_` prefix, which means
 * Vite never inlines it into the client bundle. The browser sends its requests
 * to the proxy path with no credential; this plugin attaches the real one
 * before forwarding upstream.
 *
 * @param {OpenAIProxyOptions} [options]
 * @returns {import("vite").Plugin}
 */
export function openaiProxy(options = {}) {
    const proxyPath = options.path ?? DEFAULT_PROXY_PATH;
    const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

    /** @type {ProxySettings} */
    let settings = { upstream: DEFAULT_UPSTREAM, mode: "openai", maxBodyBytes };

    /**
     * The values baked into client code by `define`. Recorded into the build
     * so `vite preview` can detect that it is serving a bundle built with
     * different settings than the proxy is now running with.
     * @type {Record<string, string>}
     */
    let clientConfig = {};

    /**
     * Names of `VITE_`-prefixed variables that look like credentials. Vite
     * serves the whole `import.meta.env` object to the browser in dev, so any
     * such variable is exposed regardless of whether code references it.
     * @type {string[]}
     */
    let exposedSecretNames = [];

    /** @type {import("vite").Connect.NextHandleFunction} */
    const handler = (req, res) => {
        void forward(req, res, settings);
    };

    /** @param {(message: string) => void} warn */
    const warnAboutConfig = (warn) => {
        if (!settings.apiKey) {
            warn(
                `[openai-proxy] OPENAI_API_KEY is not set. Requests to ${proxyPath} will fail. ` +
                    `Copy .env.example to .env and set OPENAI_API_KEY (note: no VITE_ prefix).`,
            );
        }
        if (exposedSecretNames.length > 0) {
            warn(
                `[openai-proxy] SECURITY: ${exposedSecretNames.join(", ")} ${
                    exposedSecretNames.length === 1 ? "is" : "are"
                } exposed to the browser. ` +
                    `Vite serves every VITE_-prefixed variable to client code, so this value is readable by anyone ` +
                    `loading the app. It is left over from a version of this app that ran the API key in the browser. ` +
                    `Remove it from your .env — the proxy reads OPENAI_API_KEY instead — and rotate the credential.`,
            );
        }
    };

    return {
        name: "promptions:openai-proxy",

        config(config, { mode }) {
            const envDir = config.envDir ?? config.root ?? process.cwd();
            const env = loadEnv(mode, envDir, "");
            const upstream = env.OPENAI_BASE_URL?.trim();
            const style = env.OPENAI_API_STYLE?.trim().toLowerCase();

            exposedSecretNames = Object.keys(env).filter(
                (name) => name.startsWith("VITE_") && /KEY|SECRET|TOKEN|PASSWORD/i.test(name) && env[name],
            );

            // The variable this plugin exists to eliminate. Anything still set
            // here is a live credential being served to the browser, so refuse
            // to start rather than let it look fixed.
            if (env.VITE_OPENAI_API_KEY) {
                throw new Error(
                    `[openai-proxy] VITE_OPENAI_API_KEY is set in your environment. Vite serves every VITE_-prefixed ` +
                        `variable to client code, so this credential is readable by anyone loading the app. ` +
                        `Rename it to OPENAI_API_KEY (no VITE_ prefix) and rotate the key.`,
                );
            }

            settings = {
                apiKey: env.OPENAI_API_KEY?.trim() || undefined,
                upstream: (upstream || DEFAULT_UPSTREAM).replace(/\/+$/, ""),
                // A custom endpoint implies Azure unless told otherwise, which
                // lets other OpenAI-compatible backends opt into bearer auth.
                mode: style === "azure" || style === "openai" ? style : upstream ? "azure" : "openai",
                maxBodyBytes,
            };

            clientConfig = {
                VITE_OPENAI_PROXY_PATH: proxyPath,
                VITE_OPENAI_PROXY_MODE: settings.mode,
                VITE_OPENAI_API_VERSION: env.OPENAI_API_VERSION?.trim() ?? "",
                VITE_OPENAI_MODEL: env.OPENAI_MODEL?.trim() ?? "",
                VITE_OPENAI_IMAGE_MODEL: env.OPENAI_IMAGE_MODEL?.trim() ?? "",
            };

            return {
                define: Object.fromEntries(
                    Object.entries(clientConfig).map(([name, value]) => [
                        `import.meta.env.${name}`,
                        JSON.stringify(value),
                    ]),
                ),
            };
        },

        generateBundle() {
            // `vite preview` serves a prebuilt bundle, so the values above are
            // already frozen into it. Record them so preview can compare.
            this.emitFile({
                type: "asset",
                fileName: CLIENT_CONFIG_FILE,
                source: JSON.stringify(clientConfig, null, 2),
            });
        },

        configureServer(server) {
            warnAboutConfig((message) => server.config.logger.warn(message));
            server.middlewares.use(proxyPath, handler);
        },

        configurePreviewServer(server) {
            warnAboutConfig((message) => server.config.logger.warn(message));
            warnAboutBuildDrift(server.config, (message) => server.config.logger.warn(message));
            server.middlewares.use(proxyPath, handler);
        },
    };

    /**
     * @param {{ root: string, build: { outDir: string } }} config
     * @param {(message: string) => void} warn
     */
    function warnAboutBuildDrift(config, warn) {
        const manifestPath = path.resolve(config.root, config.build.outDir, CLIENT_CONFIG_FILE);
        let built;
        try {
            built = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch {
            // Built by an older version of this plugin, or not built at all.
            return;
        }

        const drifted = Object.keys(clientConfig).filter((name) => built[name] !== clientConfig[name]);
        if (drifted.length === 0) {
            return;
        }

        warn(
            `[openai-proxy] The bundle in ${config.build.outDir} was built with different settings than this ` +
                `preview server is using: ` +
                drifted.map((name) => `${name} was "${built[name]}", now "${clientConfig[name]}"`).join("; ") +
                `. Client code reads these values at build time, so preview will not pick up the new ones — ` +
                `for example a bundle built without Azure settings keeps sending OpenAI-style paths while the ` +
                `proxy talks to Azure. Rebuild before previewing.`,
        );
    }
}

/**
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 * @param {ProxySettings} settings
 */
async function forward(req, res, settings) {
    const apiKey = settings.apiKey;

    if (!apiKey) {
        // 500 is accurate (the server is misconfigured), but the OpenAI SDK
        // retries any 5xx unless told not to, which would turn a config typo
        // into three requests and several seconds of backoff.
        sendJson(
            res,
            500,
            {
                error: {
                    message:
                        "OpenAI proxy is not configured. Set OPENAI_API_KEY (without the VITE_ prefix) in your .env.",
                },
            },
            { "x-should-retry": "false" },
        );
        return;
    }

    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once("aborted", abort);
    res.once("close", abort);

    const method = req.method ?? "GET";
    const headers = new Headers();

    for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.headers[name];
        if (typeof value === "string") {
            headers.set(name, value);
        }
    }

    if (settings.mode === "azure") {
        headers.set("api-key", apiKey);
    } else {
        headers.set("authorization", `Bearer ${apiKey}`);
    }

    try {
        const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req, settings.maxBodyBytes);

        const upstreamResponse = await fetch(`${settings.upstream}${req.url ?? "/"}`, {
            method,
            headers,
            body,
            redirect: "manual",
            signal: controller.signal,
        });

        res.statusCode = upstreamResponse.status;
        for (const name of FORWARDED_RESPONSE_HEADERS) {
            const value = upstreamResponse.headers.get(name);
            if (value) {
                res.setHeader(name, value);
            }
        }

        if (!upstreamResponse.body) {
            res.end();
            return;
        }

        await pipeline(Readable.fromWeb(/** @type {any} */ (upstreamResponse.body)), res);
    } catch (error) {
        if (controller.signal.aborted) {
            res.destroy();
            return;
        }
        if (error instanceof BodyTooLargeError) {
            sendJson(
                res,
                413,
                { error: { message: `Request body exceeds the proxy limit of ${settings.maxBodyBytes} bytes.` } },
                { "x-should-retry": "false" },
            );
            req.destroy();
            return;
        }
        sendJson(res, 502, {
            error: { message: `OpenAI proxy request failed: ${/** @type {Error} */ (error).message}` },
        });
    }
}

class BodyTooLargeError extends Error {}

/**
 * Buffers the request body, refusing to grow past `limit` bytes.
 *
 * @param {import("node:http").IncomingMessage} req
 * @param {number} limit
 * @returns {Promise<Buffer | undefined>}
 */
async function readBody(req, limit) {
    const declared = Number(req.headers["content-length"]);
    if (Number.isFinite(declared) && declared > limit) {
        throw new BodyTooLargeError();
    }

    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.byteLength;
        // Checked per chunk so a request that lies about (or omits) its
        // content-length cannot stream past the limit either.
        if (size > limit) {
            throw new BodyTooLargeError();
        }
        chunks.push(buffer);
    }
    return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

/**
 * @param {import("node:http").ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 * @param {Record<string, string>} [headers]
 */
function sendJson(res, status, payload, headers = {}) {
    if (res.headersSent) {
        res.destroy();
        return;
    }
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value);
    }
    res.end(JSON.stringify(payload));
}
