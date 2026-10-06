import mongoose from 'mongoose'

const vesselSchema = new mongoose.Schema(
  {
    vesselOperator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VesselOperator',
      required: [true, 'Vessel operator is required'],
    },
    name: {
      type: String,
      required: [true, 'Vessel name is required'],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

vesselSchema.index({ vesselOperator: 1, name: 1 }, { unique: true })

export default mongoose.model('Vessel', vesselSchema)
