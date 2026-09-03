// State type for reactive state management
export type State<T> = { get: T; set: (fn: (prev: T) => void) => void };

// Image generation parameters
export interface BaseImageGenerationParams {
    prompt: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    quality?: "high" | "medium" | "low" | "auto";
    n?: number;
}

// GPT Image 1 parameters
export interface GPTImage1Params {
    kind: "gpt-image-1";
    prompt: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
    quality?: "high" | "medium" | "low" | "auto";
    n?: number;
}

// Image generation parameters
export type ImageGenerationParams = GPTImage1Params;

// Generated image result
export interface GeneratedImage {
    id: string;
    base64String: string;
    prompt: string;
    revisedPrompt?: string;
    timestamp: Date;
}

// Options elaboration parameters
export interface OptionsParams {
    prompt: string;
}

// Generation status
export type GenerationStatus = "idle" | "elaborating" | "generating" | "completed" | "error";

// Error type
export interface GenerationError {
    message: string;
    code?: string;
}
