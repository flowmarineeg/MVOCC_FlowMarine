import mongoose from 'mongoose'

const carrierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Carrier name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Carrier code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Carrier', carrierSchema)
