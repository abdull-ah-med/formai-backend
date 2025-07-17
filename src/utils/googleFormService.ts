import { google, forms_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { FormSchema, FormField } from "./claudeClient";
import { validateFormSchemaStrict } from "../schemas/formSchema";

// Local type override to include optional conditions array (used for dashboard metadata)
interface SectionWithConditions {
	title: string;
	description?: string;
	fields: FormField[];
	conditions?: Array<{ fieldId: string; equals?: string; notEquals?: string }>;
}

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
			console.debug("[mapField] RADIO", field.label, field.options);
			let options = (field.options?.map((opt) => {
				if (typeof opt === "string") {
					return { value: opt } as forms_v1.Schema$Option;
				} else {
					const optionObj: forms_v1.Schema$Option = {
						value: opt.label || opt.text || "",
					} as forms_v1.Schema$Option;
					const goTarget =
						(opt as any).goTo ??
						(opt as any).goToAction ??
						(opt as any).goToSectionId;
					if (goTarget) {
						if (goTarget === "NEXT_SECTION" || goTarget === "SUBMIT_FORM") {
							optionObj.goToAction = goTarget;
						} else {
							optionObj.goToSectionId = goTarget;
						}
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
			console.debug("[mapField] RADIO options after nav patch", options);

			request.createItem!.item!.questionItem!.question!.choiceQuestion = {
				type: "RADIO",
				options,
			};
			break;
		}
		case "select": {
			console.debug("[mapField] SELECT", field.label, field.options);
			let options = (field.options?.map((opt) => {
				if (typeof opt === "string") {
					return { value: opt } as forms_v1.Schema$Option;
				} else {
					const optionObj: forms_v1.Schema$Option = {
						value: opt.label || opt.text || "",
					};
					const legacyAction = (opt as any).goToAction;
					if (legacyAction) optionObj.goToAction = legacyAction;
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
			console.debug("[mapField] SELECT options after nav patch", options);

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
	return validateFormSchemaStrict(schema as unknown);
}

// DEBUG helper – checks that conditional sections are reachable via goTo navigation
function validateBranchingNavigation(schema: FormSchema) {
	if (!schema.sections) return; // nothing to do

	const errors: string[] = [];

	// Build a quick lookup of questions and their option navigation
	type NavInfo = { fieldLabel: string; optionValue: string; hasNav: boolean };
	const navInfos: NavInfo[] = [];

	const collectFromField = (field: FormField) => {
		if (field.type === "radio" || field.type === "select") {
			(field.options || []).forEach((opt) => {
				const optObj = typeof opt === "string" ? { value: opt } : opt;
				navInfos.push({
					fieldLabel: field.label,
					optionValue:
						(optObj as any).label ||
						(optObj as any).text ||
						(optObj as any).value ||
						"",
					hasNav: Boolean(
						(optObj as any).goToAction ||
							(optObj as any).goToSectionId ||
							(optObj as any).goTo
					),
				});
			});
		}
	};

	// gather all fields
	if (schema.sections) {
		(schema.sections as SectionWithConditions[]).forEach((section) =>
			section.fields.forEach(collectFromField)
		);
	}
	if (schema.fields) {
		schema.fields.forEach(collectFromField);
	}

	// Validate each conditional section
	(schema.sections as SectionWithConditions[]).forEach((section) => {
		if (section.conditions && section.conditions.length) {
			(section.conditions as any[]).forEach((cond) => {
				const related = navInfos.filter((n) => n.fieldLabel === cond.fieldId);
				if (!related.length || !related.some((r) => r.hasNav)) {
					errors.push(
						`Section "${section.title}" claims condition on field "${cond.fieldId}" but no option navigation found.`
					);
				}
			});
		}
	});

	console.debug("[branch-check] navInfos", navInfos);
	console.debug(
		"[branch-check] section conditions",
		(schema.sections || []).map((s) => ({ title: s.title, conditions: (s as any).conditions }))
	);

	if (errors.length) {
		console.error("[branch-check] UNSATISFIED", errors);
		throw new Error("Branching validation error: " + errors.join(" | "));
	}

	console.info("[branching-validator] All conditional sections have corresponding navigation.");
}

// Google Forms item IDs must contain only letters, numbers, or underscores and start with a letter.
function slugify(text: string): string {
	const cleaned = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_") // replace non-alphanumerics with underscore
		.replace(/_+/g, "_") // collapse multiple underscores
		.replace(/^_+|_+$/g, ""); // trim leading/trailing underscores
	// Ensure the ID starts with a letter as required by the API; prepend "s_" if it doesn’t.
	return /^[a-z]/.test(cleaned) ? cleaned : `s_${cleaned}`;
}

// Mutates schema in-place: for each conditional section, ensure the referenced question options include a goToSectionId to that section.
function ensureNavigationForConditions(schema: FormSchema) {
	if (!schema.sections) return;
	const canon = (txt: string) =>
		txt
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "_")
			.replace(/_+/g, "_")
			.replace(/^_+|_+$/g, "");
	// Build quick label→field look-up (only radio/select) across all sections so far
	const labelToField = new Map<string, FormField>();
	for (const section of schema.sections) {
		for (const field of section.fields) {
			if (field.type === "radio" || field.type === "select") {
				labelToField.set(field.label, field);
			}
		}
	}
	// Build canonical lookup for tolerant matching
	const canonToField = new Map<string, FormField>();
	labelToField.forEach((f, lbl) => canonToField.set(canon(lbl), f));
	// Iterate again to apply navigation based on conditions
	for (const section of schema.sections as SectionWithConditions[]) {
		if (!section.conditions?.length) continue;
		for (const cond of section.conditions) {
			const targetSectionTitle = section.title;
			const field = canonToField.get(canon(cond.fieldId));
			if (!field || !field.options) continue;
			// Find matching options (if equals specified) else add to first option
			let modified = false;
			field.options = (field.options as any[]).map((opt: any, idx: number) => {
				if (typeof opt === "string") return opt; // skip string style
				const value = opt.label || opt.text || "";
				const shouldAdd = cond.equals ? value === cond.equals : idx === 0;
				if (shouldAdd) {
					modified = true;
					return { ...opt, goTo: targetSectionTitle } as any;
				}
				return opt;
			});
			// If nothing matched (maybe equals not found), attach nav to first option.
			if (!modified && Array.isArray(field.options) && field.options.length) {
				const first = field.options[0];
				if (typeof first !== "string") {
					field.options[0] = { ...first, goTo: targetSectionTitle } as any;
				}
			}
		}
	}
}

// Normalise older option keys (goToAction / goToSectionId) and fill defaults so strict Zod schema passes.
function normalizeLegacyOptions(schema: any) {
	const patchField = (field: any) => {
		if (!(field.type === "radio" || field.type === "select")) return;
		if (!Array.isArray(field.options)) return;
		let anyGo = false;
		field.options = field.options.map((opt: any) => {
			if (typeof opt === "string") return opt; // leave strings
			if (opt.goTo) {
				anyGo = true;
				return opt;
			}
			if (opt.goToAction) {
				anyGo = true;
				return { ...opt, goTo: opt.goToAction };
			}
			if (opt.goToSectionId) {
				anyGo = true;
				return { ...opt, goTo: opt.goToSectionId };
			}
			return opt; // keep for now
		});
		// If some options had navigation ensure all have.
		if (anyGo) {
			field.options = field.options.map((opt: any) => {
				if (typeof opt === "string") return opt;
				if (!opt.goTo) {
					return { ...opt, goTo: "NEXT_SECTION" };
				}
				return opt;
			});
		}
	};
	if (schema.sections) {
		schema.sections.forEach((sec: any) => sec.fields.forEach(patchField));
	}
}

async function applyConditionalNavigation(
	formsClient: ReturnType<typeof google.forms>,
	formId: string,
	schema: FormSchema
) {
	// Fetch the freshly-created form to discover real itemIds
	const formResp = await formsClient.forms.get({ formId });
	const items = formResp.data.items || [];

	// Build index map for location requirement
	const itemIdToIndex = new Map<string, number>();
	items.forEach((it, idx) => {
		if (it.itemId) itemIdToIndex.set(it.itemId, idx);
	});

	// Build look-up tables
	const sectionTitleToId = new Map<string, string>();
	const questionLabelToId = new Map<string, string>();

	items.forEach((it) => {
		if (!it.itemId) return;
		if (it.pageBreakItem) {
			sectionTitleToId.set(it.title || "", it.itemId);
		} else if (it.questionItem) {
			questionLabelToId.set(it.title || "", it.itemId);
		}
	});

	const navRequests: forms_v1.Schema$Request[] = [];

	const processField = (field: FormField) => {
		if (!(field.type === "radio" || field.type === "select")) return;
		if (!field.options || !field.options.length) return;
		// Do any options reference a section title?
		const needsNav = field.options.some(
			(opt) => typeof opt !== "string" && ((opt as any).goTo || (opt as any).goToSectionId)
		);
		if (!needsNav) return;

		const questionItemId = questionLabelToId.get(field.label);
		if (!questionItemId) return; // Cannot locate question

		// Re-build options array with concrete goToSectionId values
		let updatedOptions: forms_v1.Schema$Option[] = field.options.map((opt) => {
			if (typeof opt === "string") {
				return { value: opt } as forms_v1.Schema$Option;
			}

			const optionObj: forms_v1.Schema$Option = {
				value: opt.label || opt.text || "",
			};
			const legacyAction = (opt as any).goToAction;
			if (legacyAction) optionObj.goToAction = legacyAction;
			if ((opt as any).goTo) {
				const targetTitle = (opt as any).goTo;
				const targetId = sectionTitleToId.get(targetTitle);
				if (targetId) {
					optionObj.goToSectionId = targetId;
				}
			} else if ((opt as any).goToSectionId) {
				const targetTitle = (opt as any).goToSectionId;
				const targetId = sectionTitleToId.get(targetTitle);
				if (targetId) {
					optionObj.goToSectionId = targetId;
				}
			}
			return optionObj;
		});

		// Google API requirement: if any option has navigation, all must.
		const navPresent = updatedOptions.some((o) => "goToAction" in o || "goToSectionId" in o);
		if (navPresent) {
			updatedOptions = updatedOptions.map((o) => {
				if (!("goToAction" in o) && !("goToSectionId" in o)) {
					return { ...o, goToAction: "NEXT_SECTION" } as forms_v1.Schema$Option;
				}
				return o;
			});
		}

		const locationIndex = itemIdToIndex.get(questionItemId);
		if (locationIndex === undefined) return;

		navRequests.push({
			updateItem: {
				item: {
					itemId: questionItemId,
					questionItem: {
						question: {
							choiceQuestion: {
								options: updatedOptions,
							},
						},
					},
				} as any,
				location: { index: locationIndex },
				updateMask: "questionItem.question.choiceQuestion.options",
			},
		});
	};

	if (schema.sections && schema.sections.length) {
		schema.sections.forEach((sec) => sec.fields.forEach(processField));
	} else if (schema.fields) {
		schema.fields.forEach(processField);
	}

	console.debug(
		"[nav] built navRequests",
		navRequests.map((r) => ({
			loc: (r.updateItem as any)?.location?.index,
			questionId: (r.updateItem as any)?.item?.itemId,
		}))
	);
	if (navRequests.length) {
		await formsClient.forms.batchUpdate({
			formId,
			requestBody: { requests: navRequests },
		});
	}
}

export async function createGoogleForm(
	schema: FormSchema,
	oauth2Client: OAuth2Client
): Promise<{ formId: string; responderUri: string }> {
	console.info("[createGoogleForm] start", {
		title: schema.title,
		sections: schema.sections?.length,
		fields: schema.fields?.length,
	});
	console.debug("[createGoogleForm] raw schema", JSON.stringify(schema, null, 2));
	// Legacy normalisation & auto-injection before strict validation
	normalizeLegacyOptions(schema);
	ensureNavigationForConditions(schema);
	// Validate the schema first
	const validation = validateFormSchema(schema);
	if (!validation.valid) {
		throw new Error(`Invalid form schema: ${validation.error}`);
	}
	validateBranchingNavigation(schema);

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

		if (schema.sections && schema.sections.length > 0) {
			let currentIndex = 0;

			// Add each section and its fields, always creating a SectionHeaderItem first
			schema.sections.forEach((section) => {
				requests.push({
					createItem: {
						item: {
							title: section.title,
							description: section.description || "",
							pageBreakItem: {},
						} as any,
						location: { index: currentIndex++ },
					},
				});
				console.debug("[build] adding section header", {
					sectionTitle: section.title,
					atIndex: currentIndex - 1,
				});

				// Add fields for this section
				section.fields.forEach((field) => {
					requests.push(mapFieldToGoogleFormsRequest(field, currentIndex++));
					console.debug("[build] adding field", {
						fieldLabel: field.label,
						index: currentIndex - 1,
						type: field.type,
					});
				});
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
			console.info("[createGoogleForm] initial structure applied", {
				totalRequests: requests.length,
			});
		}

		// 4. Apply conditional navigation
		await applyConditionalNavigation(forms, formId, schema);
		console.info("[createGoogleForm] applying conditional navigation now");

		// 5. Get the form details to return the responder URI
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
