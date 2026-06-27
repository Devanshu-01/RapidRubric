// Thin PostgreSQL access layer using a shared connection pool.
// All queries are parameterized ($1, $2, ...) which is the primary defence
// against SQL injection — user input is never concatenated into SQL text.
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Managed Postgres hosts (Render, Railway, Supabase) require TLS.
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
})

async function query(text, params) {
  return pool.query(text, params)
}

module.exports = { pool, query }
