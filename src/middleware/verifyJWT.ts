// src/middlewares/verifyJWT.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

// Shape of the JWT payload we create in the auth controller
export interface AuthTokenPayload extends JwtPayload {
        sub: string; // Mongo _id
        email: string;
        role: "user" | "admin";
}

// Extend Express's Request type so that downstream handlers see the correct type
declare module "express-serve-static-core" {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        interface Request {
                user?: AuthTokenPayload;
        }
}

export default function verifyJWT(
        req: Request,
        res: Response,
        next: NextFunction
) {
        // Prefer the signed HttpOnly cookie set at login, but fall back to
        // a Bearer token in the Authorization header so the same middleware
        // works for tools like Postman.
        const token: string | undefined =
                req.cookies?.token ?? req.headers.authorization?.split(" ")[1];

        if (!token) {
                return res
                        .status(401)
                        .json({ error: "Access denied. No token." });
        }

        try {
                const secret = process.env.JWT_SECRET;
                if (!secret) {
                        console.error("JWT_SECRET env var is not set");
                        return res
                                .status(500)
                                .json({ error: "Server configuration error" });
                }

                const decoded = jwt.verify(token, secret) as AuthTokenPayload;
                req.user = decoded;
                next();
        } catch (err) {
                res.status(401).json({ error: "Invalid or expired token." });
        }
}
