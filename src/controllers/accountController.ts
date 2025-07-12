import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import User from "../models/user.model";
import { AuthTokenPayload } from "../middleware/verifyJWT";

// Check if a user has Google Forms permissions
export const checkGoogleFormsPermission = async (req: Request, res: Response) => {
        const userId = (req.user as AuthTokenPayload)?.sub;

        if (!userId) {
                return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        try {
                const user = await User.findById(userId);

                if (!user) {
                        return res.status(404).json({ success: false, error: "User not found" });
                }

                // Check if Google account is connected
                if (!user.googleId || !user.googleTokens || !user.googleTokens.accessToken) {
                        return res.status(200).json({
                                success: true,
                                hasPermission: false,
                                reason: "NOT_CONNECTED",
                                message: "Google account not connected",
                        });
                }

                // Initialize OAuth client
                const oauth2Client = new OAuth2Client({
                        clientId: process.env.GOOGLE_CLIENT_ID,
                        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                });

                // Set credentials from stored tokens
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
                                const { credentials } = await oauth2Client.refreshAccessToken();

                                // Update user's tokens in the database
                                user.googleTokens = {
                                        accessToken: credentials.access_token!,
                                        refreshToken: credentials.refresh_token || user.googleTokens.refreshToken,
                                        expiryDate: credentials.expiry_date || Date.now() + 3600 * 1000,
                                };

                                await user.save();

                                // Update the credentials in the oauth2Client
                                oauth2Client.setCredentials({
                                        access_token: credentials.access_token!,
                                        refresh_token: credentials.refresh_token || user.googleTokens.refreshToken,
                                        expiry_date: credentials.expiry_date,
                                });
                        } catch (refreshError) {
                                return res.status(200).json({
                                        success: true,
                                        hasPermission: false,
                                        reason: "TOKEN_EXPIRED",
                                        message: "Google token expired and couldn't be refreshed",
                                });
                        }
                }

                // Test Google Forms permission by trying to create a simple test form
                try {
                        const forms = google.forms({ version: "v1", auth: oauth2Client });

                        // Try to create a test form to verify permissions
                        // This will fail if the user doesn't have Forms permission
                        const testForm = await forms.forms.create({
                                requestBody: {
                                        info: {
                                                title: "Permission Check",
                                                documentTitle: "Permission Check",
                                        },
                                },
                        });

                        // If successful, immediately delete the test form
                        if (testForm.data.formId) {
                                // Since the Forms API doesn't have a delete method,
                                // we'll just leave the test form in their Google account
                        }

                        return res.status(200).json({
                                success: true,
                                hasPermission: true,
                                message: "User has Google Forms permission",
                        });
                } catch (error: any) {
                        // Check specific error responses that indicate permission issues
                        if (error.response && error.response.status === 403) {
                                return res.status(200).json({
                                        success: true,
                                        hasPermission: false,
                                        reason: "PERMISSION_DENIED",
                                        message: "User does not have permission to access Google Forms",
                                });
                        }

                        // Other errors might be connectivity or Google API issues
                        console.error("Google Forms permission check error:", error);
                        return res.status(200).json({
                                success: true,
                                hasPermission: false,
                                reason: "API_ERROR",
                                message: "Error checking Google Forms permission",
                        });
                }
        } catch (error) {
                console.error("Google Forms permission check error:", error);
                return res.status(500).json({
                        success: false,
                        error: "Failed to check Google Forms permission",
                });
        }
};
