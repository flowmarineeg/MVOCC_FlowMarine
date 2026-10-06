import mongoose from 'mongoose'
import { partyFields } from '../_shared/party.shared.js'

export const PARTY_TYPES = ['shipper', 'consignee', 'notify']

const partySchema = new mongoose.Schema(
  {
    partyType: {
      type: String,
      enum: PARTY_TYPES,
      required: [true, 'Party type is required'],
    },
    name: {
      type: String,
      required: [true, 'Party name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Party code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    ...partyFields,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Party', partySchema)
