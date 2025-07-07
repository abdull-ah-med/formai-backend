import { Router } from "express";
import {
        generateForm,
        editForm,
        finalizeForm,
} from "../controllers/formController";
import verifyJWT from "../middleware/verifyJWT";

const router = Router();

// All form routes are protected, so we apply the middleware to all routes in this file.
router.use(verifyJWT);

/**
 * @route POST /api/form/generate
 * @desc Generate a form schema from a text prompt.
 * @access Private
 */
router.post("/generate", generateForm);

/**
 * @route POST /api/form/edit
 * @desc Edit an existing form schema based on an instruction.
 * @access Private
 */
router.post("/edit", editForm);

/**
 * @route POST /api/form/finalize
 * @desc Finalize a form, create it on Google Forms, and save to user history.
 * @access Private
 */
router.post("/finalize", finalizeForm);

export default router;
