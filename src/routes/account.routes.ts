import express from "express";
import { getAccount, delinkGoogleAccount } from "../controllers/account/";
import verifyJWT from "../middleware/verifyJWT";

const router = express.Router();

// Get the current user's account
router.get("/", verifyJWT, getAccount);

router.delete("/google-link", verifyJWT, delinkGoogleAccount);

export default router;
