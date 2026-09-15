import mongoose from 'mongoose'

// Atomic per-year sequence for auto-generated Job Numbers
// (`OPS Jobs {year} FLOW MARINE – NVOCC-{seq}`) — see getNextJobNo() in
// booking.service.js. `_id` is the counter key (e.g. "job-2026"), incremented
// via findOneAndUpdate($inc) so concurrent creates never collide.
const jobCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
})

export default mongoose.model('JobCounter', jobCounterSchema)
