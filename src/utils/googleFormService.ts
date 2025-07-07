import { google, forms_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Re-defining for clarity, though it could be imported from a types file
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

function mapSchemaToGoogleFormsRequest(
        question: FormSchema["questions"][0],
        index: number
): forms_v1.Schema$Request {
        if (question.type === "short_answer") {
                return {
                        createItem: {
                                item: {
                                        title: question.label,
                                        questionItem: {
                                                question: {
                                                        textQuestion: {},
                                                },
                                        },
                                },
                                location: { index },
                        },
                };
        } else if (question.type === "dropdown") {
                return {
                        createItem: {
                                item: {
                                        title: question.label,
                                        questionItem: {
                                                question: {
                                                        choiceQuestion: {
                                                                type: "RADIO", // 'RADIO' is used for dropdowns in the API
                                                                options:
                                                                        question.options?.map(
                                                                                (
                                                                                        opt
                                                                                ) => ({
                                                                                        value: opt.text,
                                                                                })
                                                                        ) || [],
                                                        },
                                                },
                                        },
                                },
                                location: { index },
                        },
                };
        }
        // This part should ideally not be reached if schema is validated
        throw new Error(`Unknown question type: ${question.type}`);
}

export async function createGoogleForm(
        schema: FormSchema,
        oauth2Client: OAuth2Client
): Promise<forms_v1.Schema$Form> {
        const forms = google.forms({
                version: "v1",
                auth: oauth2Client,
        });

        try {
                // 1. Create the form with title and description
                const createResponse = await forms.forms.create({
                        requestBody: {
                                info: {
                                        title: schema.title,
                                        documentTitle: schema.title,
                                },
                        },
                });

                const formId = createResponse.data.formId;
                if (!formId) {
                        throw new Error(
                                "Failed to create form, no formId returned."
                        );
                }

                // 2. Prepare batch update to add questions and description
                const requests: forms_v1.Schema$Request[] = [
                        // Add description
                        {
                                updateFormInfo: {
                                        info: {
                                                description: schema.description,
                                        },
                                        updateMask: "description",
                                },
                        },
                        // Add questions
                        ...schema.questions.map(mapSchemaToGoogleFormsRequest),
                ];

                // 3. Apply the batch update
                if (requests.length > 0) {
                        await forms.forms.batchUpdate({
                                formId,
                                requestBody: {
                                        requests,
                                },
                        });
                }

                // The batchUpdate doesn't return the full form object with the updates.
                // We can get it to confirm, but the createResponse data is usually sufficient.
                // For this use case, we'll return the initial creation response data, which includes formId and responderUri
                return createResponse.data;
        } catch (error) {
                console.error("Error creating Google Form:", error);
                throw new Error("Failed to create Google Form.");
        }
}
