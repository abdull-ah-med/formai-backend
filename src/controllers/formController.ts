import { Request, Response } from "express";
import {
        generateSchemaFromPrompt,
        editSchemaWithInstruction,
} from "../utils/claudeClient";
import { createGoogleForm } from "../utils/googleFormService";
import UserModel from "../models/user.model";
import { google } from "googleapis";
import { AuthTokenPayload } from "../middleware/verifyJWT";

// A type guard for custom user property on Express Request - This is not needed if verifyJWT is used correctly.
// interface RequestWithUser extends Request {
//     user?: { id: string }; // Assuming verifyJWT adds this
// }

export const generateForm = async (req: Request, res: Response) => {
        const { prompt } = req.body;
        if (!prompt) {
                return res
                        .status(400)
                        .json({ success: false, error: "Prompt is required." });
        }

        try {
                const schema = await generateSchemaFromPrompt(prompt);
                res.json({ success: true, data: { schema } });
        } catch (error) {
                console.error(error);
                res.status(500).json({
                        success: false,
                        error: "Failed to generate form.",
                });
        }
};

export const editForm = async (req: Request, res: Response) => {
        const { schema, instruction } = req.body;
        if (!schema || !instruction) {
                return res.status(400).json({
                        success: false,
                        error: "Schema and instruction are required.",
                });
        }

        try {
                const updatedSchema = await editSchemaWithInstruction(
                        schema,
                        instruction
                );
                res.json({ success: true, data: { schema: updatedSchema } });
        } catch (error) {
                console.error(error);
                res.status(500).json({
                        success: false,
                        error: "Failed to edit form.",
                });
        }
};

export const finalizeForm = async (req: Request, res: Response) => {
        const { schema } = req.body;
        const userId = (req.user as AuthTokenPayload)?.sub;

        if (!schema) {
                return res
                        .status(400)
                        .json({ success: false, error: "Schema is required." });
        }
        if (!userId) {
                return res
                        .status(401)
                        .json({ success: false, error: "Unauthorized." });
        }

        try {
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

                const oauth2Client = new google.auth.OAuth2();
                oauth2Client.setCredentials({
                        access_token: user.googleTokens.accessToken,
                        refresh_token: user.googleTokens.refreshToken,
                        expiry_date: user.googleTokens.expiryDate,
                });

                const googleForm = await createGoogleForm(schema, oauth2Client);

                if (!googleForm.formId || !googleForm.responderUri) {
                        throw new Error(
                                "Form creation succeeded but response is missing ID or URI."
                        );
                }

                const newFormHistory = {
                        schema,
                        formId: googleForm.formId,
                        responderUri: googleForm.responderUri,
                        finalizedAt: new Date(),
                };

                user.formsHistory.push(newFormHistory);
                await user.save();

                res.json({
                        success: true,
                        data: {
                                schema: schema,
                                formId: googleForm.formId,
                                responderUri: googleForm.responderUri,
                        },
                });
        } catch (error) {
                const e = error as any;
                console.error(e);
                // Check if token is expired - Google API returns errors in a specific format
                if (
                        e.response?.data?.error === "invalid_grant" ||
                        e.message.includes("invalid_grant")
                ) {
                        return res.status(403).json({
                                success: false,
                                error: "GOOGLE_TOKEN_EXPIRED",
                        });
                }
                res.status(500).json({
                        success: false,
                        error: "Failed to finalize form.",
                });
        }
};
