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

// ---------------------------------------------------------------------------
// CORS CONFIGURATION
// ---------------------------------------------------------------------------
const allowedOrigins = [
        process.env.FRONTEND_URL || "https://formai-frontend-one.vercel.app",
        "http://localhost:5173",
];

app.use(
        cors({
                origin: allowedOrigins,
                credentials: true,
                methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                allowedHeaders: [
                        "Content-Type",
                        "Authorization",
                        "X-Requested-With",
                ],
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
app.use("/api/form", formRoutes);
app.get("/", (_, res) => res.send("API running"));

startServer();
