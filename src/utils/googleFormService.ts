import { google, forms_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { formSchema, FormSchemaStrict } from "../schemas/formSchema";

/**
 * Map our strict field definition to a Google Forms Request
 */
function mapField(field: any, index: number): forms_v1.Schema$Request {
	const req: forms_v1.Schema$Request = {
		createItem: {
			location: { index },
			item: {
				title: field.label,
				questionItem: { question: { required: field.required === true } },
			} as any,
		},
	};
	const q = req.createItem!.item!.questionItem!.question!;
	switch (field.type) {
		case "text":
			q.textQuestion = {};
			break;
		case "textarea":
			q.textQuestion = { paragraph: true };
			break;
		case "email":
			q.textQuestion = {};
			break;
		case "number":
			q.textQuestion = {};
			break;
		case "tel":
			q.textQuestion = {};
			break;
		case "date":
			q.dateQuestion = {};
			break;
		case "time":
			q.timeQuestion = {};
			break;
		case "url":
			q.textQuestion = {};
			break;
		case "rating":
			q.scaleQuestion = { low: 1, high: field.scale || 5 };
			break;
		case "checkbox":
			q.choiceQuestion = {
				type: "CHECKBOX",
				options: (field.options as any[]).map((o) => ({
					value: typeof o === "string" ? o : o.label || o.text || "",
				})),
			};
			break;
		case "radio":
		case "select": {
			const options = (field.options as any[]).map((opt) => {
				if (typeof opt === "string") return { value: opt } as forms_v1.Schema$Option;
				const option: forms_v1.Schema$Option = { value: opt.label || opt.text || "" };
				if (opt.goTo === "NEXT_SECTION" || opt.goTo === "SUBMIT_FORM")
					option.goToAction = opt.goTo;
				else option.goToSectionId = opt.goTo;
				return option;
			});
			// ensure navigability invariant
			const anyNav = options.some((o) => "goToAction" in o || "goToSectionId" in o);
			const patched = anyNav
				? options.map((o) =>
						"goToAction" in o || "goToSectionId" in o
							? o
							: { ...o, goToAction: "NEXT_SECTION" }
				  )
				: options;
			q.choiceQuestion = {
				type: field.type === "radio" ? "RADIO" : "DROP_DOWN",
				options: patched,
			};
			break;
		}
		default:
			q.textQuestion = {};
	}
	return req;
}

export async function createGoogleForm(schemaInput: unknown, oauth2Client: OAuth2Client) {
	// 1) Validate strict schema
	const parsed = formSchema.parse(schemaInput) as FormSchemaStrict;

	const forms = google.forms({ version: "v1", auth: oauth2Client });

	// 2) create empty form
	const createResp = await forms.forms.create({
		requestBody: { info: { title: parsed.title, documentTitle: parsed.title } },
	});
	const formId = createResp.data.formId!;

	// 3) build initial requests
	const requests: forms_v1.Schema$Request[] = [
		{
			updateFormInfo: {
				info: { description: parsed.description },
				updateMask: "description",
			},
		},
	];

	let idx = 0;
	parsed.sections.forEach((sec, sIdx) => {
		if (sIdx > 0) {
			requests.push({
				createItem: {
					location: { index: idx++ },
					item: {
						title: sec.title,
						description: sec.description || "",
						pageBreakItem: {},
					} as any,
				},
			});
		}
		sec.fields.forEach((f: any) => {
			requests.push(mapField(f, idx++));
		});
	});

	// 4) apply batch
	const batchResp = await forms.forms.batchUpdate({ formId, requestBody: { requests } });

	// 5) fetch items to resolve ids
	const fetched = await forms.forms.get({ formId });
	const items = fetched.data.items || [];
	const sectionTitleToId = new Map<string, string>();
	items.forEach((it) => {
		if (it.pageBreakItem && it.itemId) sectionTitleToId.set(it.title || "", it.itemId);
	});

	// 6) prepare navigation patch
	const navReq: forms_v1.Schema$Request[] = [];
	items.forEach((it) => {
		if (!it.questionItem || !it.itemId) return;
		const originalField = findFieldByLabel(parsed, it.title || "");
		if (!originalField || !(originalField.type === "radio" || originalField.type === "select")) return;
		const updatedOptions = (originalField.options as any[]).map((opt) => {
			if (typeof opt === "string") return { value: opt } as forms_v1.Schema$Option;
			const base: forms_v1.Schema$Option = { value: opt.label || opt.text || "" };
			if (opt.goTo === "NEXT_SECTION" || opt.goTo === "SUBMIT_FORM") base.goToAction = opt.goTo;
			else if (opt.goTo) {
				const tid = sectionTitleToId.get(opt.goTo);
				if (tid) base.goToSectionId = tid;
			}
			return base;
		});
		navReq.push({
			updateItem: {
				location: { index: items.findIndex((x) => x.itemId === it.itemId) },
				item: {
					itemId: it.itemId,
					questionItem: { question: { choiceQuestion: { options: updatedOptions } } },
				} as any,
				updateMask: "questionItem.question.choiceQuestion.options",
			},
		});
	});
	if (navReq.length) await forms.forms.batchUpdate({ formId, requestBody: { requests: navReq } });

	// 7) responder URL
	const final = await forms.forms.get({ formId });
	return { formId, responderUri: final.data.responderUri };
}

function findFieldByLabel(parsed: FormSchemaStrict, label: string) {
	for (const sec of parsed.sections) {
		const f = sec.fields.find((fld: any) => fld.label === label);
		if (f) return f;
	}
	return undefined;
}
