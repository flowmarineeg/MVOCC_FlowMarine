import mongoose from 'mongoose'

// Individual physical container units — replaces the old aggregate
// ContainerStock count. Each unit belongs to one container type and is
// registered under one NVOCC. `status` tracks whether it's free to quote
// against or already allocated to a confirmed booking.
const containerSchema = new mongoose.Schema(
  {
    containerNumber: {
      type: String,
      required: [true, 'Container number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    containerType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ContainerType',
      required: true,
    },
    nvocc: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Nvocc',
      required: true,
    },
    status: {
      type: String,
      enum: ['available', 'allocated'],
      default: 'available',
    },
  },
  { timestamps: true }
)

containerSchema.index({ containerType: 1, nvocc: 1 })

export default mongoose.model('Container', containerSchema)
