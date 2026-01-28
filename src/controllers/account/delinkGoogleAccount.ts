import { Request, Response } from "express";
import User from "../../models/user.model";

export const delinkGoogleAccount = async (req: Request, res: Response) => {
        const userId = req.user?.sub;

        try {
                const user = await User.findById(userId);

                if (!user) {
                        return res.status(404).json({ success: false, message: "User not found" });
                }

                if (!user.googleId) {
                        return res.status(400).json({ success: false, message: "Account is not linked to Google." });
                }

                if (!user.password) {
                        return res.status(400).json({
                                success: false,
                                message: "Cannot delink a Google-only account. Please set a password first.",
                        });
                }

                user.googleId = undefined;
                user.googleTokens = undefined;
                await user.save();

                return res.status(200).json({ success: true, message: "Google account delinked successfully." });
        } catch (error: any) {
                console.error("[delinkGoogleAccount] Error:", error.message);
                return res.status(500).json({
                        success: false,
                        message: "Server error while delinking Google account.",
                });
        }
};
