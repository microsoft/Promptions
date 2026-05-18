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
VITE_OPENAI_API_KEY=your_api_key_here
```

**Azure OpenAI** — to use your own Azure-hosted deployment, set:

```
VITE_OPENAI_API_KEY=your_azure_openai_key_here
VITE_OPENAI_BASE_URL=https://your-resource.openai.azure.com
VITE_OPENAI_API_VERSION=2024-12-01-preview
# On Azure, VITE_OPENAI_MODEL is your DEPLOYMENT NAME (not a model id).
VITE_OPENAI_MODEL=your_chat_deployment_name
```

When `VITE_OPENAI_BASE_URL` is set, the app uses the Azure OpenAI client; otherwise it uses the standard OpenAI client.

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

The chat app uses the model configured in `VITE_OPENAI_MODEL`, defaulting to `gpt-5.4-nano`. When using Azure OpenAI, ensure the deployment named in `VITE_OPENAI_MODEL` targets a chat-completions-compatible model.

## Security Notes

⚠️ **Important**: This demo uses `dangerouslyAllowBrowser: true` for the OpenAI client, which exposes your API key in the browser. In a production application, you should:

1. Move OpenAI API calls to a backend server
2. Implement proper authentication
3. Use environment variables on the server side
4. Add rate limiting and other security measures

## Contributing

This is part of the promptions monorepo. Please see the main README for contribution guidelines.
