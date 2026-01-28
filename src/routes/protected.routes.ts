import { Router } from "express";
import verifyJWT from "../middleware/verifyJWT";

const router = Router();

router.get("/protected", verifyJWT, (_req, res) => {
	res.json({ success: true, message: "Access granted to protected route" });
});

export default router;
