import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../../models/user.model";
import { verifyRecaptcha } from "../../utils/recaptcha";

export const registerUser = async (req: Request, res: Response) => {
        const {
                fullName,
                email,
                password,
                website: honeypot,
                recaptchaToken,
        } = req.body;

        // ------------------------------------------------------------------
        // Honeypot check
        // ------------------------------------------------------------------
        if (honeypot && honeypot !== "") {
                return res
                        .status(400)
                        .json({ message: "Bot detected (honeypot triggered)" });
        }

        // ------------------------------------------------------------------
        // CAPTCHA
        // ------------------------------------------------------------------
        const captchaValid = await verifyRecaptcha(recaptchaToken);
        if (!captchaValid) {
                return res
                        .status(400)
                        .json({ message: "Failed CAPTCHA validation" });
        }

        const SALT_ROUNDS = 10;
        if (!fullName || !email || !password) {
                return res
                        .status(400)
                        .json({ message: "All fields are required." });
        }

        if (await User.findOne({ email: new RegExp(`^${email}$`, "i") })) {
                return res
                        .status(409)
                        .json({ message: "Email already registered." });
        }

        const hashed = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await User.create({
                fullName: fullName.trim(),
                email: email.toLowerCase().trim(),
                password: hashed,
        });

        res.status(201).json({
                success: true,
                message: "User registered",
                userId: user._id,
        });
};
