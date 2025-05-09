const axios = require('axios');
const Report = require('../Models/Report');
require('dotenv').config();
const moment = require('moment');
const openRouter_APIKey = process.env.OPENROUTER_API_KEY;

exports.createReport = async (req, res) => {
    try {
        const { userId, date, meals } = req.body;

        const existingReport = await Report.findOne({ userId, date });
        if (existingReport) {
            return res.status(203).json({
                success: false,
                message: 'A report for this date already exists. Please delete the existing report before adding a new one.'
            });
        }
        const prompt = `
You are a nutrition evaluator.
Respond ONLY with a valid JSON object in this exact shape—no explanation, no markdown, no extra text.

{
  "meals": [
    { "time": "08:00 AM", "food": "Oatmeal", "qualityScore": 85 }
  ],
  "overallMessage": "Eat more greens."
}

Meals:
${meals.map((meal, index) => `${index + 1}. ${meal.time} - ${meal.food}`).join('\n')}
        `;

        console.log('[DEBUG] Constructed prompt for OpenRouter:\n', prompt);

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-prover-v2:free',
                messages: [{ role: 'user', content: prompt }],
            },
            {
                headers: {
                    'Authorization': `Bearer ${openRouter_APIKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'YOUR_SITE_URL',
                    'X-Title': 'YOUR_SITE_NAME'
                }
            }
        );

        const aiContent = response.data?.choices?.[0]?.message?.content?.trim();
        console.log('[DEBUG] Raw AI response content:\n', aiContent);

        if (!aiContent) {
            console.error('[ERROR] AI response is empty.');
            return res.status(500).json({ success: false, error: 'AI returned empty response.' });
        }

        let parsedData;

        try {
            let jsonString;

            // Try to extract from ```json ... ```
            const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)```/i);
            if (jsonMatch) {
                jsonString = jsonMatch[1];
                console.log('[DEBUG] Extracted JSON from code block.');
            } else {
                // Fallback: try to extract from first {...} to last }
                const firstBrace = aiContent.indexOf('{');
                const lastBrace = aiContent.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    jsonString = aiContent.slice(firstBrace, lastBrace + 1);
                    console.log('[DEBUG] Extracted JSON from brace matching.');
                } else {
                    throw new Error('Valid JSON object not found in response.');
                }
            }

            console.log('[DEBUG] Cleaned JSON string:\n', jsonString);
            parsedData = JSON.parse(jsonString);

        } catch (jsonErr) {
            console.error('[ERROR] Failed to parse AI response:', jsonErr.message);
            return res.status(500).json({ success: false, error: 'AI returned invalid JSON.' });
        }

        const averageScore = parsedData.meals.reduce((sum, m) => sum + m.qualityScore, 0) / parsedData.meals.length;

        const report = new Report({
            userId,
            date,
            meals: parsedData.meals,
            averageScore,
            message: parsedData.overallMessage,
        });

        await report.save();

        console.log('[DEBUG] Report saved successfully:\n', report);
        res.status(201).json({ success: true, report });

    } catch (err) {
        console.error('[ERROR] Error creating report:', err.message);
        res.status(500).json({ success: false, error: 'Failed to create report' });
    }
};

exports.deleteReport = async (req, res) => {
    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({
                success: false,
                message: 'Missing id in request body.'
            });
        }

        const deletedReport = await Report.findByIdAndDelete(id);

        if (!deletedReport) {
            return res.status(404).json({
                success: false,
                message: 'No report found with the provided id.'
            });
        }

        console.log('[DEBUG] Report deleted successfully:\n', deletedReport);
        res.status(200).json({
            success: true,
            message: 'Report deleted successfully.',
            report: deletedReport
        });
    } catch (err) {
        console.error('[ERROR] Failed to delete report:', err.message);
        res.status(500).json({ success: false, error: 'Failed to delete report' });
    }
};

exports.getAllReports = async (req, res) => {
    try {
        const { userId, type } = req.query;

        if (!userId || (type != '0' && type != '1')) {
            return res.status(400).json({
                success: false,
                message: 'Missing or invalid userId or type in query parameters.'
            });
        }

        const now = moment();
        let fromDate;

        if (type === '0') {
            fromDate = now.clone().subtract(7, 'days').startOf('day');
        } else {
            fromDate = now.clone().subtract(30, 'days').startOf('day');
        }

        const reports = await Report.find({
            userId,
            date: { $gte: fromDate.toDate() }
        }).sort({ date: -1 });

        let overallAverage = null;

        if (reports.length > 0) {
            const totalScore = reports.reduce((sum, report) => sum + (report.averageScore || 0), 0);
            overallAverage = parseFloat((totalScore / reports.length).toFixed(2));
        }

        res.status(200).json({
            success: true,
            count: reports.length,
            averageScore: overallAverage,
            reports
        });

    } catch (err) {
        console.error('[ERROR] Failed to get reports:', err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch reports' });
    }
};

