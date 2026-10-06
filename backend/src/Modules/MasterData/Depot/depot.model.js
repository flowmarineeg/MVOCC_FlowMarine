import mongoose from 'mongoose'
import { partyFields } from '../_shared/party.shared.js'

const depotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Depot name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Depot code is required'],
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

export default mongoose.model('Depot', depotSchema)
