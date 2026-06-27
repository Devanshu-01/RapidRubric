// Supporting security endpoints needed to exercise the TA Review feature:
// register (POST /auth/register) and login (POST /auth/login).
// Login issues a short-lived JWT whose subject (`sub`) is the profile id.
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { query } = require('../db')

const ALLOWED_ROLES = ['student', 'ta', 'instructor']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function signToken(profile) {
  return jwt.sign(
    { sub: profile.id, role: profile.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_TTL || '2h' }
  )
}

async function register(req, res, next) {
  try {
    const email = req.body.email?.trim().toLowerCase()
    const name = req.body.name?.trim()
    const { password, role } = req.body

    // --- input validation (rejects malformed / unexpected input) ---
    if (!email || !password || !name || !role) {
      return res.status(400).json({ message: 'email, password, name, and role are required' })
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' })
    }
    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({ message: `role must be one of: ${ALLOWED_ROLES.join(', ')}` })
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const { rows } = await query(
      `insert into profiles (full_name, email, role, password_hash)
       values ($1, $2, $3, $4)
       returning id, full_name, email, role`,
      [name, email, role, passwordHash]
    )

    return res.status(201).json({ message: 'User registered successfully', user: rows[0] })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An account with this email already exists' })
    }
    next(err)
  }
}

async function login(req, res, next) {
  try {
    const email = req.body.email?.trim().toLowerCase()
    const { password } = req.body

    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' })
    }

    const { rows } = await query(
      `select id, full_name, email, role, password_hash, deleted_at
         from profiles where email = $1`,
      [email]
    )
    const profile = rows[0]

    // Generic message — never reveal whether the email exists (avoids user enumeration).
    if (!profile || profile.deleted_at) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, profile.password_hash)
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    return res.json({
      access_token: signToken(profile),
      token_type: 'Bearer',
      expires_in: process.env.JWT_TTL || '2h',
      user: { id: profile.id, email: profile.email, full_name: profile.full_name, role: profile.role },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = { register, login }
