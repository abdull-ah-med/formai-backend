// src/controllers/auth/googleCallBack.ts
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../../models/user.model";
import { OAuth2Client } from "google-auth-library";

const { JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL } =
        process.env;

if (!JWT_SECRET || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        throw new Error("Missing required OAuth environment variables");
}



export const googleCallback = async (req: Request, res: Response) => {
        try {
                const { code, state } = req.query as {
                        code?: string;
                        state?: string;
                };
                if (!code) {
                        return res
                                .status(400)
                                .json({ message: "Missing code" });
                }

                // Use environment variable for redirect URI
                const redirectUri =
                        process.env.GOOGLE_REDIRECT_URI ||
                        "http://localhost:4000/api/auth/google/callback";

                // Include clientSecret in production for secure exchanges
                const client = new OAuth2Client({
                        clientId: GOOGLE_CLIENT_ID,
                        clientSecret: GOOGLE_CLIENT_SECRET,
                        redirectUri,
                });

                // Exchange code for tokens, explicitly passing redirectUri
                const { tokens } = await client.getToken({
                        code,
                        redirect_uri: redirectUri,
                });

                // Verify the ID token
                const ticket = await client.verifyIdToken({
                        idToken: tokens.id_token!,
                        audience: GOOGLE_CLIENT_ID,
                });

                const payload = ticket.getPayload();
                if (!payload?.email) {
                        return res
                                .status(400)
                                .json({ message: "Invalid Google user" });
                }

                // Find or create user in your DB
                let user = await User.findOne({ email: payload.email });
                if (!user) {
                        user = await User.create({
                                fullName: payload.name || "Google User",
                                email: payload.email,
                                googleId: payload.sub,
                        });
                } else {
                        // Check if user already has a different Google ID linked
                        if (user.googleId && user.googleId !== payload.sub) {
                                return res
                                        .status(400)
                                        .send(
                                                "This account is already linked to a different Google account."
                                        );
                        }

                        // If no Google ID yet, link it
                        if (!user.googleId) user.googleId = payload.sub;
                        user.lastLogin = new Date();
                        await user.save();
                }

                // Sign your JWT
                const token = jwt.sign(
                        { sub: user._id, email: user.email, role: user.role },
                        JWT_SECRET,
                        {
                                expiresIn: "30d",
                                audience: "api:auth",
                                issuer: "auth-service",
                        }
                );

                // Set cookie with proper cross-domain settings for production
                res.cookie("token", token, {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === "production",
                        sameSite:
                                process.env.NODE_ENV === "production"
                                        ? "none"
                                        : "lax",
                        path: "/",
                        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
                });

                // Finally redirect back to your frontend app
                return res.redirect(
                        `${FRONTEND_URL || "http://localhost:5173"}/dashboard`
                );
        } catch (err) {
                console.error("Google OAuth callback error:", err);
                return res.status(500).send("OAuth callback failed");
        }
};
