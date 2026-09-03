# Promptions Chat

A modern chat interface built with React, Vite, Fluent UI, and OpenAI streaming responses.

## Features

- 🎨 Beautiful UI with Microsoft Fluent UI components
- 💬 Real-time streaming responses from OpenAI
- ⚡ Fast development with Vite
- 📱 Responsive design
- ⌨️ Keyboard shortcuts (Enter to send, Shift+Enter for new line)

## Getting Started

### Prerequisites

- Node.js 18+
- Yarn (workspace package manager)
- An OpenAI API key, _or_ an Azure OpenAI resource (API key, endpoint, and a deployment)

### Installation

1. From the workspace root, install dependencies:

```bash
yarn install
```

2. Navigate to the chat app directory:

```bash
cd apps/promptions-chat
```

3. Copy the environment file and configure your provider:

```bash
cp .env.example .env
```

**Standard OpenAI** — edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

**Azure OpenAI** — to use your own Azure-hosted deployment, set:

```
OPENAI_API_KEY=your_azure_openai_key_here
OPENAI_BASE_URL=https://your-resource.openai.azure.com
OPENAI_API_VERSION=2024-12-01-preview
# On Azure, OPENAI_MODEL is your DEPLOYMENT NAME (not a model id).
OPENAI_MODEL=your_chat_deployment_name
```

These variables are deliberately **not** prefixed with `VITE_`, so Vite cannot inline them into the browser bundle. The dev/preview server proxies requests at `/api/openai` and attaches the credential server-side.

If you used an earlier version of this app, delete `VITE_OPENAI_API_KEY` from your `.env` and rotate that key — Vite serves every `VITE_`-prefixed variable to client code, so it remains exposed to the browser even though no code reads it now.

When `OPENAI_BASE_URL` is set, the app uses Azure OpenAI conventions; otherwise it uses the standard OpenAI conventions. Set `OPENAI_API_STYLE=openai` to use a custom endpoint with standard OpenAI conventions.

### Development

Start the development server:

```bash
yarn dev
```

The app will be available at `http://localhost:3003`

### Building

Build the application for production:

```bash
yarn build
```

### Type Checking

Run TypeScript type checking:

```bash
yarn typecheck
```

## Architecture

- **React 18** - Modern React with hooks
- **Vite** - Fast build tool and dev server
- **Fluent UI** - Microsoft's design system
- **OpenAI / Azure OpenAI API** - Streaming chat completions (defaults to `gpt-5.4-nano`)
- **TypeScript** - Full type safety

## Model compatibility

The chat app uses the model configured in `OPENAI_MODEL`, defaulting to `gpt-5.4-nano`. When using Azure OpenAI, ensure the deployment named in `OPENAI_MODEL` targets a chat-completions-compatible model.

## Security Notes

The API key is held by the Vite dev/preview server and injected into requests there. The browser talks only to the same-origin `/api/openai` proxy with a placeholder credential, so no key is present in the shipped bundle. `dangerouslyAllowBrowser: true` remains set because the OpenAI SDK refuses to run in a browser otherwise, but there is no real credential for it to expose.

⚠️ Two limits to be aware of before deploying this beyond local development:

1. The proxy runs only under `vite dev` and `vite preview`. A static build of `dist/` has no server, so it needs an equivalent proxy (for example a serverless function holding the key) in front of it.
2. The proxy endpoint is an unauthenticated pass-through to your credential. Anyone who can reach it can spend your quota, so add authentication and rate limiting before exposing it beyond `localhost`.

## Contributing

This is part of the promptions monorepo. Please see the main README for contribution guidelines.
