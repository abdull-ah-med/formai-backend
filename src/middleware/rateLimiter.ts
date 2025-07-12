import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import FormModel from "../models/form.model";
import { AuthTokenPayload } from "./verifyJWT";

// General auth rate limiter
export const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // Limit each IP to 10 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message: "Too many requests from this IP, please try again after 15 minutes",
});

// Custom middleware to limit form generations to 3 per day per user
export const formGenerationLimiter = async (req: Request, res: Response, next: NextFunction) => {
        try {
                const userId = (req.user as AuthTokenPayload)?.sub;
                if (!userId) {
                        return res.status(401).json({ success: false, error: "Unauthorized" });
                }

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const count = await FormModel.countDocuments({
                        userId,
                        createdAt: { $gte: today },
                });

                if (count >= 3) {
                        return res.status(429).json({
                                success: false,
                                error: "Daily form generation limit reached (3/day). Please try again tomorrow.",
                        });
                }

                next();
        } catch (error) {
                console.error("Error in form generation rate limiter:", error);
                next(error);
        }
};

// Custom middleware to limit form revisions to 3 per form
export const formRevisionLimiter = async (req: Request, res: Response, next: NextFunction) => {
        try {
                const formId = req.params.formId;
                if (!formId) {
                        return res.status(400).json({ success: false, error: "Form ID is required" });
                }

                const form = await FormModel.findById(formId);
                if (!form) {
                        return res.status(404).json({ success: false, error: "Form not found" });
                }

                if (form.revisionCount >= 3) {
                        return res.status(429).json({
                                success: false,
                                error: "Form revision limit reached (3/form). Please create a new form.",
                        });
                }

                next();
        } catch (error) {
                console.error("Error in form revision rate limiter:", error);
                next(error);
        }
};
