import express from "express";
import { getAccount, delinkGoogleAccount, deleteAccount } from "../controllers/account/";
import verifyJWT from "../middleware/verifyJWT";

const router = express.Router();

// Get the current user's account
router.get("/", verifyJWT, getAccount);

router.delete("/google-link", verifyJWT, delinkGoogleAccount);

router.delete("/", verifyJWT, deleteAccount);

export default router;
