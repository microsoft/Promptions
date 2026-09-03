# @promptions/promptions-openai-proxy

Vite plugin that keeps the OpenAI / Azure OpenAI credential on the server.

The browser never receives an API key. Requests go to a same-origin path
(`/api/openai` by default), and the Vite dev/preview server attaches the real
credential before forwarding upstream.

## Why

`VITE_`-prefixed variables are inlined into the client bundle at build time, so
`VITE_OPENAI_API_KEY` would ship the secret in the served JavaScript. This
plugin reads `OPENAI_API_KEY` **without** the prefix, which makes that inlining
impossible.

## Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { openaiProxy } from "@promptions/promptions-openai-proxy";

export default defineConfig({
    plugins: [openaiProxy()],
});
```

```sh
# .env (git-ignored) — no VITE_ prefix
OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://your-resource.openai.azure.com
# OPENAI_API_VERSION=2024-12-01-preview
# OPENAI_MODEL=gpt-5.4-nano
```

Client code points the OpenAI SDK at the proxy and passes a placeholder key:

```ts
const proxyUrl = `${window.location.origin}${import.meta.env.VITE_OPENAI_PROXY_PATH}`;

const client =
    import.meta.env.VITE_OPENAI_PROXY_MODE === "azure"
        ? new AzureOpenAI({
              endpoint: proxyUrl,
              apiVersion: import.meta.env.VITE_OPENAI_API_VERSION,
              apiKey: "proxy-injects-the-real-key",
              dangerouslyAllowBrowser: true,
          })
        : new OpenAI({
              baseURL: `${proxyUrl}/v1`,
              apiKey: "proxy-injects-the-real-key",
              dangerouslyAllowBrowser: true,
          });
```

`dangerouslyAllowBrowser` is still required because the SDK refuses to run in a
browser otherwise, but there is no longer a real credential to leak.

## Environment variables

| Variable             | Scope  | Description                                                                              |
| -------------------- | ------ | ---------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`     | server | Required. Never exposed to the client.                                                   |
| `OPENAI_BASE_URL`    | server | Optional. Azure/custom endpoint. When set, the proxy uses Azure headers.                 |
| `OPENAI_API_STYLE`   | server | Optional. `openai` or `azure`. Overrides the inference above.                            |
| `OPENAI_API_VERSION` | client | Optional. Required for Azure. Not secret.                                                |
| `OPENAI_MODEL`       | client | Optional chat model override. Not secret.                                                |
| `OPENAI_IMAGE_MODEL` | client | Optional image model override. Set this to your Azure image deployment name. Not secret. |

The plugin exposes the non-secret values to client code as
`import.meta.env.VITE_OPENAI_PROXY_PATH`, `VITE_OPENAI_PROXY_MODE`,
`VITE_OPENAI_API_VERSION`, `VITE_OPENAI_MODEL` and `VITE_OPENAI_IMAGE_MODEL`.

Startup **fails** if `VITE_OPENAI_API_KEY` is set, and warns if any other
`VITE_`-prefixed variable looks like a credential (`KEY`, `SECRET`, `TOKEN`,
`PASSWORD`). Vite serves the whole `import.meta.env` object to the browser in
dev, so such a variable is exposed to any page visitor even when no code
references it — most often a `VITE_OPENAI_API_KEY` left over from before this
proxy existed.

## Request handling

- Forwards the request path and query verbatim onto the upstream base URL, so
  both OpenAI and Azure OpenAI URL shapes work unchanged.
- Injects `Authorization: Bearer <key>` (OpenAI) or `api-key: <key>` (Azure).
- Forwards only `accept`, `content-type` and `openai-beta` upstream; cookies and
  the client's placeholder credential are dropped.
- Streams responses back unbuffered, so SSE token streaming works.
- Aborts the upstream request when the browser disconnects.

## Scope

Active for `vite dev` and `vite preview`. A static deployment of `dist/` has no
server, so it needs an equivalent proxy (for example a serverless function
holding the key) in front of it.
