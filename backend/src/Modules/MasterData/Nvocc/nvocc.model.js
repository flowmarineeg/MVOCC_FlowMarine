import mongoose from 'mongoose'
import { basePartyFields, contractTypeField } from '../_shared/party.shared.js'

const nvoccSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'NVOCC name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'NVOCC code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    ...basePartyFields,
    ...contractTypeField,
    tradeLane: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Nvocc', nvoccSchema)
