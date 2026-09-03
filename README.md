# Promptions - Ephemeral UI for Prompting

Ephemeral UI for prompt refinement - turn one prompt into interactive controls to steer and refine AI.

[![Promptions baseline demo](./Promptions.gif)](https://www.youtube.com/watch?v=vr3fZpkKy8Q)

## Overview

Promptions is a simple, flexible **dynamic prompt middleware technique for AI** that uses **ephemeral UI**, developed by the ENCODE and [Tools for Thought](https://aka.ms/toolsforthought) projects at [Microsoft Research, Cambridge, UK](https://www.microsoft.com/en-us/research/lab/microsoft-research-cambridge/). From a single, simple prompt, the system helps users steer the AI by suggesting parameterized choices as dynamically generated, ephemeral UI components. As users click on choices, the same output updates immediately—not just as additional chat responses. The dynamic UI can be configured per prompt.

- For more on what Promptions can do, and for responsible AI suggestions, see our [TRANSPARENCY_NOTE.md](TRANSPARENCY_NOTE.md).
- A detailed discussion of Promptions, including how it was developed and tested, can be found in our research paper "[Dynamic Prompt Middleware: Contextual Prompt Refinement Controls for Comprehension Tasks](https://aka.ms/promptionspaper)."

Promptions is best suited for end-user interfaces where parameterizing prompts adds context that helps steer outputs toward user preferences, without requiring users to write or speak that context. The technique is simple yet effective, and it is easy to customize for many applications—serving developers from individual vibe coders to enterprise teams.

| Real-world use                        | Description                                                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer support chatbots             | Users refine support queries on the fly (e.g., specify tone or detail level) and see updated answers instantly, improving resolution speed and satisfaction.                                    |
| Content creation platforms            | Writers and marketers tweak style, length, or format parameters through GUI controls, iterating drafts faster while maintaining creative direction.                                             |
| Data analytics and BI dashboards      | Analysts adjust filters, aggregation levels, or visualization styles via checkboxes and sliders, regenerating AI-driven reports and insights instantly.                                         |
| Educational tutoring systems          | Students select difficulty, focus topics, or feedback style, prompting the AI tutor to adapt explanations and examples to individual learning needs.                                            |
| Healthcare decision-support tools     | Clinicians refine symptom context, risk factors, or treatment priorities through guided options, obtaining tailored diagnostic suggestions and care pathways.                                   |
| Data annotation and curation          | Promptions can parameterize labeling decisions into structured GUI inputs (e.g. sentiment sliders, style toggles), improving consistency, speed, and auditability in dataset creation.          |
| Interactive explainability & auditing | Promptions allows users to explore how AI outputs shift with different refinement choices, offering a lightweight way to probe bias, model boundaries, or failure modes through UI interaction. |
| Human-AI co-creation experiments      | Promptions enables controlled studies of creative workflows—researchers can observe how users interact with dynamic controls vs. freeform input when generating stories, resumes, or code.      |

## Project Structure

```
promptions/
├── apps/                          # Frontend applications
│   ├── promptions-chat/           # Chat interface (port 3003)
│   └── promptions-image/          # Image generation interface (port 3004)
├── packages/                      # Shared libraries
│   ├── promptions-llm/            # LLM utilities and integrations
│   └── promptions-ui/             # Shared React UI components
├── package.json                   # Root package configuration
├── nx.json                        # NX build system configuration
└── tsconfig.json                  # TypeScript configuration
```

## Prerequisites

Before building and running this project, ensure you have:

- **Node.js** (v18 or higher)
- **Corepack** (included with Node.js v16.10+, enables automatic Yarn management)
- **TypeScript** (v5.0 or higher)
- An **OpenAI API key** _or_ an **Azure OpenAI** resource (API key, endpoint, and a deployment) for chat and image generation features

### Setting up Corepack (Recommended)

This project uses **Yarn 4.9.1** which is automatically managed via corepack. No manual Yarn installation needed!

```bash
# Enable corepack (if not already enabled)
corepack enable

# Verify corepack is working (should show yarn 4.9.1)
corepack yarn --version
```

> **Note:** Corepack is included with Node.js v16.10+ but may need to be enabled. If you're using an older Node.js version, you can install corepack separately: `npm install -g corepack`

### Alternative: Manual Yarn Installation

If you prefer not to use corepack:

```bash
# Install Yarn globally
npm install -g yarn@4.9.1
```

## Quick Start

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd promptions

# Enable corepack (if not already enabled and using corepack)
corepack enable

# Install all dependencies across the monorepo
# Corepack will automatically use the correct Yarn version (4.9.1)
yarn install
```

### 2. Build the Project

```bash
# Build all packages and applications
yarn build
```

### 3. Run the applications (and set your API key)

The apps can call either the **standard OpenAI API** or your own **Azure OpenAI**-hosted models. Configure whichever you have access to via environment variables — the same `OPENAI_API_KEY` variable is used in both cases (it holds either your OpenAI key or your Azure OpenAI key).

> **The API key stays on the server.** These variables are deliberately **not** prefixed with `VITE_`, so Vite cannot inline them into the browser bundle. The dev/preview server proxies requests to your provider at `/api/openai` and attaches the credential server-side. See [`packages/promptions-openai-proxy`](packages/promptions-openai-proxy/README.md).

> **Upgrading from an earlier version?** Delete `VITE_OPENAI_API_KEY` from your `.env` files and rotate that key. Vite serves every `VITE_`-prefixed variable to client code, so a key left there is still readable by anyone loading the app even though no code references it. **The dev server refuses to start while that variable is set**, so you cannot miss this step.

Option A — .env files (recommended for local development):

**Standard OpenAI**

- Create `apps/promptions-chat/.env` (and `apps/promptions-image/.env`) with:

    ```dotenv
    OPENAI_API_KEY=your_openai_api_key_here
    # Optional: override the chat model (defaults to gpt-5.4-nano).
    # OPENAI_MODEL=gpt-5.4-nano
    ```

**Azure OpenAI** (using your own hosted deployment)

- Create `apps/promptions-chat/.env` (and `apps/promptions-image/.env`) with:

    ```dotenv
    # Your Azure OpenAI resource key
    OPENAI_API_KEY=your_azure_openai_key_here
    # Your Azure OpenAI resource endpoint
    OPENAI_BASE_URL=https://your-resource.openai.azure.com
    # Required for Azure OpenAI
    OPENAI_API_VERSION=2024-12-01-preview
    # On Azure, this is your DEPLOYMENT NAME (not the underlying model id).
    # Ensure this deployment targets a chat-completions-compatible model.
    OPENAI_MODEL=your_chat_deployment_name
    ```

Option B — set it in your shell (PowerShell example):

```powershell
# Chat app — standard OpenAI
$env:OPENAI_API_KEY="your_openai_api_key_here" ; yarn workspace @promptions/promptions-chat dev

# Chat app — Azure OpenAI
$env:OPENAI_API_KEY="your_azure_openai_key_here"
$env:OPENAI_BASE_URL="https://your-resource.openai.azure.com"
$env:OPENAI_API_VERSION="2024-12-01-preview"
$env:OPENAI_MODEL="your_chat_deployment_name"
yarn workspace @promptions/promptions-chat dev

# Image app (swap workspace name; same variable conventions apply)
$env:OPENAI_API_KEY="your_openai_api_key_here" ; yarn workspace @promptions/promptions-image dev
```

#### Configuration reference

Both apps read these variables from their respective `.env` files. They are read by the dev/preview server only. `OPENAI_API_KEY` and `OPENAI_BASE_URL` never reach the browser; `OPENAI_API_VERSION`, `OPENAI_MODEL` and `OPENAI_IMAGE_MODEL` are injected into client code, and are not secret.

| Variable             | Description                                                                                                                         | Default        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `OPENAI_API_KEY`     | **Required.** Your OpenAI API key, or your Azure OpenAI resource key when `OPENAI_BASE_URL` is set.                                 | _(unset)_      |
| `OPENAI_MODEL`       | Chat model used for completions. On Azure OpenAI this is the **deployment name**. The image-generation model is selected in the UI. | `gpt-5.4-nano` |
| `OPENAI_BASE_URL`    | Custom endpoint. Set this to use Azure OpenAI (e.g. `https://your-resource.openai.azure.com`) or another OpenAI-compatible service. | _(unset)_      |
| `OPENAI_API_VERSION` | API version. **Required** when `OPENAI_BASE_URL` points at Azure OpenAI (e.g. `2024-12-01-preview`).                                | _(unset)_      |
| `OPENAI_API_STYLE`   | `openai` or `azure`. Overrides how the credential is sent, for OpenAI-compatible backends that need a custom `OPENAI_BASE_URL`.     | inferred       |
| `OPENAI_IMAGE_MODEL` | Image model used by the image app. On Azure OpenAI this is the image **deployment name**, which need not match the model id.        | `gpt-image-1`  |

When `OPENAI_BASE_URL` is set, the apps use Azure OpenAI conventions (`api-key` header, deployment-based URLs); otherwise they use the standard OpenAI conventions (`Authorization: Bearer`). Set `OPENAI_API_STYLE=openai` to use a custom endpoint with standard OpenAI conventions.

> **Model compatibility:** The chat reference app uses `OPENAI_MODEL`, defaulting to `gpt-5.4-nano`. On Azure OpenAI, make sure the deployment named in `OPENAI_MODEL` targets a chat-completions-compatible model, and set `OPENAI_IMAGE_MODEL` to your image deployment name — the image app otherwise requests the model id `gpt-image-1`, which Azure resolves as a deployment name.

Start the dev servers:

- Chat application (http://localhost:3003):

    ```powershell
    yarn workspace @promptions/promptions-chat dev
    ```

- Image generation application (http://localhost:3004):

    ```powershell
    yarn workspace @promptions/promptions-image dev
    ```

## Available Commands

### Root Level Commands

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `yarn build`          | Build all packages and applications              |
| `yarn typecheck`      | Run TypeScript type checking across all projects |
| `yarn clean`          | Clean all build artifacts                        |
| `yarn prettier:check` | Check code formatting                            |
| `yarn prettier:write` | Format code                                      |

### Individual Package Commands

Each package supports these commands:

| Command                                   | Description                          |
| ----------------------------------------- | ------------------------------------ |
| `yarn workspace <package-name> build`     | Build specific package               |
| `yarn workspace <package-name> typecheck` | Type check specific package          |
| `yarn workspace <package-name> clean`     | Clean build artifacts                |
| `yarn workspace <package-name> dev`       | Start development server (apps only) |
| `yarn workspace <package-name> preview`   | Preview production build (apps only) |

### Package Names

- `@promptions/promptions-chat`
- `@promptions/promptions-image`
- `@promptions/promptions-llm`
- `@promptions/promptions-ui`

## CONTRIBUTING

This project welcomes contributions and suggestions. For information about contributing to Promptions, please see our [CONTRIBUTING.md](CONTRIBUTING.md) guide, which includes current issues to be resolved and other forms of contributing.

## CONTACT

We welcome feedback and collaboration from our audience. If you have suggestions, questions, or observe unexpected/offensive behavior in our technology, please contact us at [promptionsgithub@service.microsoft.com](promptionsgithub@service.microsoft.com).

If the team receives reports of undesired behavior or identifies issues independently, we will update this repository with appropriate mitigations.

## TRADEMARKS

Microsoft, Windows, Microsoft Azure, and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.

Any use of third-party trademarks or logos are subject to those third-party's policies.

## PRIVACY & ETHICS

Privacy information can be found at https://go.microsoft.com/fwlink/?LinkId=521839
