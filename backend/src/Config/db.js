import mongoose from 'mongoose'
import { dropLegacyPartyCodeIndex } from '../Modules/MasterData/Party/party.model.js'

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI)
    console.log(`MongoDB connected: ${conn.connection.host}`)
    await dropLegacyPartyCodeIndex()
  } catch (err) {
    console.error(`MongoDB connection error: ${err.message}`)
    process.exit(1)
  }
}

export default connectDB
