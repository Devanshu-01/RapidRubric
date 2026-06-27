// Authentication & authorization middleware.
//
// authenticate(): verifies the Bearer JWT, then loads the caller's profile from
//   the database. The role used for every authorization decision is read from
//   the DB row, NOT from the JWT claims — so a tampered/forged role claim cannot
//   escalate privileges (mitigates broken access control).
//
// requireRole(...roles): blocks the request unless the DB-backed role matches.
const jwt = require('jsonwebtoken')
const { query } = require('../db')

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing auth token' })
    }

    const token = header.slice(7)
    let payload
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET)
    } catch (e) {
      return res.status(401).json({ message: 'Invalid or expired token' })
    }

    const { rows } = await query(
      `select id, full_name, email, role, created_at, updated_at, deleted_at
         from profiles where id = $1`,
      [payload.sub]
    )
    const profile = rows[0]
    if (!profile) return res.status(401).json({ message: 'User profile not found' })
    if (profile.deleted_at) return res.status(401).json({ message: 'Account has been deactivated' })

    req.user = profile          // server-authoritative identity + role
    next()
  } catch (err) {
    next(err)
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' })
    }
    next()
  }
}

module.exports = { authenticate, requireRole }
