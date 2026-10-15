import mongoose from 'mongoose'

const containerTypeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Container type code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    label: {
      type: String,
      required: [true, 'Container type label is required'],
      trim: true,
    },
    // Optional capacity data (PRD Q-24/Q-25): when set, quotations are checked
    // against Σ(quantity × capacity); a type without them is simply not checked.
    maxPayloadKg: { type: Number, min: [0, 'Max payload must be a positive number'] },
    capacityCbm: { type: Number, min: [0, 'Capacity must be a positive number'] },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('ContainerType', containerTypeSchema)
