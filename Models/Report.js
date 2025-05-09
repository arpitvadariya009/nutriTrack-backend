const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    date: Date,
    meals: [
        {
            time: String,
            food: String,
            qualityScore: Number,
        },
    ],
    averageScore: Number,
    message: String,
});

const ReportModel = mongoose.model('Report', reportSchema);
module.exports = ReportModel;