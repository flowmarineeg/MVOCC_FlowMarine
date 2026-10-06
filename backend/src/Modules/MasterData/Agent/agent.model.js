import mongoose from 'mongoose'
import { partyFields } from '../_shared/party.shared.js'

const agentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Agent name is required'],
      trim: true,
    },
    // Not `required` at schema level: agents seeded before the master-data
    // update have no code. sparse keeps those out of the unique index.
    code: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    country: {
      type: String,
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

export default mongoose.model('Agent', agentSchema)
