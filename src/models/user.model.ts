import {
        Schema,
        model,
        Document,
        connect,
        connections,
        Types,
        Model,
} from "mongoose";

// 1) User Interface
export interface IUser extends Document {
        fullName: string;
        email: string;
        password?: string;
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
}

// 2) Schema
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
                        stripeCustomerId: { type: String },
                        stripeSubscriptionId: { type: String },
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
        },
        { timestamps: true }
);

// 3) Model - Create and export the User model
let UserModel: Model<IUser>;

// Check if the model is already defined (for hot reloading)
if (connections[0]?.readyState && connections[0].models.User) {
        UserModel = connections[0].models.User as Model<IUser>;
} else {
        UserModel = model<IUser>("User", userSchema);
}

// 4) DB connect helper (reused across requests)
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
