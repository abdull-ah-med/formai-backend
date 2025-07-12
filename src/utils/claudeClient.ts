import axios from "axios";
import dotenv from "dotenv";
import { CLAUDE_SYSTEM_PROMPT } from "../config/systemPrompt";

dotenv.config();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// This interface should match the type expected in the system prompt
export interface FormField {
        label: string;
        type: string;
        required?: boolean;
        scale?: number;
        options?: Array<string | { text?: string; label?: string }>;
}

export interface FormSchema {
        title: string;
        description: string;
        fields: FormField[];
}

export async function generateSchemaFromPrompt(prompt: string): Promise<FormSchema> {
        if (!ANTHROPIC_API_KEY) {
                throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");
        }
        try {
                const response = await axios.post(
                        CLAUDE_API_URL,
                        {
                                model: "claude-3-5-sonnet-20241022",
                                max_tokens: 4096,
                                system: CLAUDE_SYSTEM_PROMPT,
                                messages: [{ role: "user", content: prompt }],
                        },
                        {
                                headers: {
                                        "x-api-key": ANTHROPIC_API_KEY,
                                        "anthropic-version": "2023-06-01",
                                        "content-type": "application/json",
                                },
                        }
                );

                const content = response.data.content[0].text;
                // The response might be wrapped in ```json ... ```, so we need to extract it.
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
                const jsonString = jsonMatch ? jsonMatch[1] : content;

                return JSON.parse(jsonString);
        } catch (error) {
                console.error("Error calling Claude API:", error);
                throw new Error("Failed to generate form schema from Claude API.");
        }
}

export async function reviseSchemaWithPrompt(previousSchema: FormSchema, revisionPrompt: string): Promise<FormSchema> {
        if (!ANTHROPIC_API_KEY) {
                throw new Error("ANTHROPIC_API_KEY is not set in environment variables.");
        }
        const prompt = `
Here is the current form schema:
\`\`\`json
${JSON.stringify(previousSchema, null, 2)}
\`\`\`

The user wants to make the following changes to the form: "${revisionPrompt}"

Please apply these changes and return the new, complete JSON schema. Do not output any extra text, only the JSON object.
`;

        try {
                const response = await axios.post(
                        CLAUDE_API_URL,
                        {
                                model: "claude-3-5-sonnet-20241022",
                                max_tokens: 4096,
                                system: CLAUDE_SYSTEM_PROMPT,
                                messages: [{ role: "user", content: prompt }],
                        },
                        {
                                headers: {
                                        "x-api-key": ANTHROPIC_API_KEY,
                                        "anthropic-version": "2023-06-01",
                                        "content-type": "application/json",
                                },
                        }
                );

                const content = response.data.content[0].text;
                // The response might be wrapped in ```json ... ```, so we need to extract it.
                const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
                const jsonString = jsonMatch ? jsonMatch[1] : content;

                return JSON.parse(jsonString);
        } catch (error) {
                console.error("Error calling Claude API during revision:", error);
                throw new Error("Failed to revise form schema with Claude API.");
        }
}
