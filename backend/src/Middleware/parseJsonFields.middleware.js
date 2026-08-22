// Multipart (multer) requests carry every field as a string, so an array/object
// field like `containers` arrives JSON-stringified from the client and needs to
// be parsed back before express-validator's isArray()/isMongoId() checks run.
export const parseJsonFields = (fields) => (req, res, next) => {
  for (const field of fields) {
    if (typeof req.body[field] === 'string') {
      try {
        req.body[field] = JSON.parse(req.body[field])
      } catch {
        // leave as-is — the field validator will reject the malformed value
      }
    }
  }
  next()
}
