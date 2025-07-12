import { google, forms_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { FormSchema, FormField } from "./claudeClient";

function mapFieldToGoogleFormsRequest(field: FormField, index: number): forms_v1.Schema$Request {
        switch (field.type) {
                case "text":
                        return {
                                createItem: {
                                        item: {
                                                title: field.label,
                                                questionItem: {
                                                        question: {
                                                                textQuestion: {},
                                                        },
                                                },
                                        },
                                        location: { index },
                                },
                        };
                case "textarea":
                        return {
                                createItem: {
                                        item: {
                                                title: field.label,
                                                questionItem: {
                                                        question: {
                                                                textQuestion: {
                                                                        paragraph: true,
                                                                },
                                                        },
                                                },
                                        },
                                        location: { index },
                                },
                        };
                case "rating":
                        return {
                                createItem: {
                                        item: {
                                                title: field.label,
                                                questionItem: {
                                                        question: {
                                                                scaleQuestion: {
                                                                        low: 1,
                                                                        high: field.scale || 5,
                                                                },
                                                        },
                                                },
                                        },
                                        location: { index },
                                },
                        };
                case "dropdown":
                case "radio":
                        return {
                                createItem: {
                                        item: {
                                                title: field.label,
                                                questionItem: {
                                                        question: {
                                                                choiceQuestion: {
                                                                        type:
                                                                                field.type === "dropdown"
                                                                                        ? "DROP_DOWN"
                                                                                        : "RADIO",
                                                                        options:
                                                                                field.options?.map((opt) => ({
                                                                                        value:
                                                                                                typeof opt === "string"
                                                                                                        ? opt
                                                                                                        : opt.text ||
                                                                                                          opt.label ||
                                                                                                          "",
                                                                                })) || [],
                                                                },
                                                        },
                                                },
                                        },
                                        location: { index },
                                },
                        };
                case "checkbox":
                        return {
                                createItem: {
                                        item: {
                                                title: field.label,
                                                questionItem: {
                                                        question: {
                                                                choiceQuestion: {
                                                                        type: "CHECKBOX",
                                                                        options:
                                                                                field.options?.map((opt) => ({
                                                                                        value:
                                                                                                typeof opt === "string"
                                                                                                        ? opt
                                                                                                        : opt.text ||
                                                                                                          opt.label ||
                                                                                                          "",
                                                                                })) || [],
                                                                },
                                                        },
                                                },
                                        },
                                        location: { index },
                                },
                        };
                default:
                        // Default to text input for unrecognized types
                        return {
                                createItem: {
                                        item: {
                                                title: field.label,
                                                questionItem: {
                                                        question: {
                                                                textQuestion: {},
                                                        },
                                                },
                                        },
                                        location: { index },
                                },
                        };
        }
}

export async function createGoogleForm(
        schema: FormSchema,
        oauth2Client: OAuth2Client
): Promise<{ formId: string; responderUri: string }> {
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
                        throw new Error("Failed to create form, no formId returned.");
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
                        // Add fields
                        ...schema.fields.map(mapFieldToGoogleFormsRequest),
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

                return {
                        formId: formId,
                        responderUri: createResponse.data.responderUri || "",
                };
        } catch (error) {
                console.error("Error creating Google Form:", error);
                throw new Error("Failed to create Google Form.");
        }
}
