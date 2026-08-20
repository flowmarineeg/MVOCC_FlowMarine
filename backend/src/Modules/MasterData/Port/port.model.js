import mongoose from 'mongoose'

const portSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Port name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Port code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Port', portSchema)
