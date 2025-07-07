import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// This would ideally be loaded from the file mentioned in the prompt.
const FORMAI_CLAUDE_SYSTEM_PROMPT = `
You are an expert in creating web forms. A user will provide a prompt, and you will generate a JSON schema representing a form.
The JSON schema must follow this exact TypeScript interface:
interface Option {
  id: string; // Unique identifier for the option
  text: string; // Display text for the option
}
interface Question {
  id: string; // Unique identifier for the question
  type: 'short_answer' | 'dropdown';
  label: string; // The question text
  options?: Option[]; // Only for 'dropdown' type
}
interface FormSchema {
  title: string;
  description: string;
  questions: Question[];
}
When generating IDs, use short, unique, random strings.
Do not output anything other than the single, valid JSON object.
`;

interface FormSchema {
        title: string;
        description: string;
        questions: {
                id: string;
                type: "short_answer" | "dropdown";
                label: string;
                options?: {
                        id: string;
                        text: string;
                }[];
        }[];
}

export async function generateSchemaFromPrompt(
        prompt: string
): Promise<FormSchema> {
        if (!CLAUDE_API_KEY) {
                throw new Error(
                        "CLAUDE_API_KEY is not set in environment variables."
                );
        }
        try {
                const response = await axios.post(
                        CLAUDE_API_URL,
                        {
                                model: "claude-3-5-sonnet-20240620",
                                max_tokens: 4096,
                                system: FORMAI_CLAUDE_SYSTEM_PROMPT,
                                messages: [{ role: "user", content: prompt }],
                        },
                        {
                                headers: {
                                        "x-api-key": CLAUDE_API_KEY,
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
                throw new Error(
                        "Failed to generate form schema from Claude API."
                );
        }
}

export async function editSchemaWithInstruction(
        schema: FormSchema,
        instruction: string
): Promise<FormSchema> {
        if (!CLAUDE_API_KEY) {
                throw new Error(
                        "CLAUDE_API_KEY is not set in environment variables."
                );
        }
        const prompt = `
Here is the current form schema:
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

The user wants to make the following change: "${instruction}"

Please apply this change and return the new, complete JSON schema. Do not output any extra text, only the JSON object.
`;

        try {
                const response = await axios.post(
                        CLAUDE_API_URL,
                        {
                                model: "claude-3-5-sonnet-20240620",
                                max_tokens: 4096,
                                system: FORMAI_CLAUDE_SYSTEM_PROMPT,
                                messages: [{ role: "user", content: prompt }],
                        },
                        {
                                headers: {
                                        "x-api-key": CLAUDE_API_KEY,
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
                console.error("Error calling Claude API during edit:", error);
                throw new Error("Failed to edit form schema with Claude API.");
        }
}
