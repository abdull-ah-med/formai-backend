import mongoose, { Document, Schema } from "mongoose";

export interface IForm extends Document {
        userId: mongoose.Types.ObjectId;
        prompt: string;
        claudeResponse: any; // JSON representation of the form structure
        revisions: {
                prompt: string;
                claudeResponse: any;
                timestamp: Date;
        }[];
        googleFormUrl?: string;
        createdAt: Date;
        updatedAt: Date;
        revisionCount: number;
}

const FormSchema: Schema = new Schema(
        {
                userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
                prompt: { type: String, required: true },
                claudeResponse: { type: Schema.Types.Mixed, required: true },
                revisions: [
                        {
                                prompt: { type: String, required: true },
                                claudeResponse: { type: Schema.Types.Mixed, required: true },
                                timestamp: { type: Date, default: Date.now },
                        },
                ],
                googleFormUrl: { type: String },
                revisionCount: { type: Number, default: 0 },
        },
        { timestamps: true }
);

export default mongoose.model<IForm>("Form", FormSchema);
