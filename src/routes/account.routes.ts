import express from "express";
import { getAccount } from "../controllers/account/getAccount";
import verifyJWT from "../middleware/verifyJWT";

const router = express.Router();

// Get the current user's account
router.get("/", verifyJWT, getAccount);

export default router;
