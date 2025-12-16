const express = require('express');
const router = express.Router();
const syncController = require('../controllers/sync.controller');

router.post('/push', syncController.pushChanges);
router.get('/pull', syncController.pullChanges);
router.post('/full-products', syncController.fullProductSync);

module.exports = router;
