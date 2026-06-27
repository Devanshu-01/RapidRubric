// Applies db/schema.sql to the database pointed to by DATABASE_URL.
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { pool } = require('../src/db')

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
  await pool.query(sql)
  console.log('Schema applied successfully.')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
