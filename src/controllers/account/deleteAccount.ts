import { Request, Response } from "express";
import User from "../../models/user.model";
import Form from "../../models/form.model";
import Submission from "../../models/submission.model";

export const deleteAccount = async (req: Request, res: Response) => {
        try {
                const userId = req.user?.sub;

                if (!userId) {
                        return res.status(401).json({
                                success: false,
                                message: "Not authenticated",
                        });
                }

                // Find the user to ensure they exist
                const user = await User.findById(userId);
                if (!user) {
                        return res.status(404).json({
                                success: false,
                                message: "User not found",
                        });
                }

                // 1. Find all forms created by this user
                const userForms = await Form.find({ userId: userId });
                const formIds = userForms.map((form) => form._id);

                // 2. Delete all submissions associated with these forms
                if (formIds.length > 0) {
                        await Submission.deleteMany({ formId: { $in: formIds } });
                }

                // 3. Delete all forms created by this user
                await Form.deleteMany({ userId: userId });

                // 4. Delete the user account
                await User.findByIdAndDelete(userId);

                // Clear the JWT cookie
                res.clearCookie("jwt", {
                        httpOnly: true,
                        secure: process.env.NODE_ENV === "production",
                        sameSite: "strict",
                });

                return res.status(200).json({
                        success: true,
                        message: "Account and all associated data deleted successfully",
                });
        } catch (error: any) {
                console.error("[deleteAccount] Error:", error.message);
                return res.status(500).json({
                        success: false,
                        message: "Server error while deleting account",
                });
        }
};
