import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

/**
 * Verify Google reCAPTCHA v2 / v3 token
 * @param token The token returned from the client after captcha completion
 * @returns boolean indicating whether the token is valid
 */
export const verifyRecaptcha = async (token: string): Promise<boolean> => {
        if (!token) return false;

        const secret = process.env.RECAPTCHA_SECRET_KEY;
        if (!secret) {
                console.error(
                        "RECAPTCHA_SECRET_KEY environment variable is not set"
                );
                return false;
        }

        try {
                const params = new URLSearchParams();
                params.append("secret", secret);
                params.append("response", token);

                const response = await fetch(
                        "https://www.google.com/recaptcha/api/siteverify",
                        {
                                method: "POST",
                                headers: {
                                        "Content-Type":
                                                "application/x-www-form-urlencoded",
                                },
                                body: params.toString(),
                        }
                );

                const data = (await response.json()) as {
                        success: boolean;
                        score?: number;
                        [key: string]: unknown;
                };

                return data.success === true;
        } catch (error) {
                console.error("Failed to validate reCAPTCHA:", error);
                return false;
        }
};
