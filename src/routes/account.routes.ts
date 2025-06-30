import { Router } from "express";
import verifyJWT, { AuthTokenPayload } from "../middleware/verifyJWT";
import User from "../models/user.model";
import bcrypt from "bcrypt";

const router = Router();

/**
 * GET /api/account
 * Returns the currently authenticated user's public profile data.
 * Requires a valid JWT (handled by verifyJWT).
 */
router.get("/account", verifyJWT, async (req, res) => {
        try {
                const payload = req.user as AuthTokenPayload | undefined;
                if (!payload?.sub) {
                        return res.status(401).json({ error: "Unauthorized" });
                }

                // Pull fresh data from DB so revoked users can't still use an old token
                const user = await User.findById(payload.sub).select(
                        "_id email role fullName googleId"
                );

                if (!user) {
                        return res
                                .status(404)
                                .json({ error: "User not found" });
                }

                res.json({
                        user: {
                                id: user._id,
                                email: user.email,
                                role: user.role,
                                fullName: user.fullName,
                                googleId: user.googleId,
                        },
                });
        } catch (error) {
                console.error("/account error", error);
                res.status(500).json({ error: "Internal server error" });
        }
});

/**
 * PUT /api/account-password
 * Updates the user's password after verifying current password.
 * Rejects requests for Google-linked accounts.
 */
router.put("/account-password", verifyJWT, async (req, res) => {
        try {
                const payload = req.user as AuthTokenPayload | undefined;
                if (!payload?.sub) {
                        return res.status(401).json({ error: "Unauthorized" });
                }

                const { currentPassword, newPassword } = req.body;
                if (!currentPassword || !newPassword) {
                        return res.status(400).json({
                                message: "Current and new passwords are required",
                        });
                }

                // Find the user
                const user = await User.findById(payload.sub);
                if (!user) {
                        return res
                                .status(404)
                                .json({ message: "User not found" });
                }

                // Reject password changes for Google-linked accounts
                if (user.googleId) {
                        return res.status(403).json({
                                message: "Google-linked accounts cannot change passwords",
                        });
                }

                // Verify current password
                const isMatch = await bcrypt.compare(
                        currentPassword,
                        user.password || ""
                );
                if (!isMatch) {
                        return res.status(400).json({
                                message: "Current password is incorrect",
                        });
                }

                // Password strength validation
                const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
                if (!strongPassword.test(newPassword)) {
                        return res.status(400).json({
                                message: "Password must be 8+ chars with upper, lower and number",
                        });
                }

                // Hash and update password
                const salt = await bcrypt.genSalt(10);
                user.password = await bcrypt.hash(newPassword, salt);
                await user.save();

                res.json({ message: "Password updated successfully" });
        } catch (error) {
                console.error("/account-password error", error);
                res.status(500).json({ message: "Internal server error" });
        }
});

export default router;
