const { createReport, getAllReports, deleteReport } = require('../Controllers/reportController');
const router = require('express').Router();

router.post('/create', createReport);
router.get('/all', getAllReports);
router.delete('/delete', deleteReport);

module.exports = router;