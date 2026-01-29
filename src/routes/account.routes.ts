import express from "express";
import { getAccount, delinkGoogleAccount, deleteAccount, saveApiKey, deleteApiKey } from "../controllers/account/";
import verifyJWT from "../middleware/verifyJWT";
import { apiLimiter } from "../middleware/rateLimiter";

const router = express.Router();

// Apply rate limiting to all account routes
router.use(apiLimiter);

// Get the current user's account
router.get("/", verifyJWT, getAccount);

router.delete("/google-link", verifyJWT, delinkGoogleAccount);

router.delete("/", verifyJWT, deleteAccount);

// API Key management
router.post("/api-key", verifyJWT, saveApiKey);
router.delete("/api-key", verifyJWT, deleteApiKey);

export default router;
