import mongoose from 'mongoose'
import { contactSchema } from '../_shared/party.shared.js'

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
    contacts: { type: [contactSchema], default: [] },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Customer', customerSchema)
