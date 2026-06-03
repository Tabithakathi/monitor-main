const mongoose = require('mongoose');

// ── Real Mongoose Schema Definitions ─────────────────────────────────────────
const monitorHistorySchema = new mongoose.Schema({
  url: { type: String, required: true },
  isUp: { type: Boolean, required: true },
  statusCode: { type: Number },
  loadTimeMs: { type: Number },
  ttfbMs: { type: Number },
  dnsResolutionTimeMs: { type: Number },
  ssl: {
    valid: { type: Boolean },
    daysRemaining: { type: Number },
    issuer: { type: String },
    expiryDate: { type: Date }
  },
  errors: [{ type: String }],
  seoData: { type: String },
  performanceData: { type: String },
  uiUxData: { type: String },
  securityData: { type: String },
  pageAnalysisData: { type: String },
  malwareData: { type: String },
  checkedAt: { type: Date, default: Date.now }
});

const wordpressMonitorSchema = new mongoose.Schema({
  url: { type: String, required: true },
  healthScore: { type: Number, default: 100 },
  coreVersion: { type: String },
  hasUpdate: { type: Boolean, default: false },
  xmlrpcEnabled: { type: Boolean, default: false },
  usersEnumerationExposed: { type: Boolean, default: false },
  enumeratedUsers: [{ type: String }],
  plugins: [{
    name: { type: String },
    slug: { type: String },
    version: { type: String },
    status: { type: String, enum: ['active', 'inactive', 'conflict'] },
    hasUpdate: { type: Boolean, default: false },
    hasVulnerability: { type: Boolean, default: false },
    vulnerabilityDetails: { type: String }
  }],
  themes: [{
    name: { type: String },
    slug: { type: String },
    version: { type: String },
    hasUpdate: { type: Boolean, default: false }
  }],
  adminAccessible: { type: Boolean, default: true },
  databaseConnected: { type: Boolean, default: true },
  wpDebugActive: { type: Boolean, default: false },
  debugLogsCount: { type: Number, default: 0 },
  pagesCrawled: [{
    url: { type: String },
    title: { type: String },
    statusCode: { type: Number },
    loadTimeMs: { type: Number },
    isUp: { type: Boolean }
  }],
  databaseHealth: {
    connected: { type: Boolean, default: true },
    latencyMs: { type: Number, default: 0 },
    engine: { type: String, default: 'MySQL' },
    status: { type: String, default: 'Healthy' },
    sizeMb: { type: Number, default: 0 },
    tableCount: { type: Number, default: 0 }
  },
  brokenLinks: [{
    url: { type: String },
    sourcePage: { type: String },
    statusCode: { type: Number },
    reason: { type: String },
    isInternal: { type: Boolean }
  }],
  formsAudited: [{
    formId: { type: String },
    actionUrl: { type: String },
    method: { type: String },
    inputsCount: { type: Number },
    hasCsrf: { type: Boolean },
    isInsecureSubmit: { type: Boolean },
    status: { type: String }
  }],
  googleAnalytics: {
    active: { type: Boolean, default: false },
    measurementId: { type: String, default: '' },
    tagType: { type: String, default: 'none' },
    status: { type: String, default: 'Not Found' }
  },
  lastChecked: { type: Date, default: Date.now }
});

const alertSchema = new mongoose.Schema({
  url: { type: String, required: true },
  category: { type: String, required: true },
  level: { type: String, enum: ['info', 'warning', 'critical'], required: true },
  message: { type: String, required: true },
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date }
});

const RealMonitorHistory = mongoose.model('RealMonitorHistory', monitorHistorySchema);
const RealWordPressMonitor = mongoose.model('RealWordPressMonitor', wordpressMonitorSchema);
const RealAlert = mongoose.model('RealAlert', alertSchema);

// ── In-Memory Datastore Fallback Layer ───────────────────────────────────────
let inMemoryHistory = [];
let inMemoryWordPress = [];
let inMemoryAlerts = [];

const isConnected = () => mongoose.connection.readyState === 1;

// ── 1. MonitorHistory Mock Wrapper ───────────────────────────────────────────
const MonitorHistory = {
  create: async (data) => {
    if (isConnected()) return await RealMonitorHistory.create(data);
    const log = { 
      ...data, 
      _id: 'history_' + Math.random().toString(36).substr(2, 9), 
      checkedAt: data.checkedAt || new Date() 
    };
    inMemoryHistory.unshift(log);
    return log;
  },
  insertMany: async (arr) => {
    if (isConnected()) return await RealMonitorHistory.insertMany(arr);
    const logs = arr.map(data => ({
      ...data,
      _id: 'history_' + Math.random().toString(36).substr(2, 9),
      checkedAt: data.checkedAt || new Date()
    }));
    inMemoryHistory = [...logs, ...inMemoryHistory];
    return logs;
  },
  find: (query = {}) => {
    const isConn = isConnected();
    const filterData = () => {
      let res = inMemoryHistory;
      if (query.url) {
        res = res.filter(item => item.url === query.url);
      }
      return res;
    };
    return {
      sort: (sortQuery) => ({
        limit: async (lim) => {
          if (isConn) return await RealMonitorHistory.find(query).sort(sortQuery).limit(lim);
          return filterData().slice(0, lim);
        }
      }),
      then: async (resolve) => {
        if (isConn) return resolve(await RealMonitorHistory.find(query));
        return resolve(filterData());
      }
    };
  },
  countDocuments: async (query = {}) => {
    if (isConnected()) return await RealMonitorHistory.countDocuments(query);
    let res = inMemoryHistory;
    if (query.url) {
      res = res.filter(item => item.url === query.url);
    }
    return res.length;
  }
};

// ── 2. WordPressMonitor Mock Wrapper ─────────────────────────────────────────
const WordPressMonitor = {
  findOne: async (query = {}) => {
    if (isConnected()) return await RealWordPressMonitor.findOne(query);
    return inMemoryWordPress.find(wp => wp.url === query.url) || null;
  },
  create: async (data) => {
    if (isConnected()) return await RealWordPressMonitor.create(data);
    const doc = { ...data, _id: 'wp_' + Math.random().toString(36).substr(2, 9), lastChecked: new Date() };
    inMemoryWordPress.push(doc);
    return doc;
  },
  findOneAndUpdate: async (query, updateData, options = {}) => {
    if (isConnected()) return await RealWordPressMonitor.findOneAndUpdate(query, updateData, options);
    
    let index = inMemoryWordPress.findIndex(wp => wp.url === query.url);
    if (index !== -1) {
      inMemoryWordPress[index] = { ...inMemoryWordPress[index], ...updateData, lastChecked: new Date() };
      return inMemoryWordPress[index];
    } else if (options.upsert) {
      const doc = { ...updateData, url: query.url, _id: 'wp_' + Math.random().toString(36).substr(2, 9), lastChecked: new Date() };
      inMemoryWordPress.push(doc);
      return doc;
    }
    return null;
  },
  deleteOne: async (query = {}) => {
    if (isConnected()) return await RealWordPressMonitor.deleteOne(query);
    const before = inMemoryWordPress.length;
    inMemoryWordPress = inMemoryWordPress.filter(wp => wp.url !== query.url);
    return { deletedCount: before - inMemoryWordPress.length };
  }
};

// ── 3. Alert Mock Wrapper ────────────────────────────────────────────────────
const Alert = {
  create: async (data) => {
    if (isConnected()) return await RealAlert.create(data);
    const alert = {
      ...data,
      _id: 'alert_' + Math.random().toString(36).substr(2, 9),
      resolved: false,
      createdAt: new Date()
    };
    // De-duplicate mock alerts to prevent spamming the dashboard in memory
    const exists = inMemoryAlerts.some(a => a.url === data.url && a.message === data.message && !a.resolved);
    if (!exists) {
      inMemoryAlerts.unshift(alert);
    }
    return alert;
  },
  find: (query = {}) => {
    const isConn = isConnected();
    const filterData = () => {
      let res = inMemoryAlerts;
      if (query.url) {
        res = res.filter(item => item.url === query.url);
      }
      if (query.resolved !== undefined) {
        res = res.filter(item => item.resolved === query.resolved);
      }
      return res;
    };
    return {
      sort: (sortQuery) => ({
        then: async (resolve) => {
          if (isConn) return resolve(await RealAlert.find(query).sort(sortQuery));
          return resolve(filterData());
        }
      }),
      then: async (resolve) => {
        if (isConn) return resolve(await RealAlert.find(query));
        return resolve(filterData());
      }
    };
  },
  findByIdAndUpdate: async (id, updateData, options = {}) => {
    if (isConnected()) return await RealAlert.findByIdAndUpdate(id, updateData, options);
    
    let index = inMemoryAlerts.findIndex(a => a._id === id);
    if (index !== -1) {
      inMemoryAlerts[index] = { ...inMemoryAlerts[index], ...updateData };
      return inMemoryAlerts[index];
    }
    return null;
  },
  deleteMany: async (query = {}) => {
    if (isConnected()) return await RealAlert.deleteMany(query);
    const before = inMemoryAlerts.length;
    inMemoryAlerts = inMemoryAlerts.filter(a => {
      if (query.url && a.url !== query.url) return true;
      if (query.category && a.category !== query.category) return true;
      return false;
    });
    return { deletedCount: before - inMemoryAlerts.length };
  }
};

// ── 4. WebsiteEmailConfig ────────────────────────────────────────────────────
// Stores per-website alert email configuration

const websiteEmailConfigSchema = new mongoose.Schema({
  url:              { type: String, required: true, unique: true },
  alertEmail:       { type: String, default: '' },
  alertsEnabled:    { type: Boolean, default: false },
  alertFrequency:   { type: String, enum: ['instant', 'daily', 'weekly'], default: 'instant' },
  lastEmailSent:    { type: Date, default: null },
  totalEmailsSent:  { type: Number, default: 0 },
  lastAlertType:    { type: String, default: '' },
  updatedAt:        { type: Date, default: Date.now }
});

const RealWebsiteEmailConfig = mongoose.model('RealWebsiteEmailConfig', websiteEmailConfigSchema);
let inMemoryEmailConfig = [];

const WebsiteEmailConfig = {
  findOne: async (query = {}) => {
    if (isConnected()) return await RealWebsiteEmailConfig.findOne(query);
    return inMemoryEmailConfig.find(c => c.url === query.url) || null;
  },
  findOneAndUpdate: async (query, updateData, options = {}) => {
    if (isConnected()) return await RealWebsiteEmailConfig.findOneAndUpdate(query, updateData, options);
    let index = inMemoryEmailConfig.findIndex(c => c.url === query.url);
    if (index !== -1) {
      inMemoryEmailConfig[index] = { ...inMemoryEmailConfig[index], ...updateData, updatedAt: new Date() };
      return inMemoryEmailConfig[index];
    } else if (options.upsert) {
      const doc = { url: query.url, alertEmail: '', alertsEnabled: false, alertFrequency: 'instant', totalEmailsSent: 0, lastAlertType: '', updatedAt: new Date(), _id: 'econf_' + Math.random().toString(36).substr(2, 9), ...updateData };
      inMemoryEmailConfig.push(doc);
      return doc;
    }
    return null;
  },
  find: async (query = {}) => {
    if (isConnected()) return await RealWebsiteEmailConfig.find(query);
    return inMemoryEmailConfig;
  },
};

// ── 5. EmailAlertHistory ─────────────────────────────────────────────────────
// Stores every email alert sent for audit / admin dashboard display

const emailAlertHistorySchema = new mongoose.Schema({
  url:         { type: String, required: true },
  alertEmail:  { type: String, required: true },
  alertType:   { type: String, required: true },   // e.g. 'uptime', 'ssl', 'seo'
  level:       { type: String, required: true },   // 'info' | 'warning' | 'critical'
  subject:     { type: String, required: true },
  message:     { type: String, required: true },
  delivered:   { type: Boolean, default: false },
  sentAt:      { type: Date, default: Date.now }
});

const RealEmailAlertHistory = mongoose.model('RealEmailAlertHistory', emailAlertHistorySchema);
let inMemoryEmailHistory = [];

const EmailAlertHistory = {
  create: async (data) => {
    if (isConnected()) return await RealEmailAlertHistory.create(data);
    const doc = { ...data, _id: 'emailhist_' + Math.random().toString(36).substr(2, 9), sentAt: new Date() };
    inMemoryEmailHistory.unshift(doc);
    return doc;
  },
  find: (query = {}) => {
    const isConn = isConnected();
    const filterData = () => {
      let res = inMemoryEmailHistory;
      if (query.url) res = res.filter(e => e.url === query.url);
      return res;
    };
    return {
      sort: (s) => ({
        limit: async (lim) => {
          if (isConn) return await RealEmailAlertHistory.find(query).sort(s).limit(lim);
          return filterData().slice(0, lim);
        },
        then: async (resolve) => {
          if (isConn) return resolve(await RealEmailAlertHistory.find(query).sort(s));
          return resolve(filterData());
        }
      }),
      then: async (resolve) => {
        if (isConn) return resolve(await RealEmailAlertHistory.find(query));
        return resolve(filterData());
      }
    };
  },
  countDocuments: async (query = {}) => {
    if (isConnected()) return await RealEmailAlertHistory.countDocuments(query);
    let res = inMemoryEmailHistory;
    if (query.url) res = res.filter(e => e.url === query.url);
    return res.length;
  }
};

module.exports = {
  MonitorHistory,
  WordPressMonitor,
  Alert,
  WebsiteEmailConfig,
  EmailAlertHistory
};
