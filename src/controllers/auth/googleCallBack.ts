import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../../models/user.model";
import { OAuth2Client } from "google-auth-library";

const { JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL } = process.env;

if (!JWT_SECRET || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !FRONTEND_URL) {
	throw new Error("Missing required OAuth environment variables");
}

export const googleCallback = async (req: Request, res: Response) => {
	try {
		const { code, state } = req.query as {
			code?: string;
			state?: string;
		};
		if (!code) {
			return res.status(400).json({
				success: false,
				error: "Missing authorization code",
				message: "No authorization code was provided in the callback",
			});
		}
		const redirectUri = `${(FRONTEND_URL || "").replace(/\/$/, "")}/auth/google/callback`;

		const client = new OAuth2Client({
			clientId: GOOGLE_CLIENT_ID,
			clientSecret: GOOGLE_CLIENT_SECRET,
			redirectUri,
		});
		let tokens;
		try {
			const response = await client.getToken({
				code,
				redirect_uri: redirectUri,
			});
			tokens = response.tokens;
		} catch (tokenError: any) {
			return res.status(400).json({
				success: false,
				error: "Token exchange failed",
				message: tokenError.message || "Failed to exchange authorization code for tokens",
				details: tokenError.response?.data,
			});
		}

		if (!tokens.access_token) {
			return res.status(400).json({
				success: false,
				error: "No access token received",
				message: "Failed to obtain access token from Google",
			});
		}
		const hasRefreshToken = !!tokens.refresh_token;
		let ticket;
		try {
			ticket = await client.verifyIdToken({
				idToken: tokens.id_token!,
				audience: GOOGLE_CLIENT_ID,
			});
		} catch (verifyError: any) {
			return res.status(400).json({
				success: false,
				error: "ID token verification failed",
				message: verifyError.message || "Failed to verify ID token",
			});
		}

		const payload = ticket.getPayload();
		if (!payload?.email) {
			return res.status(400).json({
				success: false,
				error: "Invalid Google user",
				message: "Could not retrieve email from Google account",
			});
		}

		// If user is logged in (has JWT), link to their account
		// If not logged in, find by email or create new user
		let user;
		
		// Check if there's a userId in the state parameter (for account linking)
		let userIdFromState = null;
		console.log(`Google callback received state parameter: ${state}`);
		if (state) {
			try {
				const stateData = JSON.parse(state);
				userIdFromState = stateData.userId;
				console.log(`Extracted userId from state: ${userIdFromState}`);
			} catch (e) {
				// Invalid state parameter, ignore
				console.error(`Failed to parse state parameter: ${e}`);
			}
		}
		
		if (userIdFromState) {
			// User wants to link Google to their existing account
			user = await User.findById(userIdFromState);
			
			// If userId was provided but user not found, this is an error
			if (!user) {
				console.error(`User linking failed: User with ID ${userIdFromState} not found`);
				return res.status(400).json({
					success: false,
					error: "User not found",
					message: "The account you're trying to link to could not be found. Please try signing in again.",
				});
			}
			
			console.log(`Linking Google account to existing user: ${user.email} (ID: ${user._id})`);
		} else {
			// Not logged in - find by email or create new
			user = await User.findOne({ email: payload.email });
			console.log(`No userId in state, looking up by email: ${payload.email}, found: ${user ? 'yes' : 'no'}`);
		}

		// Prevent a Google account from being linked to multiple user accounts
		const existingGoogleUser = await User.findOne({ googleId: payload.sub });
		if (
			existingGoogleUser &&
			(
				!user ||
				String(existingGoogleUser._id) !== String(user._id)
			)
		) {
			return res.status(400).json({
				success: false,
				error: "Google account already linked",
				message: "This Google account is already linked to another user.",
			});
		}

		if (!user) {
			try {
				user = await User.create({
					fullName: payload.name || "Google User",
					email: payload.email,
					googleId: payload.sub,
					googleTokens: {
						accessToken: tokens.access_token!,
						refreshToken: tokens.refresh_token || undefined,
						expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
					},
				});
			} catch (createError: any) {
				return res.status(500).json({
					success: false,
					error: "User creation failed",
					message: createError.message || "Failed to create new user account",
				});
			}
		} else {
			if (user.googleId && user.googleId !== payload.sub) {
				return res.status(400).json({
					success: false,
					error: "Account conflict",
					message: "This account is already linked to a different Google account.",
				});
			}

			// If no Google ID yet, link it
			if (!user.googleId) user.googleId = payload.sub;

			// Always update the Google tokens – overwrite with the freshest values returned by Google
			user.googleTokens = {
				accessToken: tokens.access_token!,
				refreshToken:
					tokens.refresh_token ||
					(user.googleTokens ? user.googleTokens.refreshToken : undefined),
				expiryDate: tokens.expiry_date || Date.now() + 3600 * 1000,
			};

			// Ensure Mongoose detects nested object changes
			user.markModified("googleTokens");

			// Remove existing password hash to disable email/password login once Google is linked
			if (user.password) {
				user.password = undefined as any;
			}
			user.markModified("password");

			user.lastLogin = new Date();

			try {
				await user.save();
			} catch (saveError: any) {
				return res.status(500).json({
					success: false,
					error: "User update failed",
					message: saveError.message || "Failed to update user account",
				});
			}
		}
		let token;
		try {
			token = jwt.sign({ sub: user._id, email: user.email, role: user.role }, JWT_SECRET, {
				expiresIn: "30d",
				audience: "api:auth",
				issuer: "auth-service",
			});
		} catch (jwtError: any) {
			return res.status(500).json({
				success: false,
				error: "JWT creation failed",
				message: jwtError.message || "Failed to create authentication token",
			});
		}
		res.cookie("token", token, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
			path: "/",
			maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
		});
		return res.status(200).json({
			success: true,
			message: "Login successful",
			token,
			hasFormsScope: true, // We requested the forms scope in the OAuth URL
			hasRefreshToken,
		});
	} catch (err: any) {
		return res.status(500).json({
			success: false,
			error: "OAuth callback failed",
			message: err.message || "An error occurred during Google authentication",
			details: process.env.NODE_ENV !== "production" ? err.toString() : undefined,
		});
	}
};
