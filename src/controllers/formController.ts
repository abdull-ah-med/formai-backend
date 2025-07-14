import { Request, Response } from "express";
import { generateSchemaFromPrompt, reviseSchemaWithPrompt, FormSchema } from "../utils/claudeClient";
import { createGoogleForm } from "../utils/googleFormService";
import FormModel from "../models/form.model";
import UserModel from "../models/user.model";
import { OAuth2Client } from "google-auth-library";
import { AuthTokenPayload } from "../middleware/verifyJWT";
import { convertClaudeSchemaToUserSchema } from "../utils/formSchemaConverter";

export const generateForm = async (req: Request, res: Response) => {
        const { prompt } = req.body;
        const userId = (req.user as AuthTokenPayload)?.sub;

        if (!prompt) {
                return res.status(400).json({ success: false, error: "Prompt is required." });
        }

        try {
                const schema = await generateSchemaFromPrompt(prompt);

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
                console.error(error);
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

                // Get the latest schema (either the original or the last revision)
                const latestSchema =
                        form.revisions.length > 0
                                ? form.revisions[form.revisions.length - 1].claudeResponse
                                : form.claudeResponse;

                // Generate the revised schema
                const revisedSchema = await reviseSchemaWithPrompt(latestSchema, prompt);

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
                console.error(error);
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

                // Get the final schema (either the original or the last revision)
                const finalClaudeSchema =
                        form.revisions.length > 0
                                ? form.revisions[form.revisions.length - 1].claudeResponse
                                : form.claudeResponse;

                // Convert Claude schema to user schema format for storage
                const finalUserSchema = convertClaudeSchemaToUserSchema(finalClaudeSchema);

                // Log the schema for debugging
                console.log("Final schema for form creation:", JSON.stringify(finalClaudeSchema));

                const oauth2Client = new OAuth2Client({
                        clientId: process.env.GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                });

                if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
                        console.error("Missing Google OAuth credentials in environment variables");
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

                // Check if token is expired and refresh if needed
                if (
                        user.googleTokens.expiryDate &&
                        user.googleTokens.expiryDate <= Date.now() &&
                        user.googleTokens.refreshToken
                ) {
                        try {
                                console.log("Refreshing expired Google token");
                                const { credentials } = await oauth2Client.refreshAccessToken();

                                // Update user's tokens in the database
                                user.googleTokens = {
                                        accessToken: credentials.access_token!,
                                        refreshToken: credentials.refresh_token || user.googleTokens.refreshToken,
                                        expiryDate: credentials.expiry_date || Date.now() + 3600 * 1000,
                                };

                                await user.save();
                                console.log("Token refreshed successfully");

                                // Update the credentials in the oauth2Client
                                oauth2Client.setCredentials({
                                        access_token: credentials.access_token!,
                                        refresh_token: credentials.refresh_token || user.googleTokens.refreshToken,
                                        expiry_date: credentials.expiry_date,
                                });
                        } catch (refreshError: any) {
                                console.error("Failed to refresh Google token:", refreshError);

                                // Log detailed error information
                                if (refreshError.response) {
                                        console.error("Refresh error details:", refreshError.response.data);
                                }

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
                        form.googleFormUrl = googleForm.responderUri;
                        await form.save();

                        // Add to user's form history
                        if (!user.formsHistory) user.formsHistory = [];
                        user.formsHistory.push({
                                schema: finalUserSchema,
                                formId: googleForm.formId,
                                responderUri: googleForm.responderUri,
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
                        console.error("Google Form creation error:", googleError);

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
                console.error("Form finalization error:", e);

                // Check if token is expired - Google API returns errors in a specific format
                if (e.response?.data?.error === "invalid_grant" || (e.message && e.message.includes("invalid_grant"))) {
                        return res.status(403).json({
                                success: false,
                                error: "GOOGLE_TOKEN_EXPIRED",
                                message: "Your Google authorization has expired. Please reconnect your Google account.",
                        });
                }

                // Log the full error for debugging
                if (e.response) {
                        console.error("Error response data:", e.response.data);
                }

                res.status(500).json({
                        success: false,
                        error: "SERVER_ERROR",
                        message: "Failed to finalize form. Please try again later.",
                });
        }
};
