import { Router } from "express";
import { generateForm, reviseForm, finalizeForm } from "../controllers/formController";
import verifyJWT from "../middleware/verifyJWT";
import User from "../models/user.model";
import { AuthTokenPayload } from "../middleware/verifyJWT";
import { Request, Response } from "express";

const router = Router();
router.use(verifyJWT);

router.post("/generate-form", generateForm);
router.post("/revise-form/:formId", reviseForm);
router.post("/finalize-form/:formId", finalizeForm);
router.get("/forms/history", async (req: Request, res: Response) => {
        try {
                const userId = (req.user as AuthTokenPayload)?.sub;
                if (!userId) {
                        return res.status(401).json({
                                success: false,
                                error: "Authentication required",
                        });
                }

                const user = await User.findById(userId);
                if (!user) {
                        return res.status(404).json({
                                success: false,
                                error: "User not found",
                        });
                }

                // Map the user's form history to the expected format
                const formHistory = (user.formsHistory || []).map((form, index) => ({
                        id: index.toString(), // Use index as a fallback ID
                        formId: form.formId,
                        title: form.schema?.title || "Untitled Form",
                        createdAt: form.finalizedAt?.toISOString() || new Date().toISOString(),
                        schema: form.schema,
                }));

                return res.status(200).json({
                        success: true,
                        data: formHistory,
                });
        } catch (error: any) {
                console.error("Error fetching form history:", error);
                return res.status(500).json({
                        success: false,
                        error: "Failed to fetch form history",
                });
        }
});

export default router;
