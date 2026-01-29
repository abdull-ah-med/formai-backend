import { Request, Response } from "express";
import { generateSchemaFromPrompt, reviseSchemaWithPrompt, FormSchema } from "../utils/claudeClient";
import { createGoogleForm } from "../utils/googleFormService";
import FormModel from "../models/form.model";
import UserModel from "../models/user.model";
import { OAuth2Client } from "google-auth-library";
import { AuthTokenPayload } from "../middleware/verifyJWT";
import { convertClaudeSchemaToUserSchema } from "../utils/formSchemaConverter";

const isSameDay = (date1: Date, date2: Date) => {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
};

/**
 * Iterates over a raw schema from Claude and enriches it with a `conditions`
 * array on any section that is the target of a conditional `goTo` navigation.
 * This allows the front-end to display a "Conditional Section" banner.
 * This does not affect the final Google Form, only the dashboard preview.
 */
function enrichSchemaWithConditions(schema: FormSchema): FormSchema {
	if (!schema.sections) return schema;

	// Create a deep copy to avoid mutating the original object
	const newSchema = JSON.parse(JSON.stringify(schema));

	const sectionTitleMap = new Map<string, any>();
	newSchema.sections.forEach((section: any) => {
		sectionTitleMap.set(section.title, section);
	});

	newSchema.sections.forEach((section: any) => {
		section.fields.forEach((field: any) => {
			if ((field.type === "radio" || field.type === "select") && field.options) {
				field.options.forEach((option: any) => {
					// Check for a goTo that targets a specific section by title
					if (
						typeof option !== "string" &&
						option.goTo &&
						!["NEXT_SECTION", "SUBMIT_FORM"].includes(option.goTo)
					) {
						const targetSection = sectionTitleMap.get(option.goTo);
						if (targetSection) {
							if (!targetSection.conditions) {
								targetSection.conditions = [];
							}
							// Add the condition metadata for the front-end
							targetSection.conditions.push({
								fieldId: field.label,
								equals: option.label || option.text,
							});
						}
					}
				});
			}
		});
	});

	return newSchema;
}

export const generateForm = async (req: Request, res: Response) => {
	const { prompt } = req.body;
	const userId = (req.user as AuthTokenPayload)?.sub;

	if (!prompt) {
		return res.status(400).json({ success: false, error: "Prompt is required." });
	}

	try {
		const user = await UserModel.findById(userId);
		if (!user) {
			return res.status(404).json({ success: false, error: "User not found." });
		}

		// Check if user has an API key configured
		const userApiKey = user.get('anthropicApiKey');
		if (!userApiKey) {
			return res.status(400).json({
				success: false,
				error: "No Anthropic API key configured. Please add your API key in Account Settings to generate forms.",
			});
		}

		const today = new Date();
		const creationData = user.dailyFormCreations || {
			count: 0,
			date: today,
		};

		if (isSameDay(creationData.date, today)) {
			if (creationData.count >= 3) {
				return res.status(429).json({
					success: false,
					error: "Whoa, you're a form-making machine! Our AI needs to recharge its creative juices (and maybe take a nap). Please come back tomorrow for a fresh batch of forms.",
				});
			}
			creationData.count += 1;
		} else {
			// It's a new day, reset the counter
			creationData.count = 1;
			creationData.date = today;
		}

		user.dailyFormCreations = creationData;
		await user.save();

		const schemaFromClaude = await generateSchemaFromPrompt(prompt, userApiKey);

		// Add conditional metadata for the front-end before saving/sending
		const schema = enrichSchemaWithConditions(schemaFromClaude);

		// Create a new form document
		const newForm = new FormModel({
			userId,
			prompt,
			claudeResponse: schema,
			revisionCount: 0,
		});

		await newForm.save();

		res.json({
			success: true,
			data: {
				formId: newForm._id,
				schema,
			},
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Failed to generate form.",
		});
	}
};

export const reviseForm = async (req: Request, res: Response) => {
	const { prompt } = req.body;
	const { formId } = req.params;
	const userId = (req.user as AuthTokenPayload)?.sub;

	if (!prompt || !formId) {
		return res.status(400).json({
			success: false,
			error: "Prompt and form ID are required.",
		});
	}

	try {
		// Get the existing form
		const form = await FormModel.findById(formId);

		if (!form) {
			return res.status(404).json({
				success: false,
				error: "Form not found.",
			});
		}

		// Verify ownership
		if (form.userId.toString() !== userId) {
			return res.status(403).json({
				success: false,
				error: "Not authorized to modify this form.",
			});
		}

		// Get user's API key
		const user = await UserModel.findById(userId);
		const userApiKey = user?.get('anthropicApiKey');
		if (!userApiKey) {
			return res.status(400).json({
				success: false,
				error: "No Anthropic API key configured. Please add your API key in Account Settings.",
			});
		}

		// Get the latest schema (either the original or the last revision)
		const latestSchema =
			form.revisions.length > 0
				? form.revisions[form.revisions.length - 1].claudeResponse
				: form.claudeResponse;

		// Generate the revised schema
		const revisedSchemaFromClaude = await reviseSchemaWithPrompt(latestSchema, prompt, userApiKey);

		// Add conditional metadata for the front-end
		const revisedSchema = enrichSchemaWithConditions(revisedSchemaFromClaude);

		// Update the form with the new revision
		form.revisions.push({
			prompt,
			claudeResponse: revisedSchema,
			timestamp: new Date(),
		});

		form.revisionCount += 1;
		await form.save();

		res.json({
			success: true,
			data: {
				formId: form._id,
				schema: revisedSchema,
				revisionsRemaining: null, // Set to null since there's no limit
			},
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: "Failed to revise form.",
		});
	}
};

export const finalizeForm = async (req: Request, res: Response) => {
	const { formId } = req.params;
	const userId = (req.user as AuthTokenPayload)?.sub;

	if (!formId) {
		return res.status(400).json({ success: false, error: "Form ID is required." });
	}
	if (!userId) {
		return res.status(401).json({ success: false, error: "Unauthorized." });
	}

	try {
		// Get the form
		const form = await FormModel.findById(formId);
		if (!form) {
			return res.status(404).json({
				success: false,
				error: "Form not found.",
			});
		}

		// Verify ownership
		if (form.userId.toString() !== userId) {
			return res.status(403).json({
				success: false,
				error: "Not authorized to modify this form.",
			});
		}

		const user = await UserModel.findById(userId);
		if (!user) {
			return res.status(404).json({
				success: false,
				error: "User not found.",
			});
		}

		if (!user.googleTokens || !user.googleTokens.accessToken) {
			return res.status(403).json({
				success: false,
				error: "CONNECT_GOOGLE",
			});
		}
		const finalClaudeSchema =
			form.revisions.length > 0
				? form.revisions[form.revisions.length - 1].claudeResponse
				: form.claudeResponse;
		const finalUserSchema = convertClaudeSchemaToUserSchema(finalClaudeSchema);

		const oauth2Client = new OAuth2Client({
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
		});

		if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
			return res.status(500).json({
				success: false,
				error: "Server configuration error: Missing Google OAuth credentials",
			});
		}

		oauth2Client.setCredentials({
			access_token: user.googleTokens.accessToken,
			refresh_token: user.googleTokens.refreshToken,
			expiry_date: user.googleTokens.expiryDate,
		});
		if (
			user.googleTokens.expiryDate &&
			user.googleTokens.expiryDate <= Date.now() &&
			user.googleTokens.refreshToken
		) {
			try {
				const { credentials } = await oauth2Client.refreshAccessToken();

				// Update user's tokens in the database
				user.googleTokens = {
					accessToken: credentials.access_token!,
					refreshToken: credentials.refresh_token || user.googleTokens.refreshToken,
					expiryDate: credentials.expiry_date || Date.now() + 3600 * 1000,
				};

				await user.save();
				oauth2Client.setCredentials({
					access_token: credentials.access_token!,
					refresh_token: credentials.refresh_token || user.googleTokens.refreshToken,
					expiry_date: credentials.expiry_date,
				});
			} catch (refreshError: any) {
				return res.status(403).json({
					success: false,
					error: "GOOGLE_TOKEN_EXPIRED",
					message: "Your Google authorization has expired. Please reconnect your Google account.",
				});
			}
		}

		try {
			const googleForm = await createGoogleForm(finalClaudeSchema, oauth2Client);

			// Update the form with Google Form details
			form.googleFormUrl = googleForm.responderUri ?? undefined;
			await form.save();

			// Add to user's form history
			if (!user.formsHistory) user.formsHistory = [];
			user.formsHistory.push({
				schema: finalUserSchema,
				formId: googleForm.formId,
				responderUri: googleForm.responderUri ?? undefined,
				finalizedAt: new Date(),
			});
			await user.save();

			res.json({
				success: true,
				data: {
					formId: form._id,
					googleFormUrl: googleForm.responderUri,
					schema: finalClaudeSchema,
				},
			});
		} catch (googleError: any) {
			console.error("[finalizeForm] Google error", googleError.message, googleError);
			// Check for specific Google API errors
			if (googleError.message && googleError.message.includes("Permission denied")) {
				return res.status(403).json({
					success: false,
					error: "GOOGLE_PERMISSION_DENIED",
					message: "You don't have permission to create Google Forms. Please check your Google account permissions.",
				});
			} else if (googleError.message && googleError.message.includes("Authentication failed")) {
				return res.status(403).json({
					success: false,
					error: "GOOGLE_TOKEN_EXPIRED",
					message: "Your Google authentication has expired. Please reconnect your Google account.",
				});
			} else if (googleError.message && googleError.message.includes("Invalid form schema")) {
				return res.status(400).json({
					success: false,
					error: "INVALID_FORM_SCHEMA",
					message: googleError.message,
				});
			}

			// Generic error
			return res.status(500).json({
				success: false,
				error: "GOOGLE_FORM_ERROR",
				message: googleError.message || "Failed to create Google Form.",
			});
		}
	} catch (error) {
		const e = error as any;
		if (e.response?.data?.error === "invalid_grant" || (e.message && e.message.includes("invalid_grant"))) {
			return res.status(403).json({
				success: false,
				error: "GOOGLE_TOKEN_EXPIRED",
				message: "Your Google authorization has expired. Please reconnect your Google account.",
			});
		}
		res.status(500).json({
			success: false,
			error: "SERVER_ERROR",
			message: "Failed to finalize form. Please try again later.",
		});
	}
};
