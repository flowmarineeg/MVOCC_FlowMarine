import mongoose from 'mongoose'
import { body } from 'express-validator'

// Shared "party" shape used by Nvocc, VesselOperator, Depot, Agent and Party
// master data: identity + tax/registration + contract validity + contact rows.

export const CONTRACT_TYPES = ['Contract', 'Spot']

export const contactSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Contact name is required'], trim: true },
  title: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
})

export const partyFields = {
  address: { type: String, trim: true },
  taxNumber: { type: String, trim: true },
  registrationNumber: { type: String, trim: true },
  // '' is allowed so a form that clears the select doesn't fail the enum check.
  contractType: { type: String, enum: [...CONTRACT_TYPES, ''] },
  contractValidFrom: { type: Date },
  contractValidTo: { type: Date },
  contacts: { type: [contactSchema], default: [] },
}

export const contactRules = [
  body('contacts').optional().isArray().withMessage('Contacts must be a list'),
  body('contacts.*.name').trim().notEmpty().withMessage('Each contact needs a name'),
  body('contacts.*.title').optional().trim(),
  body('contacts.*.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid contact email'),
  body('contacts.*.phone').optional().trim(),
]

export const partyRules = [
  body('address').optional().trim(),
  body('taxNumber').optional().trim(),
  body('registrationNumber').optional().trim(),
  body('contractType').optional({ checkFalsy: true }).isIn(CONTRACT_TYPES).withMessage('Contract type must be Contract or Spot'),
  body('contractValidFrom').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid contract valid-from date'),
  body('contractValidTo')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('Invalid contract valid-to date')
    .custom((to, { req }) => {
      const from = req.body.contractValidFrom
      if (from && new Date(to) < new Date(from)) throw new Error('Contract valid-to must not be before valid-from')
      return true
    }),
  ...contactRules,
]
