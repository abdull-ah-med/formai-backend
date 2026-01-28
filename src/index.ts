import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes";
import dotenv from "dotenv";
import connectDB from "./config/db";
import protectedRoutes from "./routes/protected.routes";
import accountRoutes from "./routes/account.routes";
import formRoutes from "./routes/form.routes";
dotenv.config();

const app = express();
app.set("trust proxy", 1); // Trust first proxy (needed for correct client IP handling behind proxies)

// Disable ETag headers to ensure fresh 200 responses (avoids 304 that break axios auth check)
app.disable("etag");

const allowedOrigins = [process.env.FRONTEND_URL || "https://formai-frontend-one.vercel.app"];

app.use(
        cors({
                origin: allowedOrigins,
                credentials: true,
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        })
);

app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Remove X-Powered-By header (extra layer, helmet also does this)
app.disable("x-powered-by");

// Global error handler to prevent leaking stack traces
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error("[Global Error Handler]:", err.message);
        res.status(500).json({
                success: false,
                message: "An unexpected error occurred",
        });
});

const startServer = async () => {
        try {
                await connectDB();

                const PORT = process.env.PORT;
                app.listen(PORT);
        } catch (error) {
                process.exit(1);
        }
};
app.use("/api", protectedRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/form", formRoutes);
app.get("/", (_, res) => res.send("API running"));
app.get("/health", (_, res) => res.status(200).json({ status: "ok", timestamp: new Date().toISOString() }));

startServer();
        