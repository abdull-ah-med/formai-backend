import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../models/user.model";
import dotenv from "dotenv";

dotenv.config(); // must come first

export const loginUser = async (req: Request, res: Response) => {
        const { email, password, rememberMe } = req.body;

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
                console.error("JWT_SECRET is undefined");
                return res
                        .status(500)
                        .json({ message: "Server misconfiguration" });
        }

        const token = jwt.sign(
                { sub: user._id, email: user.email, role: user.role },
                JWT_SECRET,
                {
                        expiresIn: rememberMe ? "30d" : "1d",
                        audience: "api:auth",
                        issuer: "auth-service",
                }
        );

        const cookie = [
                `token=${token}`,
                "HttpOnly",
                "Secure",
                "SameSite=None",
                "Path=/",
                rememberMe
                        ? `Max-Age=${30 * 24 * 60 * 60}`
                        : `Max-Age=${24 * 60 * 60}`,
        ]
                .filter(Boolean)
                .join("; ");

        res.setHeader("Set-Cookie", cookie);
        res.status(200).json({ success: true, message: "Login successful" });
};
