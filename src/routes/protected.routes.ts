import { Router } from "express";
import verifyJWT from "../middleware/verifyJWT"; // or whatever middleware you're using

const router = Router();

router.get("/protected", verifyJWT, (req, res) => {
        res.json({ message: "Access granted to protected route" });
});

export default router;
