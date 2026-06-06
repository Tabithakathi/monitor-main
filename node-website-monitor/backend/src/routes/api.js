const express = require('express');
const router = express.Router();
const {
  triggerAudit,
  getDashboardStats,
  getWordPressDetails,
  getAlerts,
  resolveAlert,
  getMonitoredTargets
} = require('../controllers/monitorController');
const {
  getSettings,
  saveSettings,
  testEmail
} = require('../controllers/settingsController');

// Immediate Site Audit Trigger
router.post('/audit', triggerAudit);

// Full-website deep crawl (page + image discovery across entire site)
router.post('/crawl', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing target URL in request body.' });
  try {
    const { crawlWebsite } = require('../services/pageAnalysisService');
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const result = await crawlWebsite(normalizedUrl, '');
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: `Crawl failed: ${err.message}` });
  }
});

// Dashboard stats & historical graphs payload
router.get('/stats', getDashboardStats);

// Unique monitored target domains list
router.get('/targets', getMonitoredTargets);

// Wordpress details
router.get('/wordpress', getWordPressDetails);

// SRE alerts logs
router.get('/alerts', getAlerts);

// Resolve active alerts
router.post('/alerts/resolve', resolveAlert);

// SRE Settings & Alert configurations
router.get('/settings', getSettings);
router.post('/settings', saveSettings);

// SMTP Test email connection
router.post('/send-test-email', testEmail);
router.post('/send-test-email/', testEmail);

// ── Per-website email configuration (NEW) ────────────────────────────────────
router.get('/email-config', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required.' });
  try {
    const { WebsiteEmailConfig } = require('../models/Schemas');
    const config = await WebsiteEmailConfig.findOne({ url }) || { url, alertEmail: '', alertsEnabled: false, alertFrequency: 'instant', totalEmailsSent: 0, lastEmailSent: null, lastAlertType: '' };
    res.status(200).json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/email-config', async (req, res) => {
  const { url, alertEmail, alertsEnabled, alertFrequency } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required.' });
  // Basic email validation
  if (alertEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) {
    return res.status(400).json({ error: 'Invalid email address format.' });
  }
  try {
    const { WebsiteEmailConfig } = require('../models/Schemas');
    const config = await WebsiteEmailConfig.findOneAndUpdate(
      { url },
      { alertEmail: alertEmail || '', alertsEnabled: !!alertsEnabled, alertFrequency: alertFrequency || 'instant', updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email alert history (NEW) ─────────────────────────────────────────────────
router.get('/email-history', async (req, res) => {
  const { url } = req.query;
  try {
    const { EmailAlertHistory } = require('../models/Schemas');
    const query = url ? { url } : {};
    const history = await EmailAlertHistory.find(query).sort({ sentAt: -1 }).limit(50);
    res.status(200).json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Test email for specific website (NEW) ─────────────────────────────────────
router.post('/test-site-email', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required.' });
  try {
    const { WebsiteEmailConfig, EmailAlertHistory } = require('../models/Schemas');
    const { enqueueEmailAlert } = require('../services/emailService');

    const config = await WebsiteEmailConfig.findOne({ url });
    if (!config || !config.alertEmail) {
      return res.status(400).json({ success: false, error: 'No alert email configured for this website. Save an email address in the Email Alerts tab first.' });
    }

    const recipient = config.alertEmail;
    const subject   = '[Website Monitor] Test Alert — Email Alerts are Working';
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;background:#f8fafc;">
      <div style="max-width:560px;margin:0 auto;background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
        <div style="background:#4f46e5;color:white;padding:20px 24px;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;opacity:0.8;margin-bottom:4px;">Website Monitor</div>
          <div style="font-size:18px;font-weight:800;">Test Email — Alerts Working ✓</div>
        </div>
        <div style="padding:24px;font-size:14px;color:#334155;line-height:1.6;">
          <p style="margin:0 0 16px;">Your email alert system is configured correctly and working.</p>
          <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;font-size:12px;font-family:monospace;">
            <strong>Website:</strong> ${url}<br>
            <strong>Alert Email:</strong> ${recipient}<br>
            <strong>Status:</strong> Alerts Enabled<br>
            <strong>Sent At:</strong> ${new Date().toLocaleString()}
          </div>
          <p style="margin:16px 0 0;color:#64748b;font-size:12px;">
            Future alerts for this website will be automatically sent to this address when issues are detected.
          </p>
        </div>
        <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 24px;font-size:10px;color:#94a3b8;text-align:center;">
          MonitorPro SRE Dashboard · Automated Alert System
        </div>
      </div>
    </body></html>`;

    // Enqueue the email alert in the background queue
    const doc = await enqueueEmailAlert({
      url,
      recipient,
      category: 'test',
      level: 'info',
      subject,
      message: 'Test email enqueued successfully.',
      html
    });

    // Await delivery status resolution (up to 15 seconds)
    let finalDoc = doc;
    const startTime = Date.now();
    while (finalDoc && finalDoc.status === 'sending' && (Date.now() - startTime < 15000)) {
      await new Promise(resolve => setTimeout(resolve, 500));
      finalDoc = await EmailAlertHistory.findOne({ _id: doc._id });
    }

    if (!finalDoc || finalDoc.status === 'failed') {
      const errorMsg = finalDoc?.errorReason || 'Email delivery failed (check SMTP settings).';
      return res.status(500).json({
        success: false,
        error: errorMsg
      });
    }

    res.status(200).json({
      success: true,
      message: `✅ Test email successfully delivered to ${recipient}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Search History (NEW) ──────────────────────────────────────────────────────
router.get('/search-history', async (req, res) => {
  try {
    const { SearchHistory } = require('../models/Schemas');
    const history = await SearchHistory.find().sort({ searchedAt: -1 }).limit(10);
    res.status(200).json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/search-history', async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Search query required.' });
  }
  try {
    const { SearchHistory } = require('../models/Schemas');
    const search = await SearchHistory.create({ query: query.trim(), searchedAt: new Date() });
    res.status(200).json({ success: true, search });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Toggle Scanned Website Favorite (NEW) ────────────────────────────────────
router.post('/scanned-websites/favorite', async (req, res) => {
  const { url, isFavorite } = req.body;
  if (!url) return res.status(400).json({ error: 'URL required.' });
  try {
    const { ScannedWebsite } = require('../models/Schemas');
    const website = await ScannedWebsite.findOneAndUpdate(
      { url },
      { isFavorite: !!isFavorite },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, website });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
