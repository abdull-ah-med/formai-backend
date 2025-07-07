import mongoose, { Document, Schema } from 'mongoose';

export interface IForm extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  formData: any; // This will store the JSON representation of the form structure
  createdAt: Date;
  updatedAt: Date;
}

const FormSchema: Schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  description: { type: String },
  formData: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });

export default mongoose.model<IForm>('Form', FormSchema);
