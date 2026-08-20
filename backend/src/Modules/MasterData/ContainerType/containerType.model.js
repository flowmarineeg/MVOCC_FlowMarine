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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('ContainerType', containerTypeSchema)
