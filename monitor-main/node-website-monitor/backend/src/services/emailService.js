const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../../../email_delivery.log');

/**
 * Log email alert deliveries to an audit file for SRE compliance verification.
 */
const logEmailDelivery = (recipient, subject, html) => {
  const time = new Date().toISOString();
  const logMsg = `[${time}] EMAIL DISPATCHED TO: ${recipient}\nSUBJECT: ${subject}\n\n${html.replace(/<[^>]*>/g, '').trim().substring(0, 300)}...\n--------------------------------------------------\n\n`;
  try {
    fs.appendFileSync(logFilePath, logMsg, 'utf-8');
    console.log(`📝 SRE Email alert delivery successfully logged to ${logFilePath}`);
  } catch (err) {
    console.error('⚠️ Failed to write to SRE email delivery log:', err.message);
  }
};

/**
 * Send an SRE alert email asynchronously in a non-blocking queue beat.
 * 
 * @param {string} url - Audited site URL.
 * @param {string} category - Alert category (e.g., 'uptime', 'ssl', 'seo').
 * @param {string} level - Alert severity level ('info', 'warning', 'critical').
 * @param {string} message - Description of the issue.
 */
const sendAlertEmail = async (url, category, level, message) => {
  // Dispatch in non-blocking event loop cycle
  setTimeout(async () => {
    const time = new Date().toLocaleString();
    
    let settings = {
      critical_email: process.env.CRITICAL_EMAIL || 'alex.rivera@monitorpro.sre',
      email_host_user: process.env.EMAIL_HOST_USER || '',
      email_host_password: process.env.EMAIL_HOST_PASSWORD || '',
      alerts_enabled: true
    };

    const settingsPath = path.join(__dirname, '../../../../sre_settings.json');
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        settings = { ...settings, ...JSON.parse(data) };
      }
    } catch (err) {
      console.error('⚠️ Failed to load SRE settings dynamically in emailService:', err.message);
    }

    if (settings.alerts_enabled === false) {
      console.log('🔇 SMTP Alerts are globally disabled in settings. Skipping email dispatch.');
      return;
    }

    const recipient = settings.critical_email;
    const hostUser = settings.email_host_user;
    const hostPass = settings.email_host_password;
    
    const subject = `[${level.toUpperCase()}] SRE Alert Triggered - ${url}`;
    
    // Polished responsive HTML template
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 20px; }
          .card { max-width: 580px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden; }
          .header { background: #4f46e5; color: white; padding: 24px; font-weight: 800; font-size: 18px; text-transform: uppercase; letter-spacing: 0.02em; }
          .header.critical { background: #ef4444; }
          .header.warning { background: #f59e0b; }
          .content { padding: 24px; font-size: 14px; line-height: 1.6; }
          .badge { display: inline-block; padding: 3px 8px; font-size: 10px; font-weight: 800; border-radius: 9999px; text-transform: uppercase; color: white; margin-bottom: 12px; }
          .badge.critical { background: #ef4444; }
          .badge.warning { background: #f59e0b; }
          .badge.info { background: #3b82f6; }
          .details { background: #f1f5f9; padding: 14px; border-radius: 8px; margin-top: 16px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; }
          .footer { text-align: center; font-size: 10px; color: #94a3b8; padding: 16px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header ${level}">
            MonitorPro SRE Gateway Alert
          </div>
          <div class="content">
            <span class="badge ${level}">${level}</span>
            <div style="font-weight: 800; font-size: 15px; margin-bottom: 8px;">Anomalous Site Event Discovered!</div>
            <p>During the automated real-time SRE check, our monitoring system flagged a state exception on the target host.</p>
            
            <div class="details">
              <strong>URL:</strong> ${url}<br>
              <strong>Category:</strong> ${category.toUpperCase()}<br>
              <strong>Alert Message:</strong> ${message}<br>
              <strong>Detected At:</strong> ${time} UTC
            </div>
            
            <p style="margin-top: 16px;">Please log in to your SRE portal to verify details and run live traceroutes.</p>
          </div>
          <div class="footer">
            MonitorPro Node SRE Module • Authorized email dispatch
          </div>
        </div>
      </body>
      </html>
    `;

    logEmailDelivery(recipient, subject, html);

    // If hostUser and hostPass are set, dispatch via real SMTP transporter
    if (hostUser && hostPass) {
      try {
        const isGmail = hostUser.toLowerCase().includes("@gmail.com");
        const transporter = nodemailer.createTransport({
          host: isGmail ? 'smtp.gmail.com' : (process.env.EMAIL_HOST || 'localhost'),
          port: isGmail ? 587 : (parseInt(process.env.EMAIL_PORT) || 25),
          secure: !isGmail && process.env.EMAIL_USE_SSL === 'true',
          auth: { user: hostUser, pass: hostPass }
        });

        await transporter.sendMail({
          from: hostUser,
          to: recipient,
          subject,
          html
        });
        console.log(`✉️ SRE SMTP alert email sent to ${recipient} successfully via nodemailer.`);
      } catch (err) {
        console.error('❌ Nodemailer SMTP Dispatch failure:', err.message);
      }
    }
  }, 0);
};

// ── Per-website alert email sender (NEW — does not modify existing sendAlertEmail) ──

/**
 * Send an alert email to the configured email for a specific website.
 * Reads per-site config from WebsiteEmailConfig.
 * Supports batched multi-issue emails and logs to EmailAlertHistory.
 *
 * @param {string} url - The monitored website URL.
 * @param {string} category - Alert category.
 * @param {string} level - 'info' | 'warning' | 'critical'
 * @param {string} message - Alert message.
 * @param {Array}  [extraIssues] - Optional array of {category, level, message} for batching.
 */
const sendAlertEmailToWebsite = async (url, category, level, message, extraIssues = []) => {
  setTimeout(async () => {
    try {
      const { WebsiteEmailConfig, EmailAlertHistory } = require('../models/Schemas');

      // Load per-site config
      const config = await WebsiteEmailConfig.findOne({ url });
      if (!config || !config.alertsEnabled || !config.alertEmail) return;

      // Check frequency throttle for non-instant modes
      if (config.alertFrequency !== 'instant' && config.lastEmailSent) {
        const now = Date.now();
        const last = new Date(config.lastEmailSent).getTime();
        const hoursSince = (now - last) / (1000 * 60 * 60);
        if (config.alertFrequency === 'daily'  && hoursSince < 24) return;
        if (config.alertFrequency === 'weekly' && hoursSince < 168) return;
      }

      // Load global SMTP settings
      const globalSettingsPath = path.join(__dirname, '../../../../sre_settings.json');
      let smtpSettings = { email_host_user: '', email_host_password: '' };
      try {
        if (fs.existsSync(globalSettingsPath)) {
          smtpSettings = { ...smtpSettings, ...JSON.parse(fs.readFileSync(globalSettingsPath, 'utf8')) };
        }
      } catch (e) {}

      const recipient = config.alertEmail;
      const hostUser  = smtpSettings.email_host_user;
      const hostPass  = smtpSettings.email_host_password;

      // Build issue list (current + batched extras)
      const allIssues = [{ category, level, message }, ...extraIssues];
      const hasMultiple = allIssues.length > 1;
      const topLevel = allIssues.some(i => i.level === 'critical') ? 'critical' : allIssues.some(i => i.level === 'warning') ? 'warning' : 'info';

      const subject = hasMultiple
        ? `[Website Monitor] ${allIssues.length} Issues Found — ${url}`
        : `[Website Monitor] ${level.charAt(0).toUpperCase() + level.slice(1)} Alert — ${url}`;

      const levelColor = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
      const issuesHtml = allIssues.map(issue => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;">
            <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:800;color:white;background:${levelColor[issue.level] || '#6366f1'};text-transform:uppercase;">${issue.level}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-weight:700;color:#334155;font-size:12px;">${issue.category.toUpperCase()}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;color:#475569;font-size:12px;">${issue.message}</td>
        </tr>`).join('');

      const recommendationsHtml = allIssues.map(issue => {
        const recs = {
          uptime:      'Check your hosting server immediately. Verify server health and restart if needed.',
          ssl:         'Renew your SSL certificate before expiry. Contact your SSL provider urgently.',
          seo:         'Review your page metadata — add missing titles, descriptions, and ALT tags.',
          security:    'Review your HTTP security headers and enable CSP, HSTS, and X-Frame-Options.',
          performance: 'Optimise images, minify scripts, and enable caching to improve load times.',
          wordpress:   'Update WordPress core, plugins, and themes. Check for vulnerabilities.',
        };
        return `<li style="margin-bottom:6px;color:#475569;font-size:12px;">${recs[issue.category] || 'Review the issue and take corrective action.'}</li>`;
      }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;padding:20px;color:#1e293b;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 6px rgba(0,0,0,0.05);overflow:hidden;">
          <div style="background:${levelColor[topLevel]};color:white;padding:20px 24px;">
            <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;opacity:0.85;margin-bottom:4px;">Website Monitor Alert</div>
            <div style="font-size:18px;font-weight:800;">${hasMultiple ? `${allIssues.length} Issues Detected` : message}</div>
          </div>
          <div style="padding:24px;">
            <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:12px;">
              <strong>Website:</strong> <a href="${url}" style="color:#4f46e5;">${url}</a><br>
              <strong>Detected At:</strong> ${new Date().toLocaleString()}<br>
              <strong>Severity:</strong> ${topLevel.toUpperCase()}
            </div>
            ${hasMultiple ? `
            <h3 style="font-size:13px;font-weight:800;color:#0f172a;margin:0 0 10px;">Issues Found</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
              <thead><tr style="background:#f8fafc;">
                <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Severity</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Category</th>
                <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;border-bottom:2px solid #e2e8f0;">Details</th>
              </tr></thead>
              <tbody>${issuesHtml}</tbody>
            </table>` : `<p style="color:#475569;font-size:13px;margin:0 0 20px;">${message}</p>`}
            <h3 style="font-size:13px;font-weight:800;color:#0f172a;margin:0 0 8px;">Recommendations</h3>
            <ul style="padding-left:20px;margin:0 0 20px;">${recommendationsHtml}</ul>
          </div>
          <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:14px 24px;font-size:10px;color:#94a3b8;text-align:center;">
            MonitorPro SRE Dashboard · Automated Alert System · <a href="${url}" style="color:#6366f1;">View Site</a>
          </div>
        </div>
      </body></html>`;

      let delivered = false;
      if (hostUser && hostPass) {
        try {
          const nodemailer = require('nodemailer');
          const isGmail = hostUser.toLowerCase().includes('@gmail.com');
          const transporter = nodemailer.createTransport({
            host: isGmail ? 'smtp.gmail.com' : (process.env.EMAIL_HOST || 'localhost'),
            port: isGmail ? 587 : (parseInt(process.env.EMAIL_PORT) || 25),
            secure: !isGmail && process.env.EMAIL_USE_SSL === 'true',
            auth: { user: hostUser, pass: hostPass }
          });
          await transporter.sendMail({ from: hostUser, to: recipient, subject, html });
          delivered = true;
          console.log(`✉️ Per-site alert sent to ${recipient} for ${url}`);
        } catch (err) {
          console.error(`❌ Per-site email dispatch failed for ${url}:`, err.message);
        }
      }

      // Log to EmailAlertHistory
      await EmailAlertHistory.create({ url, alertEmail: recipient, alertType: category, level: topLevel, subject, message: allIssues.map(i => i.message).join(' | '), delivered });

      // Update config stats (plain update — works with both MongoDB and in-memory)
      const existing = await WebsiteEmailConfig.findOne({ url });
      if (existing) {
        await WebsiteEmailConfig.findOneAndUpdate(
          { url },
          { lastEmailSent: new Date(), totalEmailsSent: (existing.totalEmailsSent || 0) + 1, lastAlertType: category },
          { upsert: false }
        );
      }

      logEmailDelivery(recipient, subject, html);
    } catch (err) {
      console.error('❌ sendAlertEmailToWebsite error:', err.message);
    }
  }, 0);
};

module.exports = { sendAlertEmail, sendAlertEmailToWebsite };
