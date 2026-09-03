import OpenAI, { AzureOpenAI } from "openai";
import { ImageGenerationParams, GeneratedImage } from "../types";

/**
 * The OpenAI SDK requires a non-empty key. The proxy replaces it with the real
 * credential, so this literal is all the browser ever sees.
 */
const PROXY_PLACEHOLDER_API_KEY = "injected-by-proxy";

export class ImageService {
    private client: OpenAI;
    private chatModel: string;
    private imageModel?: string;

    constructor() {
        // The API key is never available to the browser. Requests go to the
        // same-origin proxy path, which injects the real credential
        // server-side (see @promptions/promptions-openai-proxy).
        const proxyUrl = `${window.location.origin}${import.meta.env.VITE_OPENAI_PROXY_PATH || "/api/openai"}`;
        const apiVersion = import.meta.env.VITE_OPENAI_API_VERSION;
        this.chatModel = import.meta.env.VITE_OPENAI_MODEL || "gpt-5.4-nano";
        // Azure routes by deployment name, which need not match the model ID.
        this.imageModel = import.meta.env.VITE_OPENAI_IMAGE_MODEL || undefined;

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

    async generateImage(params: ImageGenerationParams, options?: { signal?: AbortSignal }): Promise<GeneratedImage[]> {
        try {
            console.log("Generating image with params:", params);

            const response = await this.client.images.generate(
                {
                    model: this.imageModel ?? params.kind,
                    prompt: params.prompt,
                    size: params.size,
                    quality: params.quality,
                    n: params.n || 1,
                },
                {
                    signal: options?.signal,
                },
            );

            const images: GeneratedImage[] = (response.data || []).map((image) => ({
                id: crypto.randomUUID(),
                base64String: image.b64_json!,
                prompt: params.prompt,
                revisedPrompt: image.revised_prompt,
                timestamp: new Date(),
            }));

            console.log("Generated images:", images);
            return images;
        } catch (error) {
            console.error("Error generating image:", error);
            throw error;
        }
    }

    async streamChat(
        messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
        onContent: (content: string, done: boolean) => void,
        options?: { signal?: AbortSignal },
    ): Promise<void> {
        try {
            const stream = await this.client.chat.completions.create(
                {
                    model: this.chatModel,
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
}
