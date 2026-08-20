import mongoose from 'mongoose'

const vesselSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vessel name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Vessel code is required'],
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

export default mongoose.model('Vessel', vesselSchema)
