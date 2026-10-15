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
    // Quotation eligibility (PRD BR-0.3). An empty portsServed list means "serves
    // every port" so carriers saved before this field existed keep working.
    portsServed: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Port' }],
    acceptsDg: { type: Boolean, default: true },
    defaultFreeTimeDays: { type: Number, min: [0, 'Free time must be a positive number'] },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Nvocc', nvoccSchema)
