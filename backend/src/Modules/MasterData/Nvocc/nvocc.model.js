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
    // Sprint 007 — prefix of this carrier's HBL number series (S5-10); blank -> 'HBL'
    hblPrefix: { type: String, trim: true, uppercase: true, maxlength: [10, 'HBL prefix is at most 10 characters'] },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export default mongoose.model('Nvocc', nvoccSchema)
