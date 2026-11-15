const router = require('express').Router();
const community = require('../controllers/communityController');

router.get('/', community.list);

module.exports = router;
