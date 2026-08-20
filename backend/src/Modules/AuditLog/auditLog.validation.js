import { query } from 'express-validator'

export const listQueryRules = [
  query('dateFrom').optional().isISO8601().withMessage('Invalid dateFrom'),
  query('dateTo').optional().isISO8601().withMessage('Invalid dateTo'),
  query('result').optional().isIn(['SUCCESS', 'FAILURE']).withMessage('Invalid result filter'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1 }),
]
