import OpenAI, { AzureOpenAI } from "openai";

/**
 * The OpenAI SDK requires a non-empty key. The proxy replaces it with the real
 * credential, so this literal is all the browser ever sees.
 */
const PROXY_PLACEHOLDER_API_KEY = "injected-by-proxy";

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export class ChatService {
    private client: OpenAI;
    private model: string;

    constructor() {
        // The API key is never available to the browser. Requests go to the
        // same-origin proxy path, which injects the real credential
        // server-side (see @promptions/promptions-openai-proxy).
        const proxyUrl = `${window.location.origin}${import.meta.env.VITE_OPENAI_PROXY_PATH || "/api/openai"}`;
        const apiVersion = import.meta.env.VITE_OPENAI_API_VERSION;
        this.model = import.meta.env.VITE_OPENAI_MODEL || "gpt-5.4-nano";

        this.client =
            import.meta.env.VITE_OPENAI_PROXY_MODE === "azure"
                ? new AzureOpenAI({
                      endpoint: proxyUrl,
                      apiVersion,
                      apiKey: PROXY_PLACEHOLDER_API_KEY,
                      dangerouslyAllowBrowser: true,
                  })
                : new OpenAI({
                      baseURL: `${proxyUrl}/v1`,
                      apiKey: PROXY_PLACEHOLDER_API_KEY,
                      dangerouslyAllowBrowser: true,
                  });
    }

    async streamChat(
        messages: ChatMessage[],
        onContent: (content: string, done: boolean) => void,
        options?: { signal?: AbortSignal },
    ): Promise<void> {
        console.log(JSON.stringify(messages, null, 2));

        try {
            const stream = await this.client.chat.completions.create(
                {
                    model: this.model,
                    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                    stream: true,
                    max_completion_tokens: 1000,
                },
                {
                    signal: options?.signal,
                },
            );

            let accumulatedContent = "";

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content ?? "";
                accumulatedContent += content;
                onContent(accumulatedContent, false);
            }

            onContent(accumulatedContent, true);
        } catch (error) {
            console.error("Error in streamChat:", error);
            throw error;
        }
    }

    async sendMessage(messages: ChatMessage[]): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                max_completion_tokens: 1000,
            });

            return response.choices[0]?.message?.content || "No response received";
        } catch (error) {
            console.error("Error in sendMessage:", error);
            throw error;
        }
    }
}
