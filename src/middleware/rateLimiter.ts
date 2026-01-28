import rateLimit from "express-rate-limit";

// General auth rate limiter
export const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // Limit each IP to 10 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        message: { success: false, message: "Too many requests, please try again later" },
});

// Rate limiter for form generation (expensive AI operations)
export const formGenerationLimiter = rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 20, // Limit each IP to 20 form generations per hour
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Too many form generation requests, please try again later" },
});

// General API rate limiter
export const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Too many requests, please try again later" },
});
