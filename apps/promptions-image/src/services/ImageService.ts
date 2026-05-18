import OpenAI, { AzureOpenAI } from "openai";
import { ImageGenerationParams, GeneratedImage } from "../types";

export class ImageService {
    private client: OpenAI;
    private chatModel: string;

    constructor() {
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error(
                "OpenAI API key is required. Please set VITE_OPENAI_API_KEY in your environment variables.",
            );
        }

        const baseURL = import.meta.env.VITE_OPENAI_BASE_URL;
        const apiVersion = import.meta.env.VITE_OPENAI_API_VERSION;
        this.chatModel = import.meta.env.VITE_OPENAI_MODEL || "gpt-5.4-nano";

        this.client = baseURL
            ? new AzureOpenAI({
                  apiKey,
                  endpoint: baseURL,
                  apiVersion,
                  dangerouslyAllowBrowser: true, // Only for demo purposes - use a backend in production
              })
            : new OpenAI({
                  apiKey,
                  dangerouslyAllowBrowser: true, // Only for demo purposes - use a backend in production
              });
    }

    async generateImage(params: ImageGenerationParams, options?: { signal?: AbortSignal }): Promise<GeneratedImage[]> {
        try {
            console.log("Generating image with params:", params);

            const response = await this.client.images.generate(
                {
                    model: params.kind,
                    prompt: params.prompt,
                    size: params.size,
                    quality: params.quality,
                    n: params.n || 1,
                    response_format: "b64_json",
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
