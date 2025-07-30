import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../models/user.model";
import dotenv from "dotenv";
import { verifyRecaptcha } from "../../utils/recaptcha";

dotenv.config(); // must come first

export const loginUser = async (req: Request, res: Response) => {
        const { email, password, rememberMe, website: honeypot, recaptchaToken } = req.body;
if (honeypot && honeypot !== "") {
                return res.status(400).json({ message: "Bot detected (honeypot triggered)" });
        }

        const captchaValid = await verifyRecaptcha(recaptchaToken);
        if (!captchaValid) {
                return res.status(400).json({ message: "Failed CAPTCHA validation" });
        }

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password ?? ""))) {
                return res.status(401).json({ message: "Invalid credentials" });
        }

        // Enforce Google-only sign-in for linked accounts
        if (user.googleId) {
                return res.status(403).json({
                        message: "This account is linked with Google. Please sign in with Google.",
                });
        }

        user.lastLogin = new Date();
        await user.save();

        const JWT_SECRET = process.env.JWT_SECRET;
        if (!JWT_SECRET) {
                return res.status(500).json({ message: "Server misconfiguration" });
        }

        const token = jwt.sign({ sub: user._id, email: user.email, role: user.role }, JWT_SECRET, {
                expiresIn: rememberMe ? "30d" : "1d",
                audience: "api:auth",
                issuer: "auth-service",
        });

        // Set cookie with proper cross-domain settings for production
        res.cookie("token", token, {
                httpOnly: true,
                secure: true, // Always use secure for production
                sameSite: "none", // Required for cross-domain cookies
                path: "/",
                maxAge: rememberMe
                        ? 30 * 24 * 60 * 60 * 1000 // 30 days
                        : 24 * 60 * 60 * 1000, // 1 day
        });

        res.status(200).json({ success: true, message: "Login successful", token });
};
