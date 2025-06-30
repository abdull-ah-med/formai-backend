import { Request, Response } from "express";

export const logoutUser = async (_: Request, res: Response) => {
        const cookie = `token=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0;`;

        res.setHeader("Set-Cookie", cookie);
        res.status(200).json({ success: true, message: "Logged out" });
};
