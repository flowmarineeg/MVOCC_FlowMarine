import mongoose from 'mongoose'

export const UNIT_TYPES = ['length', 'weight']

const unitSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: UNIT_TYPES,
      required: [true, 'Unit type is required'],
    },
    name: {
      type: String,
      required: [true, 'Unit name is required'],
      trim: true,
    },
    symbol: {
      type: String,
      required: [true, 'Unit symbol is required'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

unitSchema.index({ type: 1, symbol: 1 }, { unique: true })

export default mongoose.model('Unit', unitSchema)
