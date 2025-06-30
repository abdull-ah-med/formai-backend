import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth.routes.ts";
import dotenv from "dotenv";
import connectDB from "./config/db.ts";
import protectedRoutes from "./routes/protected.routes.ts";
import accountRoutes from "./routes/account.routes.ts";
dotenv.config();

const app = express();

// Disable ETag headers to ensure fresh 200 responses (avoids 304 that break axios auth check)
app.disable("etag");

// Set CORS options to allow the frontend URL
app.use(
        cors({
                origin: [
                        "http://localhost:5173",
                        process.env.FRONTEND_URL ||
                                "https://your-app.vercel.app",
                        /\.railway\.app$/,
                        /\.vercel\.app$/,
                ],
                credentials: true,
        })
);
app.use(helmet());
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// Connect DB and start server
const startServer = async () => {
        try {
                await connectDB();

                const PORT = process.env.PORT || 4000;
                app.listen(PORT, () => {
                        console.log(
                                `Server running at http://localhost:${PORT}`
                        );
                });
        } catch (error) {
                console.error("Failed to start server:", error);
                process.exit(1);
        }
};
app.use("/api", protectedRoutes);
app.use("/api", accountRoutes);
app.use("/api/auth", authRoutes);
app.get("/", (_, res) => res.send("API running"));

startServer();
