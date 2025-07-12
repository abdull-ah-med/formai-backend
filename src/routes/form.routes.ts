import { Router } from "express";
import { generateForm, reviseForm, finalizeForm } from "../controllers/formController";
import verifyJWT from "../middleware/verifyJWT";
import { formGenerationLimiter, formRevisionLimiter } from "../middleware/rateLimiter";

const router = Router();

// All form routes are protected, so we apply the middleware to all routes in this file.
router.use(verifyJWT);

/**
 * @route POST /api/form/generate-form
 * @desc Generate a form schema from a text prompt.
 * @access Private
 */
router.post("/generate-form", formGenerationLimiter, generateForm);

/**
 * @route POST /api/form/revise-form/:formId
 * @desc Revise an existing form schema based on a new prompt.
 * @access Private
 */
router.post("/revise-form/:formId", formRevisionLimiter, reviseForm);

/**
 * @route POST /api/form/finalize-form/:formId
 * @desc Finalize a form, create it on Google Forms, and save to user history.
 * @access Private
 */
router.post("/finalize-form/:formId", finalizeForm);

export default router;
