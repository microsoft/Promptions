import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import { openaiProxy } from "./index.js";

const PROXY_PATH = "/api/openai";
const PLACEHOLDER = "injected-by-proxy";

/** `loadEnv` merges `process.env`, so ambient values would leak into tests. */
const MANAGED_ENV = [
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_API_STYLE",
    "OPENAI_API_VERSION",
    "OPENAI_MODEL",
    "OPENAI_IMAGE_MODEL",
    "VITE_OPENAI_API_KEY",
];

beforeEach(() => {
    for (const name of MANAGED_ENV) delete process.env[name];
});

/** Writes a throwaway env dir so each test gets an isolated configuration. */
function envDirWith(vars) {
    const dir = mkdtempSync(join(tmpdir(), "openai-proxy-test-"));
    const contents = Object.entries(vars)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n");
    writeFileSync(join(dir, ".env"), contents);
    return dir;
}

/**
 * Applies the plugin's config hook and returns what it produced, mirroring how
 * Vite drives it.
 */
function configure(vars, options = {}) {
    const plugin = openaiProxy(options);
    const warnings = [];
    const result = plugin.config({ envDir: envDirWith(vars) }, { mode: "development" });
    const start = () => {
        plugin.configureServer({
            config: { logger: { warn: (message) => warnings.push(message) } },
            middlewares: { use: () => {} },
        });
        return warnings;
    };
    return { plugin, define: result?.define ?? {}, start };
}

describe("client configuration", () => {
    test("refuses to start while the pre-proxy browser key is set", () => {
        assert.throws(
            () => configure({ OPENAI_API_KEY: "sk-server", VITE_OPENAI_API_KEY: "sk-exposed" }),
            (error) => {
                assert.match(error.message, /VITE_OPENAI_API_KEY/);
                // The message is a startup banner; it must not print the secret.
                assert.ok(!error.message.includes("sk-exposed"));
                return true;
            },
        );
    });

    test("warns about other credential-shaped client variables without echoing them", () => {
        const { start } = configure({ OPENAI_API_KEY: "sk-server", VITE_SOME_TOKEN: "abc123" });
        const warnings = start().join("\n");
        assert.match(warnings, /VITE_SOME_TOKEN/);
        assert.ok(!warnings.includes("abc123"));
    });

    test("does not warn when nothing is exposed", () => {
        const { start } = configure({ OPENAI_API_KEY: "sk-server", VITE_APP_TITLE: "Hello" });
        assert.deepEqual(start(), []);
    });

    test("warns when no key is configured at all", () => {
        const { start } = configure({});
        assert.match(start().join("\n"), /OPENAI_API_KEY/);
    });

    test("never hands the credential to client code", () => {
        const { define } = configure({ OPENAI_API_KEY: "sk-server", OPENAI_MODEL: "gpt-5.4-nano" });
        const serialized = JSON.stringify(define);
        assert.ok(!serialized.includes("sk-server"));
        assert.ok(Object.keys(define).every((name) => !/API_KEY/i.test(name)));
        // Non-secret settings still have to reach the client.
        assert.match(serialized, /gpt-5\.4-nano/);
    });

    test("infers the auth style from the endpoint and honours an explicit override", () => {
        const styleOf = (vars) => JSON.parse(configure(vars).define["import.meta.env.VITE_OPENAI_PROXY_MODE"]);

        assert.equal(styleOf({ OPENAI_API_KEY: "k" }), "openai");
        assert.equal(styleOf({ OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://r.openai.azure.com" }), "azure");
        assert.equal(
            styleOf({ OPENAI_API_KEY: "k", OPENAI_BASE_URL: "https://compatible.example", OPENAI_API_STYLE: "openai" }),
            "openai",
        );
        assert.equal(styleOf({ OPENAI_API_KEY: "k", OPENAI_API_STYLE: "azure" }), "azure");
    });
});

describe("build and preview consistency", () => {
    test("warns when the built bundle was made with different settings", () => {
        const built = configure({ OPENAI_API_KEY: "k", OPENAI_MODEL: "built-model" });
        let emitted;
        built.plugin.generateBundle.call({ emitFile: (file) => (emitted = file) });

        const outDir = mkdtempSync(join(tmpdir(), "openai-proxy-dist-"));
        writeFileSync(join(outDir, emitted.fileName), emitted.source);

        const previewWith = (vars) => {
            const plugin = openaiProxy();
            plugin.config({ envDir: envDirWith(vars) }, { mode: "development" });
            const warnings = [];
            plugin.configurePreviewServer({
                config: {
                    root: outDir,
                    build: { outDir: "." },
                    logger: { warn: (message) => warnings.push(message) },
                },
                middlewares: { use: () => {} },
            });
            return warnings.join("\n");
        };

        assert.equal(previewWith({ OPENAI_API_KEY: "k", OPENAI_MODEL: "built-model" }), "");

        const drifted = previewWith({ OPENAI_API_KEY: "k", OPENAI_MODEL: "different-model" });
        assert.match(drifted, /VITE_OPENAI_MODEL/);
        assert.match(drifted, /different-model/);
    });
});

describe("forwarding", () => {
    /** @type {import("node:http").Server} */
    let upstream;
    /** @type {string} */
    let upstreamUrl;
    /** @type {Array<{ url: string, headers: Record<string, string | undefined>, body: string }>} */
    let received;

    /** @param {import("node:http").Server} server */
    const portOf = (server) => /** @type {import("node:net").AddressInfo} */ (server.address()).port;

    before(async () => {
        upstream = createServer(async (req, res) => {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            received.push({
                url: req.url ?? "",
                headers: /** @type {Record<string, string | undefined>} */ (req.headers),
                body: Buffer.concat(chunks).toString("utf8"),
            });

            if (req.url?.includes("/stream")) {
                res.writeHead(200, { "content-type": "text/event-stream" });
                res.write("data: first\n\n");
                setTimeout(() => {
                    res.write("data: second\n\n");
                    res.end();
                }, 150);
                return;
            }

            res.writeHead(200, { "content-type": "application/json", "x-upstream-secret": "must-not-be-relayed" });
            res.end(JSON.stringify({ ok: true }));
        });
        await new Promise((resolve) => upstream.listen(0, "127.0.0.1", () => resolve(undefined)));
        upstreamUrl = `http://127.0.0.1:${portOf(upstream)}`;
    });

    after(() => upstream.close());

    beforeEach(() => {
        received = [];
    });

    /** Starts a server hosting the proxy middleware, as Vite's connect app does. */
    async function startProxy(vars, options = {}) {
        const plugin = openaiProxy(options);
        plugin.config({ envDir: envDirWith(vars) }, { mode: "development" });

        let middleware;
        plugin.configureServer({
            config: { logger: { warn: () => {} } },
            middlewares: { use: (_path, handler) => (middleware = handler) },
        });

        const server = createServer((req, res) => {
            // connect strips the mount path before invoking the middleware.
            req.url = (req.url ?? "").slice(PROXY_PATH.length) || "/";
            middleware(req, res, () => {});
        });
        await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(undefined)));
        return {
            url: `http://127.0.0.1:${portOf(server)}${PROXY_PATH}`,
            close: () => server.close(),
        };
    }

    test("injects the credential and drops what the browser sent", async () => {
        const proxy = await startProxy({ OPENAI_API_KEY: "sk-secret", OPENAI_BASE_URL: upstreamUrl });
        try {
            const response = await fetch(`${proxy.url}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${PLACEHOLDER}`,
                    cookie: "session=should-not-travel",
                },
                body: JSON.stringify({ messages: [] }),
            });

            assert.equal(response.status, 200);
            assert.equal(received.length, 1);

            const [request] = received;
            assert.ok(!JSON.stringify(request.headers).includes(PLACEHOLDER));
            assert.equal(request.headers.cookie, undefined);
            assert.match(request.body, /messages/);

            // Response headers the upstream sets are not blindly relayed.
            assert.equal(response.headers.get("x-upstream-secret"), null);
        } finally {
            proxy.close();
        }
    });

    test("uses the auth scheme each provider expects and preserves its URL shape", async () => {
        const azure = await startProxy({
            OPENAI_API_KEY: "sk-secret",
            OPENAI_BASE_URL: upstreamUrl,
            OPENAI_API_STYLE: "azure",
        });
        try {
            await fetch(
                `${azure.url}/openai/deployments/my-deployment/chat/completions?api-version=2024-12-01-preview`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: "{}",
                },
            );
        } finally {
            azure.close();
        }

        const azureRequest = received.at(-1);
        assert.equal(azureRequest.headers["api-key"], "sk-secret");
        assert.equal(azureRequest.headers.authorization, undefined);
        assert.match(azureRequest.url, /^\/openai\/deployments\/my-deployment\/.*api-version=/);

        const openai = await startProxy({
            OPENAI_API_KEY: "sk-secret",
            OPENAI_BASE_URL: upstreamUrl,
            OPENAI_API_STYLE: "openai",
        });
        try {
            await fetch(`${openai.url}/v1/chat/completions`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            });
        } finally {
            openai.close();
        }

        const openaiRequest = received.at(-1);
        assert.equal(openaiRequest.headers["api-key"], undefined);
        assert.ok(openaiRequest.headers.authorization.includes("sk-secret"));
        assert.equal(openaiRequest.url, "/v1/chat/completions");
    });

    test("streams responses instead of buffering them", async () => {
        const proxy = await startProxy({ OPENAI_API_KEY: "sk-secret", OPENAI_BASE_URL: upstreamUrl });
        try {
            const response = await fetch(`${proxy.url}/v1/stream`, { method: "POST", body: "{}" });
            assert.ok(response.body);
            const reader = response.body.getReader();

            const firstChunkAt = Date.now();
            const first = await reader.read();
            const elapsed = Date.now() - firstChunkAt;

            assert.ok(!first.done);
            // The upstream holds the connection open for 150ms after the first
            // frame; a buffering proxy could not deliver anything before then.
            assert.ok(elapsed < 140, `first chunk took ${elapsed}ms`);
            await reader.cancel();
        } finally {
            proxy.close();
        }
    });

    test("rejects oversized bodies without contacting the upstream", async () => {
        const proxy = await startProxy(
            { OPENAI_API_KEY: "sk-secret", OPENAI_BASE_URL: upstreamUrl },
            { maxBodyBytes: 64 },
        );
        try {
            const response = await fetch(`${proxy.url}/v1/chat/completions`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "x".repeat(5000),
            });

            assert.equal(response.status, 413);
            assert.equal(received.length, 0);
        } finally {
            proxy.close();
        }
    });

    test("accepts bodies within the limit", async () => {
        const proxy = await startProxy(
            { OPENAI_API_KEY: "sk-secret", OPENAI_BASE_URL: upstreamUrl },
            { maxBodyBytes: 5000 },
        );
        try {
            const response = await fetch(`${proxy.url}/v1/chat/completions`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ prompt: "x".repeat(1000) }),
            });

            assert.equal(response.status, 200);
            assert.equal(received.length, 1);
        } finally {
            proxy.close();
        }
    });

    test("fails without retries when no credential is configured", async () => {
        const proxy = await startProxy({ OPENAI_BASE_URL: upstreamUrl });
        try {
            const response = await fetch(`${proxy.url}/v1/chat/completions`, { method: "POST", body: "{}" });

            assert.equal(response.status, 500);
            // The OpenAI SDK retries 5xx unless told the failure is terminal.
            assert.equal(response.headers.get("x-should-retry"), "false");
            assert.equal(received.length, 0);
        } finally {
            proxy.close();
        }
    });
});
