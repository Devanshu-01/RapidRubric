require('dotenv').config()
const express = require('express')
const cors = require('cors')
const routes = require('./routes')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/v1', routes)

// 404 fallback
app.use((req, res) => res.status(404).json({ message: 'Not found' }))

// Centralized error handler — returns standardized JSON, never a stack trace.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err)
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' })
})

if (require.main === module) {
  app.listen(PORT, () => console.log(`RapidRubric TA Review API running on port ${PORT}`))
}

module.exports = app
