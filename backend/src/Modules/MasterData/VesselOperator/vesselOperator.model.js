import mongoose from 'mongoose'
import { basePartyFields } from '../_shared/party.shared.js'

const vesselOperatorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Vessel operator name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Vessel operator code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    ...basePartyFields,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('VesselOperator', vesselOperatorSchema)
