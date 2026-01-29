import { Request, Response } from "express";
import User from "../../models/user.model";

export const getAccount = async (req: Request, res: Response) => {
        try {
                // The user ID is attached to the request by the auth middleware
                const userId = req.user?.sub;

                if (!userId) {
                        return res.status(401).json({
                                success: false,
                                message: "Not authenticated",
                        });
                }

                const user = await User.findById(userId).select("-password");

                if (!user) {
                        return res.status(404).json({
                                success: false,
                                message: "User not found",
                        });
                }

                return res.status(200).json({
                        success: true,
                        user: {
                                _id: user._id,
                                email: user.email,
                                fullName: user.fullName,
                                role: user.role,
                                googleId: user.googleId,
                                hasPassword: !!user.password,
                                hasApiKey: !!user.get('anthropicApiKey'),
                                createdAt: user.createdAt,
                                updatedAt: user.updatedAt,
                                isGoogleLinked: !!user.googleId,
                        },
                });
        } catch (error: any) {
                console.error("[getAccount] Error:", error.message);
                return res.status(500).json({
                        success: false,
                        message: "Server error while fetching account",
                });
        }
};
