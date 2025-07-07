import mongoose, { Document, Schema } from 'mongoose';

export interface ISubmission extends Document {
  formId: mongoose.Types.ObjectId;
  submittedData: any; // This will store the JSON representation of the submitted data
  createdAt: Date;
}

const SubmissionSchema: Schema = new Schema({
  formId: { type: Schema.Types.ObjectId, ref: 'Form', required: true },
  submittedData: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

export default mongoose.model<ISubmission>('Submission', SubmissionSchema);
