import mongoose from 'mongoose'
import { body } from 'express-validator'

// Shared "party" shape used by Nvocc, VesselOperator, Depot, Agent and Party
// master data: identity + country/city/address + tax/registration + contact rows.

export const CONTRACT_TYPES = ['Contract', 'Spot']

export const contactSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Contact name is required'], trim: true },
  title: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
})

// Identity + location + contacts. No contract block: Party and VO use this alone;
// Carrier (NVOCC), Depot and Agent add `contractTypeField` on top. The contract
// valid-from / valid-to dates no longer exist on any party-shaped entity.
export const basePartyFields = {
  country: { type: String, trim: true },
  city: { type: String, trim: true },
  address: { type: String, trim: true },
  taxNumber: { type: String, trim: true },
  registrationNumber: { type: String, trim: true },
  contacts: { type: [contactSchema], default: [] },
}

export const contractTypeField = {
  // '' is allowed so a form that clears the select doesn't fail the enum check.
  contractType: { type: String, enum: [...CONTRACT_TYPES, ''] },
}

export const contactRules = [
  body('contacts').optional().isArray().withMessage('Contacts must be a list'),
  body('contacts.*.name').trim().notEmpty().withMessage('Each contact needs a name'),
  body('contacts.*.title').optional().trim(),
  body('contacts.*.email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid contact email'),
  body('contacts.*.phone').optional().trim(),
]

export const basePartyRules = [
  body('country').optional().trim(),
  body('city').optional().trim(),
  body('address').optional().trim(),
  body('taxNumber').optional().trim(),
  body('registrationNumber').optional().trim(),
  ...contactRules,
]

export const contractTypeRules = [
  body('contractType').optional({ checkFalsy: true }).isIn(CONTRACT_TYPES).withMessage('Contract type must be Contract or Spot'),
]
