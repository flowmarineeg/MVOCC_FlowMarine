import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer from 'multer'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

// Booking can carry two independent file fields — the original shipping
// declaration (Section 2) and the newer booking confirmation file
// (Section 3) — each stored in its own directory, sharing one multer
// instance/fileFilter/signature-verification logic since they're
// structurally identical (same allowlist, same "PDF or image" rule).
const UPLOAD_DIRS = {
  shippingDeclaration: path.join(process.cwd(), 'uploads', 'shipping-declarations'),
  bookingConfirmationFile: path.join(process.cwd(), 'uploads', 'booking-confirmations'),
  customsCertificateFile: path.join(process.cwd(), 'uploads', 'customs-certificates'),
}
for (const dir of Object.values(UPLOAD_DIRS)) fs.mkdirSync(dir, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = UPLOAD_DIRS[file.fieldname]
    if (!dir) return cb(Object.assign(new Error(`Unexpected file field "${file.fieldname}"`), { statusCode: 400 }))
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  },
})

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(Object.assign(new Error('File must be a PDF or an image (JPG, PNG, WEBP)'), { statusCode: 400 }), false)
  }
  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

// Both POST / (create) and PUT /:id (update) accept either file field, both,
// or neither — the Job form's Section 2/3 file pickers aren't gated by
// create-vs-edit mode, so both routes must be able to receive either.
export const uploadBookingFiles = upload.fields([
  { name: 'shippingDeclaration', maxCount: 1 },
  { name: 'bookingConfirmationFile', maxCount: 1 },
  { name: 'customsCertificateFile', maxCount: 1 },
])

// Normalizes the two multer shapes (`.single()` → req.file, `.fields()` →
// req.files[field][0]) into one lookup.
const getUploadedFile = (req, fieldName) => {
  if (req.files?.[fieldName]?.[0]) return req.files[fieldName][0]
  if (req.file?.fieldname === fieldName) return req.file
  return null
}

// fileFilter above only sees the client-supplied multipart Content-Type and
// filename — both attacker-controlled — before any bytes have arrived, so a
// relabeled file (e.g. an .html payload sent as image/png) sails through it.
// This runs after the file is fully written to disk and checks the actual
// leading bytes against the real format's magic number, deleting the file
// and rejecting the request if they don't match.
const matchesSignature = (buffer, signature) => signature.every((byte, i) => buffer[i] === byte)

const FIELD_LABELS = {
  shippingDeclaration: 'Shipping declaration',
  bookingConfirmationFile: 'Booking confirmation file',
  customsCertificateFile: 'Customs certificate file',
}

// Factory so the same verification logic covers both file fields — call once
// per field in the route chain; each call no-ops if that field wasn't
// uploaded on this request.
export const verifyFileSignature = (fieldName) => (req, res, next) => {
  const file = getUploadedFile(req, fieldName)
  if (!file) return next()
  fs.readFile(file.path, (err, buffer) => {
    if (err) return next(err)

    const valid =
      matchesSignature(buffer, [0x25, 0x50, 0x44, 0x46]) || // %PDF
      matchesSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || // PNG
      matchesSignature(buffer, [0xff, 0xd8, 0xff]) || // JPEG
      (matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.slice(8, 12).toString('ascii') === 'WEBP') // RIFF....WEBP

    if (!valid) {
      fs.unlink(file.path, () => {})
      return next(Object.assign(
        new Error(`${FIELD_LABELS[fieldName] || 'File'} content does not match a PDF or image — the file may be mislabeled or corrupted`),
        { statusCode: 400 }
      ))
    }
    next()
  })
}

// ─── Container stock Excel import — parsed in memory, never written to disk ───
const EXCEL_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]

const excelUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (!EXCEL_MIME_TYPES.includes(file.mimetype)) {
      return cb(Object.assign(new Error('File must be an Excel spreadsheet (.xlsx or .xls)'), { statusCode: 400 }), false)
    }
    cb(null, true)
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

export const uploadContainerExcel = excelUpload.single('file')
