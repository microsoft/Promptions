import OpenAI, { AzureOpenAI } from "openai";

interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export class ChatService {
    private client: OpenAI;
    private model: string;

    constructor() {
        // In a real application, you'd want to handle the API key more securely
        // For development, you can set VITE_OPENAI_API_KEY in your .env file
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY;

        if (!apiKey) {
            throw new Error(
                "OpenAI API key is required. Please set VITE_OPENAI_API_KEY in your environment variables.",
            );
        }

        const baseURL = import.meta.env.VITE_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;
        const apiVersion = import.meta.env.VITE_OPENAI_API_VERSION || process.env.OPENAI_API_VERSION;
        this.model = import.meta.env.VITE_OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1";

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
                    temperature: 0.7,
                    max_tokens: 1000,
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
                temperature: 0.7,
                max_tokens: 1000,
            });

            return response.choices[0]?.message?.content || "No response received";
        } catch (error) {
            console.error("Error in sendMessage:", error);
            throw error;
        }
    }
}
