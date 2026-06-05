import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { ShieldCheck, ShieldAlert, Activity, Cpu, Search, RefreshCw, AlertTriangle, AlertCircle, BellRing, Sun, Moon, X, Clock, Star } from 'lucide-react';
import UptimeDashboard from './components/UptimeDashboard';
import WordPressDashboard from './components/WordPressDashboard';
import SSLMonitor from './components/SSLMonitor';
import SeoDashboard from './components/SeoDashboard';
import AccessibilityAudit from './components/AccessibilityAudit';
import SettingsPanel from './components/SettingsPanel';
import SiteAnalysisDashboard from './components/SiteAnalysisDashboard';
import AdminDashboard from './components/AdminDashboard';
import EmailAlertSettings from './components/EmailAlertSettings';
import MalwareReport from './components/MalwareReport';
import ImageOptimization from './components/ImageOptimization';
import AdminLogin from './components/AdminLogin';


const API_BASE = '/api';

// Helper to normalize URLs for WebSocket event comparisons
const normalizeUrlString = (u) => {
  if (!u) return '';
  return u.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
};

export default function App() {
  const [url, setUrl] = useState('https://wordpress.org');
  const [stats, setStats] = useState(null);
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [crawlData, setCrawlData] = useState(null);
  const [crawlLoading, setCrawlLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);

  // ── NEW: Search autocomplete state ──────────────────────────────────────────
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownItems, setDropdownItems] = useState([]);
  const [dropdownSelectedIndex, setDropdownSelectedIndex] = useState(-1);
  const searchRef = useRef(null);
  const [searchHistory, setSearchHistory] = useState([]);

  // Authentication State for Admin Dashboard protection
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminUser, setAdminUser] = useState('');
  const [loginTime, setLoginTime] = useState('');

  // ΓöÇΓöÇ NEW: Navigate-to-SiteAnalysis-ALT callback (passed to SeoDashboard) ΓöÇΓöÇ
  const [siteAnalysisAltHighlight, setSiteAnalysisAltHighlight] = useState(false);

  const handleNavigateToAlt = useCallback(() => {
    setActiveTab('site_analysis');
    setSiteAnalysisAltHighlight(true);
    // auto-clear highlight after 3s
    setTimeout(() => setSiteAnalysisAltHighlight(false), 3000);
    // Scroll to top so SiteAnalysis is visible
    setTimeout(() => {
      const el = document.getElementById('alt-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }, []);

  // Fetch unique audited SRE target list
  const fetchTargets = async () => {
    try {
      const response = await axios.get(`${API_BASE}/targets`);
      setTargets(response.data);
    } catch (err) {
      console.error("Failed to fetch SRE audited targets:", err);
    }
  };
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('uptime');
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Load auth from localStorage on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('sre_auth_valid');
    const savedUser = localStorage.getItem('sre_auth_user');
    const savedTime = localStorage.getItem('sre_auth_time');
    if (savedAuth === 'true' && savedUser) {
      setIsAuthenticated(true);
      setAdminUser(savedUser);
      setLoginTime(savedTime || new Date().toLocaleString());
    }
  }, []);

  const handleLoginSuccess = (username, remember) => {
    const timeStr = new Date().toLocaleString();
    setIsAuthenticated(true);
    setAdminUser(username);
    setLoginTime(timeStr);
    if (remember) {
      localStorage.setItem('sre_auth_valid', 'true');
      localStorage.setItem('sre_auth_user', username);
      localStorage.setItem('sre_auth_time', timeStr);
    }
    showToast(`Welcome back, ${username}!`, 'success');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminUser('');
    setLoginTime('');
    localStorage.removeItem('sre_auth_valid');
    localStorage.removeItem('sre_auth_user');
    localStorage.removeItem('sre_auth_time');
    setActiveTab('uptime');
    showToast('Logged out of Admin Portal.', 'info');
  };

  // Fetch search history on mount
  const fetchSearchHistory = async () => {
    try {
      const response = await axios.get(`${API_BASE}/search-history`);
      setSearchHistory(response.data || []);
    } catch (err) {
      console.error("Failed to fetch search history:", err);
    }
  };

  useEffect(() => {
    fetchSearchHistory();
  }, []);

  const dropdownGroups = React.useMemo(() => {
    const query = url.toLowerCase().trim().replace(/^https?:\/\//i, '');
    
    // 1. Favorites/Pinned
    const favs = targets.filter(t => t.isFavorite);
    const filteredFavs = query 
      ? favs.filter(t => t.url.toLowerCase().includes(query) || (t.name && t.name.toLowerCase().includes(query)))
      : favs;

    // 2. Most Monitored (sorted by scanCount desc, showing top 5)
    // Filter out duplicates that might be in Favorites
    const monitoredList = [...targets]
      .sort((a, b) => (b.scanCount || 0) - (a.scanCount || 0))
      .filter(t => !t.isFavorite)
      .slice(0, 5);
    const filteredMonitored = query
      ? [...targets]
          .sort((a, b) => (b.scanCount || 0) - (a.scanCount || 0))
          .filter(t => t.url.toLowerCase().includes(query) || (t.name && t.name.toLowerCase().includes(query)))
          .slice(0, 5)
      : monitoredList;

    // 3. Recent Searches (from searchHistory, showing top 5)
    const filteredRecent = query
      ? searchHistory.filter(h => h.query.toLowerCase().includes(query)).slice(0, 5)
      : searchHistory.slice(0, 5);

    // Flatten for keyboard navigation
    const flat = [];
    filteredFavs.forEach(t => flat.push({ type: 'website', data: t }));
    filteredMonitored.forEach(t => flat.push({ type: 'website', data: t }));
    filteredRecent.forEach(h => flat.push({ type: 'history', data: h }));

    return {
      favorites: filteredFavs,
      monitored: filteredMonitored,
      recent: filteredRecent,
      flat
    };
  }, [url, targets, searchHistory]);

  const toggleFavorite = async (website) => {
    try {
      const response = await axios.post(`${API_BASE}/scanned-websites/favorite`, {
        url: website.url,
        isFavorite: !website.isFavorite
      });
      if (response.data.success) {
        showToast(
          !website.isFavorite ? `Pinned ${website.url} to favorites` : `Removed ${website.url} from favorites`,
          'success'
        );
        fetchTargets();
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to update favorite status.', 'error');
    }
  };

  const renderDropdownWebsiteRow = (t, isSelected, flatIndex) => {
    let hostname = t.url;
    try { hostname = new URL(t.url).hostname; } catch (e) {}
    
    return (
      <button
        key={`web-${t.url}-${t.isFavorite}`}
        type="button"
        className={`w-full flex items-center gap-3 px-3.5 py-2 transition-colors text-left group relative ${isSelected ? 'bg-indigo-650/15 text-indigo-300 border-l-2 border-indigo-500' : 'hover:bg-slate-800/40'}`}
        onMouseDown={(e) => {
          if (e.target.closest('.star-btn')) return;
          e.preventDefault();
          setUrl(t.url);
          setShowDropdown(false);
          fetchStats(t.url);
        }}
        onMouseEnter={() => setDropdownSelectedIndex(flatIndex)}
      >
        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${t.isUp ? 'bg-emerald-450' : 'bg-rose-500'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold truncate transition-colors ${isSelected ? 'text-indigo-300' : 'text-slate-200 group-hover:text-indigo-400'}`}>
            {t.name || hostname}
          </p>
          <p className="text-[8px] text-slate-500 font-mono truncate">{t.url}</p>
        </div>

        {t.scanCount > 1 && (
          <span className="shrink-0 text-[8px] font-bold text-slate-500 bg-slate-850 px-1.5 py-0.5 rounded-full">
            {t.scanCount} scans
          </span>
        )}

        <button
          type="button"
          className="star-btn p-1 rounded-md text-slate-500 hover:text-amber-400 hover:bg-slate-800/60 transition-all cursor-pointer relative z-10"
          title={t.isFavorite ? "Unpin site" : "Pin site"}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFavorite(t);
          }}
        >
          <Star className={`h-3 w-3 ${t.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-slate-650 hover:text-amber-450'}`} />
        </button>
      </button>
    );
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Effect to toggle light/dark theme class on document.body dynamically
  useEffect(() => {
    if (isDark) {
      document.body.classList.remove('light-theme');
    } else {
      document.body.classList.add('light-theme');
    }
  }, [isDark]);

  // Resilient client-side 15-second SRE auto-polling loop
  useEffect(() => {
    if (!autoRefresh || !url) return;

    const interval = setInterval(() => {
      fetchStats(urlRef.current);
    }, 15000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Ref to hold the latest url so the socket closures can access it without reconnects
  const urlRef = useRef(url);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  // Custom Toast notification states
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetch telemetry details from Express backend with TLD normalizations
  const fetchStats = async (targetUrl = url) => {
    setLoading(true);
    setError(null);
    
    // Normalize .in, .org, .com links by prepending protocol schema if absent
    let formattedUrl = targetUrl.trim();
    if (formattedUrl && !/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }
    
    try {
      const response = await axios.get(`${API_BASE}/stats?url=${encodeURIComponent(formattedUrl)}`);
      setStats(response.data);
      if (formattedUrl !== url) {
        setUrl(formattedUrl);
      }
      if (formattedUrl.trim()) {
        axios.post(`${API_BASE}/search-history`, { query: formattedUrl.trim() })
          .then(() => fetchSearchHistory())
          .catch(() => {});
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch dashboard SRE metrics. Please check network connectivity or Vercel serverless function logs.');
    } finally {
      setLoading(false);
    }
  };

  // Trigger an immediate, concurrent SRE audit run
  const handleRunAudit = async () => {
    if (!url) {
      showToast('Please specify a valid website URL', 'error');
      return;
    }

    let formattedUrl = url.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    setAuditLoading(true);

    // ΓöÇΓöÇ Scan performance logging ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
    const scanStart = performance.now();
    console.group(`≡ƒöì SRE Scan Performance ΓÇö ${formattedUrl}`);
    console.log(`Γû╢ Scan Started: ${new Date().toISOString()}`);
    console.log(`  Target: ${formattedUrl}`);

    // Animated scan progress steps
    const STEPS = [
      { label: 'Scanning Website',      pct: 8  },
      { label: 'Checking Pages',         pct: 18 },
      { label: 'Checking SEO',           pct: 32 },
      { label: 'Checking SSL',           pct: 45 },
      { label: 'Checking Performance',   pct: 58 },
      { label: 'Checking Images',        pct: 68 },
      { label: 'Checking Links',         pct: 78 },
      { label: 'Running Security Scan',  pct: 88 },
      { label: 'Generating Report',      pct: 96 },
    ];
    let stepIdx = 0;
    setScanProgress({ label: STEPS[0].label, pct: STEPS[0].pct });
    const stepTimer = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, STEPS.length - 1);
      setScanProgress({ label: STEPS[stepIdx].label, pct: STEPS[stepIdx].pct });
      const elapsed = ((performance.now() - scanStart) / 1000).toFixed(2);
      console.log(`  ΓÅ▒ [${elapsed}s] ${STEPS[stepIdx].label}...`);
    }, 900);

    try {
      const response = await axios.post(`${API_BASE}/audit`, { url: formattedUrl });
      clearInterval(stepTimer);
      setScanProgress({ label: 'Scan Complete!', pct: 100 });

      // ΓöÇΓöÇ Log scan completion ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
      const scanEnd = performance.now();
      const totalDuration = ((scanEnd - scanStart) / 1000).toFixed(2);
      console.log(`Γ£à Scan Finished: ${new Date().toISOString()}`);
      console.log(`ΓÅ│ Total Scan Duration: ${totalDuration}s`);
      console.groupEnd();

      if (response.data.success) {
        setTimeout(() => setScanProgress(null), 1200);
        showToast(`Scan completed in ${totalDuration}s`, 'success');
        if (response.data.stats) {
          setStats(response.data.stats);
        }
        fetchTargets();
        axios.post(`${API_BASE}/search-history`, { query: formattedUrl.trim() })
          .then(() => fetchSearchHistory())
          .catch(() => {});

        setCrawlData(null);
        setCrawlLoading(true);
        const crawlStart = performance.now();
        console.log(`≡ƒò╖ Crawl started for ${formattedUrl}`);
        axios.post(`${API_BASE}/crawl`, { url: formattedUrl })
          .then(crawlResp => {
            if (crawlResp.data.success) setCrawlData(crawlResp.data);
            console.log(`≡ƒò╖ Crawl finished in ${((performance.now() - crawlStart) / 1000).toFixed(2)}s`);
          })
          .catch(() => {})
          .finally(() => setCrawlLoading(false));
      }
    } catch (err) {
      clearInterval(stepTimer);
      setScanProgress(null);
      const scanEnd = performance.now();
      console.error(`Γ¥î Scan failed after ${((scanEnd - scanStart) / 1000).toFixed(2)}s`, err);
      console.groupEnd();
      showToast(err.response?.data?.error || 'Scan execution failed.', 'error');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTargets();

    // Establish Socket.io connection to backend SRE Gateway
    const isLocalDev = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const socketUrl = isLocalDev
      ? 'http://localhost:5000'
      : 'https://monitoring-main-main1.onrender.com';
    const socket = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      console.log('≡ƒôí Connected to SRE WebSocket Broadcast Portal');
      setIsSocketConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Γ¥î Disconnected from SRE WebSocket Broadcast Portal');
      setIsSocketConnected(false);
    });

    // Handle live micro-telemetry ping ticks
    socket.on('liveTelemetry', (beat) => {
      const normalizedCurrent = normalizeUrlString(urlRef.current);
      const normalizedBeat = normalizeUrlString(beat.url);

      if (normalizedCurrent === normalizedBeat) {
        setStats((prev) => {
          if (!prev) return prev;

          // Prepend new beat to history and keep last 30 entries
          const updatedHistory = [beat, ...prev.historyLog].slice(0, 30);

          return {
            ...prev,
            latestStatus: {
              ...prev.latestStatus,
              isUp: beat.isUp,
              statusCode: beat.statusCode,
              loadTimeMs: beat.loadTimeMs,
              ttfbMs: beat.ttfbMs,
              dnsResolutionTimeMs: beat.dnsResolutionTimeMs,
              checkedAt: beat.checkedAt
            },
            historyLog: updatedHistory
          };
        });
      }
    });

    // Handle full deep-audit completes (cron or manual run on another terminal)
    socket.on('auditCompleted', (freshStats) => {
      fetchTargets();
      const normalizedCurrent = normalizeUrlString(urlRef.current);
      const normalizedAudit = normalizeUrlString(freshStats.url);

      if (normalizedCurrent === normalizedAudit) {
        setStats(freshStats);
        showToast('Real-time SRE audit synchronized!', 'success');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Map/align backend schema variables to the custom props structure requested by user
  if (stats) {
    if (!stats.sslData) stats.sslData = stats.latestStatus?.ssl;
    if (!stats.securityData) stats.securityData = stats.latestStatus?.security;
    if (!stats.seoData) stats.seoData = stats.latestStatus?.seo;
    if (!stats.uiUxData) stats.uiUxData = stats.latestStatus?.uiUx;
    if (!stats.pageAnalysisData) stats.pageAnalysisData = stats.latestStatus?.pageAnalysis;
    if (!stats.malwareData) stats.malwareData = stats.latestStatus?.malware;
  }

  return (
    <div className="min-h-screen text-slate-100 font-sans pb-12 relative overflow-hidden">

      {/* Premium Ambient Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[55%] rounded-full bg-indigo-600/8 blur-[130px] pointer-events-none pulse-glow-indigo"></div>
      <div className="absolute bottom-[-5%] right-[-5%] w-[45%] h-[50%] rounded-full bg-purple-600/8 blur-[130px] pointer-events-none pulse-glow-indigo" style={{ animationDelay: '-2s' }}></div>

      {/* Sleek Dark SRE Navigation Header */}
      <header className="bg-dark-800/80 backdrop-blur-md border-b border-slate-800/60 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-700 to-indigo-500 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-600/25 shrink-0">
                M
              </div>
              <div>
                <h1 className="text-sm font-extrabold tracking-tight">MonitorPro</h1>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block -mt-1">Node SRE Module</span>
              </div>
            </div>
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-xl border border-slate-800 hover:bg-slate-800/60 transition-all text-slate-400 hover:text-slate-200 cursor-pointer shadow-sm hover:scale-105 duration-200"
              title={isDark ? "Switch to Light Theme" : "Switch to Dark Theme"}
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400 animate-pulse" /> : <Moon className="h-4 w-4 text-indigo-500" />}
            </button>
          </div>

          {/* SRE Domain search filter bar */}
          <div className="flex-1 max-w-xl flex gap-2">
            <div className="relative flex-1 group" ref={searchRef} onMouseEnter={() => setShowDropdown(true)}>
              <div className="bg-dark-900 border border-slate-800 focus-within:border-indigo-500/50 rounded-xl px-3.5 flex items-center gap-2 w-full transition-all">
                <Search className="text-slate-500 h-4 w-4 shrink-0" />
                <input
                  type="text"
                  placeholder="Enter domain URL (e.g. wordpress.org)"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setShowDropdown(true); }}
                  className="bg-transparent border-none outline-none text-xs w-full text-slate-200 placeholder-slate-600 py-2"
                  onKeyDown={(e) => {
                    const flatList = dropdownGroups.flat;
                    if (e.key === 'Enter') {
                      if (showDropdown && dropdownSelectedIndex >= 0 && dropdownSelectedIndex < flatList.length) {
                        e.preventDefault();
                        const selected = flatList[dropdownSelectedIndex];
                        const targetUrl = selected.type === 'website' ? selected.data.url : selected.data.query;
                        setUrl(targetUrl);
                        setShowDropdown(false);
                        fetchStats(targetUrl);
                      } else {
                        setShowDropdown(false);
                        fetchStats();
                      }
                    }
                    if (e.key === 'ArrowDown') {
                      if (showDropdown && flatList.length > 0) {
                        e.preventDefault();
                        setDropdownSelectedIndex(prev => (prev + 1) % flatList.length);
                      }
                    }
                    if (e.key === 'ArrowUp') {
                      if (showDropdown && flatList.length > 0) {
                        e.preventDefault();
                        setDropdownSelectedIndex(prev => (prev - 1 + flatList.length) % flatList.length);
                      }
                    }
                    if (e.key === 'Escape') {
                      setShowDropdown(false);
                    }
                  }}
                  onFocus={() => setShowDropdown(true)}
                  autoComplete="off"
                />
                {url && (
                  <button onClick={() => { setUrl(''); setShowDropdown(false); }} className="text-slate-600 hover:text-slate-400 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Autocomplete dropdown */}
              {showDropdown && (dropdownGroups.favorites.length > 0 || dropdownGroups.monitored.length > 0 || dropdownGroups.recent.length > 0) && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-[9999] rounded-xl border border-slate-700/80 overflow-hidden shadow-2xl bg-slate-900 sre-dropdown max-h-96 overflow-y-auto">
                  
                  {/* Favorites Section */}
                  {dropdownGroups.favorites.length > 0 && (
                    <div>
                      <div className="px-3 py-1.5 border-b border-slate-800/60 bg-slate-950/20 flex items-center justify-between">
                        <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">⭐ Pinned & Favorites</span>
                      </div>
                      {dropdownGroups.favorites.map((t, index) => {
                        const flatIndex = dropdownGroups.flat.findIndex(f => f.type === 'website' && f.data.url === t.url);
                        const isSelected = flatIndex === dropdownSelectedIndex;
                        return renderDropdownWebsiteRow(t, isSelected, flatIndex);
                      })}
                    </div>
                  )}

                  {/* Most Monitored Section */}
                  {dropdownGroups.monitored.length > 0 && (
                    <div className="border-t border-slate-850/50">
                      <div className="px-3 py-1.5 border-b border-slate-800/60 bg-slate-950/20 flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">📊 Most Scanned</span>
                      </div>
                      {dropdownGroups.monitored.map((t, index) => {
                        const flatIndex = dropdownGroups.flat.findIndex(f => f.type === 'website' && f.data.url === t.url && f.data.isFavorite === t.isFavorite);
                        const isSelected = flatIndex === dropdownSelectedIndex;
                        return renderDropdownWebsiteRow(t, isSelected, flatIndex);
                      })}
                    </div>
                  )}

                  {/* Recent Searches Section */}
                  {dropdownGroups.recent.length > 0 && (
                    <div className="border-t border-slate-850/50">
                      <div className="px-3 py-1.5 border-b border-slate-800/60 bg-slate-950/20 flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-450 uppercase tracking-widest">⏱️ Recent Searches</span>
                      </div>
                      {dropdownGroups.recent.map((h, index) => {
                        const flatIndex = dropdownGroups.flat.findIndex(f => f.type === 'history' && f.data._id === h._id);
                        const isSelected = flatIndex === dropdownSelectedIndex;
                        return (
                          <button
                            key={`hist-${h._id}`}
                            className={`w-full flex items-center gap-3 px-3.5 py-2.5 transition-colors text-left group ${isSelected ? 'bg-indigo-650/15 text-indigo-300' : 'hover:bg-slate-800/40 text-slate-350'}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setUrl(h.query);
                              setShowDropdown(false);
                              fetchStats(h.query);
                            }}
                            onMouseEnter={() => setDropdownSelectedIndex(flatIndex)}
                          >
                            <Clock className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <span className="text-xs font-semibold truncate flex-1">{h.query}</span>
                            <span className="text-[8px] text-slate-650 font-mono">
                              {new Date(h.searchedAt).toLocaleTimeString()}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="px-3 py-1.5 bg-slate-950/40 border-t border-slate-800/40 text-center">
                    <span className="text-[9px] text-slate-600 font-mono">Use ↑ ↓ Keys & Enter to Select · Star to Pin</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => fetchStats()}
              disabled={loading || auditLoading}
              className="px-4 py-2 bg-dark-800 border border-slate-700/80 hover:bg-dark-700/60 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              Filter
            </button>

            <button
              onClick={() => {
                setAutoRefresh(!autoRefresh);
                showToast(
                  !autoRefresh
                    ? '15s SRE auto-polling active.'
                    : 'Auto-polling disabled.',
                  'info'
                );
              }}
              className={`px-4 py-2 border rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${autoRefresh
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-dark-800 border-slate-700/80 hover:bg-dark-700/60'
                }`}
            >
              <span>{autoRefresh ? 'Stop Monitor' : 'Auto-Monitor'}</span>
            </button>

            <button
              onClick={handleRunAudit}
              disabled={loading || auditLoading}
              className="px-5 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-550 hover:to-indigo-450 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-indigo-600/15 flex items-center gap-1.5 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? 'rotate-infinite' : ''}`} />
              <span>{auditLoading ? 'Running Scan...' : 'Run Scan'}</span>
            </button>
          </div>

        </div>
      </header>

      {/* Central workspace contents wrapper */}
      <main className="max-w-7xl mx-auto px-6 mt-8 relative z-10">

        {error && (
          <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex items-center gap-3 text-sm animate-fade-in-up">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <strong>System Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Audit Target Status Header */}
        {stats && (
          <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-card p-6 rounded-2xl animate-fade-in-up">
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1">AUDIT TARGET SOURCE</span>
              <h2 className="text-xl font-extrabold text-slate-200 tracking-tight">{stats.url}</h2>
            </div>

            <div className="flex gap-6">
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Core Status</span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[9px] mt-1.5 tracking-wider ${stats.latestStatus?.isUp ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border border-rose-500/25'}`}>
                  {stats.latestStatus?.isUp ? 'ACTIVE' : 'DOWN'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">WordPress Core</span>
                <span className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[9px] mt-1.5 tracking-wider ${stats.wordpress?.isWordPress ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25' : 'bg-slate-800 text-slate-400 border border-slate-750'}`}>
                  {stats.wordpress?.isWordPress ? 'DETECTED' : 'NONE'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab Module Switcher ΓÇö hidden when Admin Dashboard is active */}
        {activeTab !== 'admin' && (
        <div className="flex flex-wrap border-b border-slate-800/80 mb-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          {[
            { id: 'uptime',        label: 'Uptime & Logs' },
            { id: 'wordpress',     label: 'WordPress CMS' },
            { id: 'ssl',           label: 'SSL & Security' },
            { id: 'seo',           label: 'SEO Optimization' },
            { id: 'accessibility', label: 'Accessibility' },
            { id: 'site_analysis', label: 'Site Analysis' },
            { id: 'email_alerts',  label: 'Email Alerts' },
            { id: 'settings',      label: 'Gmail & Alerts' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 font-bold text-sm uppercase tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        )}

        {/* Admin Dashboard tab button ΓÇö always visible */}
        <div className="flex mb-6 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <button
            onClick={() => setActiveTab(activeTab === 'admin' ? 'uptime' : 'admin')}
            className={`px-5 py-3.5 font-bold text-sm uppercase tracking-wide border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'admin'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {activeTab === 'admin' ? 'ΓåÉ Back to Dashboard' : 'Admin Dashboard'}
          </button>
        </div>

        {/* Dynamic tabs render panel */}
        {activeTab === 'admin' ? (
          isAuthenticated ? (
            <AdminDashboard adminName={adminUser} loginTime={loginTime} onLogout={handleLogout} />
          ) : (
            <AdminLogin onLoginSuccess={handleLoginSuccess} onCancel={() => setActiveTab('uptime')} />
          )
        ) : activeTab === 'settings' ? (
          <SettingsPanel showToast={showToast} />
        ) : activeTab === 'email_alerts' ? (
          <EmailAlertSettings siteUrl={stats?.url || url} showToast={showToast} />
        ) : loading && !stats ? (
          <div className="py-24 text-center animate-fade-in-up">
            <RefreshCw className="h-8 w-8 text-indigo-500 rotate-infinite mx-auto mb-4" />
            <h4 className="font-extrabold text-slate-300">Synchronizing SRE monitoring telemetry...</h4>
            <p className="text-xs text-slate-500 mt-1">Fetching local histories and alert logs from MongoDB</p>
          </div>
        ) : stats ? (
          <div className="space-y-8">
            {activeTab === 'uptime' && (
              <UptimeDashboard stats={stats} isSocketConnected={isSocketConnected} onNavigateToAlt={handleNavigateToAlt} />
            )}
            {activeTab === 'wordpress' && (
              <WordPressDashboard wordpressData={stats.wordpress} />
            )}
            {activeTab === 'ssl' && (
              <SSLMonitor sslData={stats?.sslData} securityData={stats?.securityData} />
            )}
            {activeTab === 'seo' && (
              <SeoDashboard seoData={stats?.seoData} crawlData={crawlData} onNavigateToAlt={handleNavigateToAlt} />
            )}
            {activeTab === 'accessibility' && (
              <AccessibilityAudit 
                uiUxData={stats?.uiUxData}
                mobileFriendliness={stats?.seoData?.mobileFriendliness}
              />
            )}
            {activeTab === 'site_analysis' && (
              <SiteAnalysisDashboard
                pageAnalysisData={stats?.pageAnalysisData}
                seoData={stats?.seoData}
                activeAlerts={stats?.activeAlerts}
                crawlData={crawlData}
                crawlLoading={crawlLoading}
                altHighlight={siteAnalysisAltHighlight}
              />
            )}
            {activeTab === 'malware' && (
              <MalwareReport malwareData={stats?.malwareData} />
            )}
            {activeTab === 'images' && (
              <ImageOptimization seoData={stats?.seoData} crawlData={crawlData} />
            )}
          </div>
        ) : (
          <div className="py-24 text-center glass-card border-dashed border-slate-800 rounded-3xl max-w-3xl mx-auto my-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <Activity className="h-10 w-10 text-slate-650 mx-auto mb-4 animate-pulse" />
            <h4 className="font-extrabold text-slate-400">Auditer state is empty</h4>
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">Please enter a valid website URL in the topbar above and click <strong className="text-indigo-455">Run Scan</strong> to launch crawler passes.</p>
          </div>
        )}

        {/* Targets Switcher Pill Bar at the Bottom */}
        <div className="mt-12 pt-6 border-t border-slate-800/80 animate-fade-in-up">
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-2.5">Audited Targets (Previous Links Scan History)</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {targets.length === 0 ? (
              <span className="text-xs text-slate-500 italic">No targets audited yet. Enter a URL above and click Run Scan.</span>
            ) : (
              targets.map((tgt) => {
                const isActive = normalizeUrlString(url) === normalizeUrlString(tgt.url);
                return (
                  <button
                    key={tgt.url}
                    onClick={() => {
                      setUrl(tgt.url);
                      fetchStats(tgt.url);
                    }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0 ${
                      isActive 
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-md shadow-indigo-500/5' 
                        : 'bg-dark-800/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tgt.isUp ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
                    <span>{tgt.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

      </main>

      {/* Scan Progress Overlay */}
      {scanProgress && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="glass-card rounded-2xl p-8 w-full max-w-sm mx-4 text-center shadow-2xl">
            <div className="mb-5">
              <div className="h-14 w-14 rounded-full bg-indigo-600/20 border-2 border-indigo-500 flex items-center justify-center mx-auto mb-3">
                <RefreshCw className="h-7 w-7 text-indigo-400 rotate-infinite" />
              </div>
              <h3 className="text-slate-200 font-extrabold text-base">Scanning Website</h3>
              <p className="text-xs text-slate-400 mt-1 truncate">{url}</p>
            </div>

            {/* Step label */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
              <span className="text-sm font-bold text-indigo-300">
                ≡ƒöì {scanProgress.label}...
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700 mb-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-700 ease-out"
                style={{ width: `${scanProgress.pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-bold">
              <span>0%</span>
              <span className={`font-black ${scanProgress.pct === 100 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                {scanProgress.pct}%
              </span>
              <span>100%</span>
            </div>

            <p className="text-[10px] text-slate-600 mt-4 italic">Please wait ΓÇö this usually takes 5ΓÇô15 seconds</p>
          </div>
        </div>
      )}

      {/* Floating SRE toast alert card overlay */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[99999] animate-fade">
          <div className={`px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-xs font-bold ${toast.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
              toast.type === 'error' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
            }`}>
            {toast.type === 'success' && <ShieldCheck className="h-4.5 w-4.5" />}
            {toast.type === 'error' && <AlertCircle className="h-4.5 w-4.5" />}
            {toast.type === 'info' && <BellRing className="h-4.5 w-4.5 animate-bounce" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

    </div>
  );
}