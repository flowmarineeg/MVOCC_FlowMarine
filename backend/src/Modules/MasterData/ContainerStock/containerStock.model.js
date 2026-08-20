import mongoose from 'mongoose'

const containerStockSchema = new mongoose.Schema(
  {
    containerType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContainerType',
      required: true,
      unique: true,
    },
    availableCount: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Available count cannot be negative'],
    },
  },
  { timestamps: true }
)

export default mongoose.model('ContainerStock', containerStockSchema)
