import mongoose from 'mongoose'
import { basePartyFields } from '../_shared/party.shared.js'

export const PARTY_TYPES = ['shipper', 'consignee', 'notify']

// No code and no contract block: a Party is a shipper/consignee/notify contact,
// not a contracted vendor. Documents saved earlier keep their stored values in
// Mongo but nothing reads them. A leftover unique index on `code` from the old
// schema is dropped at startup — see dropLegacyPartyCodeIndex().
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
    ...basePartyFields,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

const Party = mongoose.model('Party', partySchema)

// With `code` gone, every new Party has code=null, so the old unique `code_1`
// index would reject the second one. Best-effort: a fresh DB has no such index.
export const dropLegacyPartyCodeIndex = async () => {
  try {
    await Party.collection.dropIndex('code_1')
    console.log('Dropped legacy Party code_1 index')
  } catch {
    // index (or collection) doesn't exist — nothing to do
  }
}

export default Party
