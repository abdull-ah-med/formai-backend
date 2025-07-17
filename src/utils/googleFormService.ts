import { google, forms_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { FormSchema, FormField, FormSection } from "./claudeClient";

function mapFieldToGoogleFormsRequest(field: FormField, index: number): forms_v1.Schema$Request {
	const request: forms_v1.Schema$Request = {
		createItem: {
			item: {
				title: field.label,
				questionItem: {
					question: {
						required: field.required === true,
						// Type-specific question fields are set below
					},
				},
			},
			location: { index },
		},
	};

	// Set the specific question type
	switch (field.type) {
		case "text":
			request.createItem!.item!.questionItem!.question!.textQuestion = {};
			break;
		case "textarea":
			request.createItem!.item!.questionItem!.question!.textQuestion = {
				paragraph: true,
			};
			break;
		case "email":
			request.createItem!.item!.questionItem!.question!.textQuestion = {};
			break;
		case "number":
			request.createItem!.item!.questionItem!.question!.textQuestion = {};
			break;
		case "tel":
			request.createItem!.item!.questionItem!.question!.textQuestion = {};
			break;
		case "date":
			request.createItem!.item!.questionItem!.question!.dateQuestion = {};
			break;
		case "time":
			request.createItem!.item!.questionItem!.question!.timeQuestion = {};
			break;
		case "url":
			request.createItem!.item!.questionItem!.question!.textQuestion = {};
			break;
		case "checkbox":
			request.createItem!.item!.questionItem!.question!.choiceQuestion = {
				type: "CHECKBOX",
				options: [{ value: "Yes" }],
			};
			break;
		case "radio": {
			let options = (field.options?.map((opt) => {
				if (typeof opt === "string") {
					return { value: opt } as forms_v1.Schema$Option;
				} else {
					const optionObj: forms_v1.Schema$Option = {
						value: opt.label || opt.text || "",
					} as forms_v1.Schema$Option;
					if (opt.goToAction) {
						optionObj.goToAction = opt.goToAction;
					}
					if ((opt as any).goToSectionId) {
						optionObj.goToSectionId = (opt as any).goToSectionId;
					}
					return optionObj;
				}
			}) || [{ value: "Option 1" }]) as forms_v1.Schema$Option[];

			// If any option has navigation, ensure all options have a goToAction to satisfy API.
			const anyNav = options.some((o) => "goToAction" in o || "goToSectionId" in o);
			if (anyNav) {
				options = options.map((o) => {
					if (!("goToAction" in o) && !("goToSectionId" in o)) {
						return { ...o, goToAction: "NEXT_SECTION" };
					}
					return o;
				});
			}

			request.createItem!.item!.questionItem!.question!.choiceQuestion = {
				type: "RADIO",
				options,
			};
			break;
		}
		case "select": {
			let options = (field.options?.map((opt) => {
				if (typeof opt === "string") {
					return { value: opt } as forms_v1.Schema$Option;
				} else {
					const optionObj: forms_v1.Schema$Option = {
						value: opt.label || opt.text || "",
					};
					if (opt.goToAction) {
						optionObj.goToAction = opt.goToAction;
					}
					if ((opt as any).goToSectionId) {
						optionObj.goToSectionId = (opt as any).goToSectionId;
					}
					return optionObj;
				}
			}) || [{ value: "Option 1" }]) as forms_v1.Schema$Option[];

			const anyNav = options.some((o) => "goToAction" in o || "goToSectionId" in o);
			if (anyNav) {
				options = options.map((o) => {
					if (!("goToAction" in o) && !("goToSectionId" in o)) {
						return { ...o, goToAction: "NEXT_SECTION" };
					}
					return o;
				});
			}

			request.createItem!.item!.questionItem!.question!.choiceQuestion = {
				type: "DROP_DOWN",
				options,
			};
			break;
		}
		case "rating":
			request.createItem!.item!.questionItem!.question!.scaleQuestion = {
				low: 1,
				high: field.scale || 5,
			};
			break;
		default:
			request.createItem!.item!.questionItem!.question!.textQuestion = {};
			break;
	}

	return request;
}

// Helper function to validate the form schema
function validateFormSchema(schema: FormSchema): { valid: boolean; error?: string } {
	try {
		// Check for required top-level fields
		if (!schema.title) {
			return { valid: false, error: "Form schema is missing title" };
		}
		if (!schema.description) {
			return { valid: false, error: "Form schema is missing description" };
		}

		// Check that either sections or fields exist
		if (!schema.sections?.length && !schema.fields?.length) {
			return { valid: false, error: "Form schema must have either sections or fields" };
		}

		// If using sections, validate each section
		if (schema.sections?.length) {
			for (const section of schema.sections) {
				if (!section.title) {
					return { valid: false, error: "Section is missing title" };
				}
				if (!section.fields || !Array.isArray(section.fields) || section.fields.length === 0) {
					return { valid: false, error: `Section "${section.title}" has no fields` };
				}

				// Validate each field in the section
				for (const field of section.fields) {
					if (!field.label) {
						return { valid: false, error: "Field is missing label" };
					}
					if (!field.type) {
						return {
							valid: false,
							error: `Field "${field.label}" is missing type`,
						};
					}
				}
			}
		}

		// If using fields directly, validate each field
		if (schema.fields?.length) {
			for (const field of schema.fields) {
				if (!field.label) {
					return { valid: false, error: "Field is missing label" };
				}
				if (!field.type) {
					return { valid: false, error: `Field "${field.label}" is missing type` };
				}
			}
		}

		return { valid: true };
	} catch (error) {
		return { valid: false, error: `Schema validation error: ${(error as Error).message}` };
	}
}

export async function createGoogleForm(
	schema: FormSchema,
	oauth2Client: OAuth2Client
): Promise<{ formId: string; responderUri: string }> {
	// Validate the schema first
	const validation = validateFormSchema(schema);
	if (!validation.valid) {
		throw new Error(`Invalid form schema: ${validation.error}`);
	}

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
		];

		// Handle sections if they exist, otherwise use fields
		if (schema.sections && schema.sections.length > 0) {
			let currentIndex = 0;

			// Add each section and its fields
			schema.sections.forEach((section, sectionIndex) => {
				// Add section title and description as a text item
				requests.push({
					createItem: {
						item: {
							title: section.title,
							description: section.description || "",
							textItem: {},
						},
						location: { index: currentIndex++ },
					},
				});

				// Add fields for this section
				section.fields.forEach((field) => {
					requests.push(mapFieldToGoogleFormsRequest(field, currentIndex++));
				});

				// Add page break after each section except the last one
				if (sectionIndex < schema.sections!.length - 1) {
					requests.push({
						createItem: {
							item: {
								pageBreakItem: {},
							},
							location: { index: currentIndex++ },
						},
					});
				}
			});
		} else if (schema.fields) {
			// Fallback to the old fields array for backward compatibility
			schema.fields.forEach((field, index) => {
				requests.push(mapFieldToGoogleFormsRequest(field, index));
			});
		}

		// 3. Apply the batch update
		if (requests.length > 0) {
			await forms.forms.batchUpdate({
				formId,
				requestBody: {
					requests,
				},
			});
		}

		// 4. Get the form details to return the responder URI
		const form = await forms.forms.get({ formId });
		const responderUri = form.data.responderUri || "";

		return { formId, responderUri };
	} catch (error: any) {
		if (error.response) {
			const status = error.response.status;
			const errorDetails = error.response.data?.error || {};
			if (status === 403) {
				throw new Error(
					"Permission denied: You don't have permission to create Google Forms. Please check your Google account permissions."
				);
			} else if (status === 401) {
				throw new Error(
					"Authentication failed: Your Google authentication has expired or is invalid. Please reconnect your Google account."
				);
			} else {
				throw new Error(
					`Google Forms API error (${status}): ${errorDetails.message || "Unknown error"}`
				);
			}
		}

		throw new Error(`Failed to create Google Form: ${error.message || "Unknown error"}`);
	}
}
