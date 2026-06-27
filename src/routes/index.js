const express = require('express')
const { authenticate, requireRole } = require('../middleware/auth')
const auth = require('../controllers/authController')
const review = require('../controllers/reviewController')

const router = express.Router()

// --- security / supporting endpoints ---
router.post('/auth/register', auth.register)
router.post('/auth/login', auth.login)

// --- TA Review feature (role-gated to 'ta') ---
router.get('/ta/queue', authenticate, requireRole('ta'), review.getQueue)
router.get('/ta/submissions/:submissionId', authenticate, requireRole('ta'), review.getReview)
router.post('/ta/submissions/:submissionId/release', authenticate, requireRole('ta'), review.release)

module.exports = router
