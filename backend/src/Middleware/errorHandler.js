const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500
  let message = err.message || 'Internal Server Error'

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400
    const errors = Object.values(err.errors).map((e) => e.message)
    message = errors.join(', ')
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409
    const field = Object.keys(err.keyValue)[0]
    message = `${field} already exists`
  }

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400
    message = `Invalid ${err.path}: ${err.value}`
  }

  // Multer upload error — translate its terse internal codes into a message
  // that actually tells the user what to do, instead of surfacing raw
  // strings like "Unexpected field" or "File too large".
  if (err.name === 'MulterError') {
    statusCode = 400
    const MULTER_MESSAGES = {
      LIMIT_UNEXPECTED_FIELD: `This file isn't expected here${err.field ? ` (field "${err.field}")` : ''} — try removing it and re-uploading, or refresh the page.`,
      LIMIT_FILE_SIZE: 'That file is too large — the maximum size is 10MB.',
      LIMIT_FILE_COUNT: 'Only one file can be uploaded per field.',
    }
    message = MULTER_MESSAGES[err.code] || `File upload failed: ${err.message}`
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}

export default errorHandler
