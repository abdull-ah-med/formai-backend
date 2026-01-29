import { Schema, model, Document, connect, connections, Types, Model } from "mongoose";
import crypto from "crypto";

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default_encryption_key_32_chars_"; // 32 chars
const IV_LENGTH = 16;

const encrypt = (text: string) => {
	const iv = crypto.randomBytes(IV_LENGTH);
	const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return iv.toString("hex") + ":" + encrypted.toString("hex");
};

const decrypt = (text: string) => {
	if (!text || !text.includes(":")) {
		return text; // Not encrypted or invalid format, return as is
	}
	try {
		const textParts = text.split(":");
		const iv = Buffer.from(textParts.shift()!, "hex");
		const encryptedText = Buffer.from(textParts.join(":"), "hex");
		const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
		let decrypted = decipher.update(encryptedText);
		decrypted = Buffer.concat([decrypted, decipher.final()]);
		return decrypted.toString();
	} catch (error) {
		return text; // Return original text if decryption fails
	}
};

// Form schema interfaces as per prompt
interface Option {
	id: string;
	text: string;
}
interface Question {
	id: string;
	type: "short_answer" | "dropdown";
	label: string;
	options?: Option[];
}
export interface FormSchema {
	title: string;
	description: string;
	questions: Question[];
}

// User Interface
export interface IUser extends Document {
	fullName: string;
	email: string;
	password?: string;
	anthropicApiKey?: string;
	chatHistory: { prompt: string; response: string; timestamp: Date }[];
	formsCreated: Types.ObjectId[];
	lastLogin?: Date;
	role: "user" | "admin";
	subscription?: {
		tier: "free" | "premium" | "enterprise";
		stripeCustomerId?: string;
		stripeSubscriptionId?: string;
		priceId?: string; // Stripe Price ID for the recurring plan
		status?:
			| "active"
			| "trialing"
			| "past_due"
			| "canceled"
			| "unpaid"
			| "incomplete"
			| "incomplete_expired";
		currentPeriodEnd?: Date; // End of the current billing period
		paymentMethod?: {
			brand?: string; // e.g. visa, mastercard (non-sensitive)
			last4?: string; // Last 4 digits of the card (non-sensitive)
			expMonth?: number;
			expYear?: number;
		};
	};
	createdAt: Date;
	updatedAt: Date;
	googleId?: string;
	googleTokens?: {
		accessToken: string;
		refreshToken?: string;
		expiryDate: number;
	};
	formsHistory: {
		schema: FormSchema;
		formId: string;
		responderUri?: string;
		finalizedAt: Date;
	}[];
	dailyFormCreations?: {
		count: number;
		date: Date;
	};
}

const formQuestionOptionSchema = new Schema<Option>(
	{
		id: { type: String, required: true },
		text: { type: String, required: true },
	},
	{ _id: false }
);

const formQuestionSchema = new Schema<Question>(
	{
		id: { type: String, required: true },
		type: {
			type: String,
			enum: ["short_answer", "dropdown"],
			required: true,
		},
		label: { type: String, required: true },
		options: [formQuestionOptionSchema],
	},
	{ _id: false }
);

const formSchema = new Schema<FormSchema>(
	{
		title: { type: String, required: true },
		description: { type: String, required: false },
		questions: [formQuestionSchema],
	},
	{ _id: false }
);

// Schema
const userSchema = new Schema<IUser>(
	{
		fullName: { type: String, required: true },
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
		},
		password: {
			type: String,
			required: function () {
				return !this.googleId;
			},
		},
		chatHistory: [
			{
				prompt: { type: String, required: true },
				response: { type: String, required: true },
				timestamp: { type: Date, default: Date.now },
			},
		],
		formsCreated: [{ type: Schema.Types.ObjectId, ref: "Form" }],
		lastLogin: { type: Date },
		role: {
			type: String,
			enum: ["user", "admin"],
			default: "user",
		},
		subscription: {
			tier: {
				type: String,
				enum: ["free", "premium", "enterprise"],
				default: "free",
			},
			stripeCustomerId: {
				type: String,
				set: (val: string) => (val ? encrypt(val) : undefined),
				get: (val: string) => (val ? decrypt(val) : undefined),
			},
			stripeSubscriptionId: {
				type: String,
				set: (val: string) => (val ? encrypt(val) : undefined),
				get: (val: string) => (val ? decrypt(val) : undefined),
			},
			priceId: { type: String },
			status: {
				type: String,
				enum: [
					"active",
					"trialing",
					"past_due",
					"canceled",
					"unpaid",
					"incomplete",
					"incomplete_expired",
				],
				default: "active",
			},
			currentPeriodEnd: { type: Date },
			paymentMethod: {
				brand: { type: String },
				last4: { type: String },
				expMonth: { type: Number },
				expYear: { type: Number },
			},
		},
		googleId: { type: String, unique: true, sparse: true },
		anthropicApiKey: {
			type: String,
			set: (val: string) => (val ? encrypt(val) : undefined),
			get: (val: string) => (val ? decrypt(val) : undefined),
		},
		googleTokens: {
			accessToken: {
				type: String,
				set: (val: string) => (val ? encrypt(val) : undefined),
				get: (val: string) => (val ? decrypt(val) : undefined),
			},
			refreshToken: {
				type: String,
				set: (val: string) => (val ? encrypt(val) : undefined),
				get: (val: string) => (val ? decrypt(val) : undefined),
			},
			expiryDate: { type: Number },
		},
		formsHistory: [
			{
				schema: formSchema,
				formId: { type: String, required: true },
				responderUri: { type: String },
				finalizedAt: { type: Date, required: true },
			},
		],
		dailyFormCreations: {
			count: { type: Number, default: 0 },
			date: { type: Date, default: () => new Date() },
		},
	},
	{ timestamps: true }
);

// Model - Create and export the User model
let UserModel: Model<IUser>;

// Check if the model is already defined (for hot reloading)
if (connections[0]?.readyState && connections[0].models.User) {
	UserModel = connections[0].models.User as Model<IUser>;
} else {
	UserModel = model<IUser>("User", userSchema);
}

// DB connect helper (reused across requests)
export async function dbConnect(uri: string) {
	try {
		if (connections[0]?.readyState) {
			return;
		}

		const connection = await connect(uri, {
			serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
		});
		return connection;
	} catch (error: any) {
		throw error; // Re-throw to be caught by the handler
	}
}

export default UserModel;
