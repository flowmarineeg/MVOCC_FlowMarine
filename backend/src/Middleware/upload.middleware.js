import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import multer from 'multer'

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'shipping-declarations')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    cb(null, `${unique}${path.extname(file.originalname)}`)
  },
})

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(Object.assign(new Error('Shipping declaration must be a PDF or an image (JPG, PNG, WEBP)'), { statusCode: 400 }), false)
  }
  cb(null, true)
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

export const uploadShippingDeclaration = upload.single('shippingDeclaration')

// fileFilter above only sees the client-supplied multipart Content-Type and
// filename — both attacker-controlled — before any bytes have arrived, so a
// relabeled file (e.g. an .html payload sent as image/png) sails through it.
// This runs after the file is fully written to disk and checks the actual
// leading bytes against the real format's magic number, deleting the file
// and rejecting the request if they don't match.
const matchesSignature = (buffer, signature) => signature.every((byte, i) => buffer[i] === byte)

export const verifyShippingDeclarationSignature = (req, res, next) => {
  if (!req.file) return next()
  fs.readFile(req.file.path, (err, buffer) => {
    if (err) return next(err)

    const valid =
      matchesSignature(buffer, [0x25, 0x50, 0x44, 0x46]) || // %PDF
      matchesSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || // PNG
      matchesSignature(buffer, [0xff, 0xd8, 0xff]) || // JPEG
      (matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46]) && buffer.slice(8, 12).toString('ascii') === 'WEBP') // RIFF....WEBP

    if (!valid) {
      fs.unlink(req.file.path, () => {})
      return next(Object.assign(
        new Error('Shipping declaration file content does not match a PDF or image — the file may be mislabeled or corrupted'),
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
