// src/middlewares/verifyJWT.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
export interface AuthTokenPayload extends JwtPayload {
    sub: string; // Mongo _id
    email: string;
    role: "user" | "admin";
}
declare module "express-serve-static-core" {
    interface Request {
        user?: AuthTokenPayload;
    }
}

export default function verifyJWT(req: Request, res: Response, next: NextFunction) {
    const token: string | undefined = req.cookies?.token ?? req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token." });
    }

    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            return res.status(500).json({ error: "Server configuration error" });
        }

        const decoded = jwt.verify(token, secret) as AuthTokenPayload;
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: "Invalid or expired token." });
    }
}
