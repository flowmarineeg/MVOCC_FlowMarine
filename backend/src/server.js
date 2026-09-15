import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'

import connectDB from './Config/db.js'
import errorHandler from './Middleware/errorHandler.js'

// ─── Platform Routes (Auth / Team / RBAC / Audit) ─────────────────────────────
import authRoutes from './Modules/Auth/auth.routes.js'
import invitationRoutes from './Modules/Team/invitation.routes.js'
import teamRoutes from './Modules/Team/team.routes.js'
import roleRoutes from './Modules/RBAC/role.routes.js'
import permissionRoutes from './Modules/RBAC/permission.routes.js'
import auditLogRoutes from './Modules/AuditLog/auditLog.routes.js'

// ─── Master Data Routes ───────────────────────────────────────────────────────
import containerTypeRoutes from './Modules/MasterData/ContainerType/containerType.routes.js'
import carrierRoutes from './Modules/MasterData/Carrier/carrier.routes.js'
import portRoutes from './Modules/MasterData/Port/port.routes.js'
import agentRoutes from './Modules/MasterData/Agent/agent.routes.js'
import nvoccRoutes from './Modules/MasterData/Nvocc/nvocc.routes.js'
import containerRoutes from './Modules/MasterData/Container/container.routes.js'
import customerRoutes from './Modules/MasterData/Customer/customer.routes.js'
import depotRoutes from './Modules/MasterData/Depot/depot.routes.js'

// ─── Export Routes ────────────────────────────────────────────────────────────
import bookingRoutes from './Modules/Export/Booking/booking.routes.js'
import quotationRoutes from './Modules/Export/Quotation/quotation.routes.js'

// ─── DB ───────────────────────────────────────────────────────────────────────
connectDB()

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express()

app.use(helmet())
app.use(compression())
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'))
}

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'NVOCC API is running', env: process.env.NODE_ENV })
})

// ─── Platform (Auth / Team / RBAC / Audit) ────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/invitations', invitationRoutes)
app.use('/api/team', teamRoutes)
app.use('/api/roles', roleRoutes)
app.use('/api/permissions', permissionRoutes)
app.use('/api/audit-logs', auditLogRoutes)

// ─── Master Data ──────────────────────────────────────────────────────────────
app.use('/api/master/container-types', containerTypeRoutes)
app.use('/api/master/carriers', carrierRoutes)
app.use('/api/master/ports', portRoutes)
app.use('/api/master/agents', agentRoutes)
app.use('/api/master/nvoccs', nvoccRoutes)
app.use('/api/master/containers', containerRoutes)
app.use('/api/master/customers', customerRoutes)
app.use('/api/master/depots', depotRoutes)

// ─── Export Module ────────────────────────────────────────────────────────────
app.use('/api/export/bookings', bookingRoutes)
app.use('/api/export/quotations', quotationRoutes)

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
})

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT} [${process.env.NODE_ENV}]`)
})
