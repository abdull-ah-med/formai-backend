import { Router } from "express";
import {
        registerUser,
        loginUser,
        logoutUser,
        handleGoogleCallback,
} from "../controllers/auth/index";
import { authLimiter } from "../middleware/rateLimiter";
import verifyJWT from "../middleware/verifyJWT";

const router = Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.get("/google/callback", handleGoogleCallback);
router.post("/logout", verifyJWT, logoutUser);

export default router;
