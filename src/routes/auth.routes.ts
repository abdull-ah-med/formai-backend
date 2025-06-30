import { Router } from "express";
import {
        registerUser,
        loginUser,
        logoutUser,
        handleGoogleCallback,
} from "../controllers/auth/index.ts";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/google/callback", handleGoogleCallback);
router.post("/logout", logoutUser);

export default router;
