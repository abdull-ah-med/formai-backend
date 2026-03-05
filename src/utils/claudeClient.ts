import axios from "axios";
import { CLAUDE_SYSTEM_PROMPT } from "../config/systemPrompt";

const CLAUDE_API_URL = "http://104.214.170.230:11434/api/generate";

// This interface should match the type expected in the system prompt
export interface FormField {
    label: string;
    type: string;
    required?: boolean;
    scale?: number;
    options?: Array<
        | string
        | {
              label?: string;
              text?: string;
              goTo: "NEXT_SECTION" | "SUBMIT_FORM" | string;
          }
    >;
}

export interface FormSection {
    title: string;
    description?: string;
    fields: FormField[];
}

export interface FormSchema {
    title: string;
    description: string;
    fields?: FormField[]; // For backward compatibility
    sections?: FormSection[];
}

export async function generateSchemaFromPrompt(prompt: string): Promise<FormSchema> {
    try {
        const response = await axios.post(
            CLAUDE_API_URL,
            {
                model: "qwen2.5:7b",
                system: CLAUDE_SYSTEM_PROMPT,
                prompt: prompt,
                stream: false,
            },
            {
                headers: {
                    "content-type": "application/json",
                },
                timeout: 120000,
            },
        );

        const content = response.data.response;
        // The response might be wrapped in ```json ... ```, so we need to extract it.
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;

        const schema = JSON.parse(jsonString) as FormSchema;

        // Ensure all new forms use the sections structure for consistency
        if (!schema.sections || schema.sections.length === 0) {
            schema.sections = [
                {
                    title: schema.title || "Main Section",
                    description: schema.description,
                    fields: schema.fields || [],
                },
            ];
            delete schema.fields; // Remove the old top-level fields
        }

        return schema;
    } catch (error) {
        throw new Error("Failed to generate form schema from Claude API.");
    }
}

export async function reviseSchemaWithPrompt(
    previousSchema: FormSchema,
    revisionPrompt: string,
): Promise<FormSchema> {
    const prompt = `
Here is the current form schema:
\`\`\`json
${JSON.stringify(previousSchema, null, 2)}
\`\`\`

The user wants to make the following changes to the form: "${revisionPrompt}"

Please apply these changes and return the new, complete JSON schema. Maintain the same structure (using sections if the original had sections, or fields if it used fields). Do not output any extra text, only the JSON object.
`;

    try {
        const response = await axios.post(
            CLAUDE_API_URL,
            {
                model: "qwen2.5:7b",
                system: CLAUDE_SYSTEM_PROMPT,
                prompt: prompt,
                stream: false,
            },
            {
                headers: {
                  
                    "content-type": "application/json",
                },
                timeout: 120000,
            },
        );

        const content = response.data.response;
        // The response might be wrapped in ```json ... ```, so we need to extract it.
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;

        const schema = JSON.parse(jsonString) as FormSchema;

        // Ensure revisions also use the sections structure
        if (!schema.sections || schema.sections.length === 0) {
            schema.sections = [
                {
                    title: schema.title || "Main Section",
                    description: schema.description,
                    fields: schema.fields || [],
                },
            ];
            delete schema.fields; // Remove the old top-level fields
        }

        return schema;
    } catch (error) {
        throw new Error("Failed to revise form schema with Claude API.");
    }
}
