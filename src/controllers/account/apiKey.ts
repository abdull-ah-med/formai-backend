import { Request, Response } from "express";
import User from "../../models/user.model";

/**
 * Save or update the user's Anthropic API key
 */
export const saveApiKey = async (req: Request, res: Response) => {
	try {
		const userId = req.user?.sub;
		const { apiKey } = req.body;

		if (!userId) {
			return res.status(401).json({
				success: false,
				message: "Not authenticated",
			});
		}

		if (!apiKey || typeof apiKey !== "string") {
			return res.status(400).json({
				success: false,
				message: "API key is required",
			});
		}

		// Basic validation for Anthropic API key format
		if (!apiKey.startsWith("sk-ant-")) {
			return res.status(400).json({
				success: false,
				message: "Invalid API key format. Anthropic API keys start with 'sk-ant-'",
			});
		}

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		// The key will be encrypted automatically by the schema setter
		user.anthropicApiKey = apiKey;
		await user.save();

		return res.status(200).json({
			success: true,
			message: "API key saved successfully",
		});
	} catch (error: any) {
		console.error("[saveApiKey] Error:", error.message);
		return res.status(500).json({
			success: false,
			message: "Server error while saving API key",
		});
	}
};

/**
 * Delete the user's Anthropic API key
 */
export const deleteApiKey = async (req: Request, res: Response) => {
	try {
		const userId = req.user?.sub;

		if (!userId) {
			return res.status(401).json({
				success: false,
				message: "Not authenticated",
			});
		}

		const user = await User.findById(userId);

		if (!user) {
			return res.status(404).json({
				success: false,
				message: "User not found",
			});
		}

		user.anthropicApiKey = undefined;
		await user.save();

		return res.status(200).json({
			success: true,
			message: "API key deleted successfully",
		});
	} catch (error: any) {
		console.error("[deleteApiKey] Error:", error.message);
		return res.status(500).json({
			success: false,
			message: "Server error while deleting API key",
		});
	}
};
