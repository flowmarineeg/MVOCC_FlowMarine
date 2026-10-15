import mongoose from 'mongoose'
import { contactSchema } from '../_shared/party.shared.js'

// Uploaded certificates: only ever written from a real multer upload (the
// controller strips these keys from JSON bodies) and streamed back through an
// authenticated route — same treatment as the Booking files.
const fileSchema = {
  fileName: { type: String },
  filePath: { type: String },
  mimeType: { type: String },
  uploadedAt: { type: Date },
}

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
    },
    date: {
      type: Date,
    },
    address: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    governorate: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    taxNumber: {
      type: String,
      trim: true,
    },
    taxRegister: {
      type: String,
      trim: true,
    },
    taxCertificateFile: fileSchema,
    registrationCertificateFile: fileSchema,
    contacts: { type: [contactSchema], default: [] },
    // PRD Q-10: a customer on credit hold cannot be quoted.
    creditHold: { type: Boolean, default: false },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Customer', customerSchema)
