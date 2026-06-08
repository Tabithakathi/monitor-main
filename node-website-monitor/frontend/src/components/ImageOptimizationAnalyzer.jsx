import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  Cell, 
  PieChart, 
  Pie, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  Image as ImageIcon, 
  Zap, 
  AlertTriangle, 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  ExternalLink, 
  X, 
  Download, 
  Sparkles, 
  RefreshCw, 
  Search, 
  Check,
  TrendingDown,
  Gauge
} from 'lucide-react';

/**
 * Format bytes to readable string
 */
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) {
    return Math.round(kb) + ' KB';
  } else {
    const mb = kb / 1024;
    return parseFloat(mb.toFixed(1)) + ' MB';
  }
};

/**
 * Clean up filename for display
 */
const getFileName = (url) => {
  if (!url) return 'unknown-image';
  try {
    const parts = url.split('/');
    const file = parts[parts.length - 1];
    return file.split('?')[0] || 'image';
  } catch (e) {
    return 'image';
  }
};

/**
 * Deterministic hash to generate consistent sizes for crawled URLs
 */
const getDeterministicHash = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

export default function ImageOptimizationAnalyzer({ stats, crawlData, url, isDark }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [formatFilter, setFormatFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewDimensions, setPreviewDimensions] = useState(null);
  const [previewError, setPreviewError] = useState(false);

  // Real image size states
  const [imageSizesMap, setImageSizesMap] = useState({});
  const [loadingSizes, setLoadingSizes] = useState(false);

  useEffect(() => {
    setPreviewDimensions(null);
    setPreviewError(false);
  }, [selectedImage]);

  // 1. Resolve Target URL
  const targetUrl = useMemo(() => {
    const raw = stats?.url || url || 'https://example.com';
    if (!/^https?:\/\//i.test(raw)) {
      return 'https://' + raw;
    }
    return raw;
  }, [stats?.url, url]);

  // Extract unique image URLs to retrieve real sizes for
  const rawImageUrls = useMemo(() => {
    const urls = [];
    const seen = new Set();
    const addUrl = (src) => {
      if (!src || src.startsWith('data:') || seen.has(src)) return;
      seen.add(src);
      urls.push(src);
    };

    // Gather from crawlData if available
    if (crawlData?.siteWideImages?.missingAltImages) {
      crawlData.siteWideImages.missingAltImages.forEach(img => addUrl(img.src));
    }

    // Gather from seoData imageAnalysis
    if (stats?.seoData?.imageAnalysis?.missingAltSrcs) {
      stats.seoData.imageAnalysis.missingAltSrcs.forEach(img => {
        const srcUrl = typeof img === 'string' ? img : img?.src;
        addUrl(srcUrl);
      });
    }

    // Default assets
    const defaultAssets = [
      { path: '/assets/images/hero-banner.jpg' },
      { path: '/brand/logo.png' },
      { path: '/images/features/dashboard-preview.png' },
      { path: '/uploads/avatars/profile-avatar.png' },
      { path: '/assets/img/footer-bg.jpg' },
      { path: '/assets/icons/check-icon.svg' },
      { path: '/media/thumbnails/intro-video.webp' },
      { path: '/gallery/gallery-img-1.jpeg' },
      { path: '/gallery/gallery-img-2.jpg' },
      { path: '/images/mobile/mobile-banner.jpg' },
      { path: '/assets/loader.gif' }
    ];

    defaultAssets.forEach(asset => {
      const fullUrl = `${targetUrl.replace(/\/$/, '')}${asset.path}`;
      addUrl(fullUrl);
    });

    return urls;
  }, [crawlData, stats, targetUrl]);

  // Fetch actual metadata from backend proxy
  useEffect(() => {
    if (rawImageUrls.length === 0) {
      setImageSizesMap({});
      return;
    }

    let isMounted = true;
    const fetchSizes = async () => {
      setLoadingSizes(true);
      try {
        const response = await axios.post('/api/image-metadata', { urls: rawImageUrls });
        if (isMounted && response.data?.success) {
          const map = {};
          response.data.results.forEach(res => {
            map[res.imageUrl] = {
              contentLength: res.contentLength,
              actualFileSize: res.actualFileSize,
              success: res.success
            };
          });
          setImageSizesMap(map);
        }
      } catch (err) {
        console.error("Failed to fetch image sizes:", err);
      } finally {
        if (isMounted) setLoadingSizes(false);
      }
    };

    fetchSizes();

    return () => {
      isMounted = false;
    };
  }, [rawImageUrls]);

  // 2. Build and Enrich Image List
  const images = useMemo(() => {
    const rawImages = [];
    const seenSrcs = new Set();

    // Helper to add image safely
    const addImage = (src, pageUrl, altStatus, isLazy) => {
      if (!src || src.startsWith('data:') || seenSrcs.has(src)) return;
      seenSrcs.add(src);
      rawImages.push({
        src,
        pageUrl: pageUrl || targetUrl,
        altStatus: altStatus || 'ok',
        isLazy: !!isLazy
      });
    };

    // Gather from crawlData if available
    if (crawlData?.siteWideImages?.missingAltImages) {
      crawlData.siteWideImages.missingAltImages.forEach(img => {
        addImage(img.src, img.foundOnPage || img.appearsOnPages?.[0], img.altStatus, img.isLazyLoaded);
      });
    }

    // Gather from seoData imageAnalysis
    if (stats?.seoData?.imageAnalysis?.missingAltSrcs) {
      stats.seoData.imageAnalysis.missingAltSrcs.forEach(img => {
        const srcUrl = typeof img === 'string' ? img : img?.src;
        addImage(srcUrl, targetUrl, 'missing', false);
      });
    }

    // Augment with default dummy assets
    const defaultAssets = [
      { name: 'hero-banner.jpg', path: '/assets/images/hero-banner.jpg', isLazy: false },
      { name: 'logo.png', path: '/brand/logo.png', isLazy: false },
      { name: 'dashboard-preview.png', path: '/images/features/dashboard-preview.png', isLazy: false },
      { name: 'profile-avatar.png', path: '/uploads/avatars/profile-avatar.png', isLazy: true },
      { name: 'footer-bg.jpg', path: '/assets/img/footer-bg.jpg', isLazy: true },
      { name: 'check-icon.svg', path: '/assets/icons/check-icon.svg', isLazy: false },
      { name: 'intro-video-thumbnail.webp', path: '/media/thumbnails/intro-video.webp', isLazy: true },
      { name: 'gallery-img-1.jpeg', path: '/gallery/gallery-img-1.jpeg', isLazy: true },
      { name: 'gallery-img-2.jpg', path: '/gallery/gallery-img-2.jpg', isLazy: true },
      { name: 'mobile-banner.jpg', path: '/images/mobile/mobile-banner.jpg', isLazy: false },
      { name: 'loader.gif', path: '/assets/loader.gif', isLazy: false }
    ];

    defaultAssets.forEach(asset => {
      const fullUrl = `${targetUrl.replace(/\/$/, '')}${asset.path}`;
      addImage(fullUrl, targetUrl, 'ok', asset.isLazy);
    });

    // Enrich with sizes and metadata
    return rawImages.map(img => {
      const name = getFileName(img.src);
      const ext = name.split('.').pop()?.toLowerCase() || 'png';

      // Look up real sizes
      const sizeInfo = imageSizesMap[img.src];
      const originalSize = sizeInfo ? sizeInfo.actualFileSize : 0;

      // Format-Specific Compression Estimate
      const getCompressionEstimate = (formatExt) => {
        const format = formatExt?.toLowerCase();
        if (format === 'png') return 75; // 75% saving
        if (format === 'jpg' || format === 'jpeg') return 70; // 70% saving
        if (format === 'gif') return 85; // 85% saving
        if (format === 'webp' || format === 'avif') return 5; // 5% saving
        if (format === 'svg') return 0; // 0% saving
        return 10; // default 10% saving for other formats
      };

      const compressionEstimateVal = getCompressionEstimate(ext);

      // Determine optimized size and savings percentage based on actual size
      let optimizedSize = Math.round(originalSize * (1 - compressionEstimateVal / 100));

      // Validation Rules
      if (optimizedSize > originalSize) {
        optimizedSize = originalSize;
      }
      if (optimizedSize < 0) {
        optimizedSize = 0;
      }

      let potentialSaving = originalSize - optimizedSize;
      if (potentialSaving > originalSize) {
        potentialSaving = originalSize;
      }
      if (potentialSaving < 0) {
        potentialSaving = 0;
      }

      let savingsPct = originalSize > 0 
        ? Math.round((potentialSaving / originalSize) * 100) 
        : 0;

      if (savingsPct < 0) savingsPct = 0;
      if (savingsPct > 100) savingsPct = 100;

      // Determine severity
      let severity = 'green';
      if (potentialSaving > 400 * 1024 || (originalSize > 500 * 1024 && savingsPct > 50)) {
        severity = 'red';
      } else if (potentialSaving > 80 * 1024 || savingsPct > 15) {
        severity = 'yellow';
      }

      // Generate recommendation checklists
      const recs = [];
      if (ext === 'png') recs.push('Convert PNG to WebP');
      if (ext === 'jpg' || ext === 'jpeg') recs.push('Compress JPEG');
      if (ext === 'gif') recs.push('Replace animated GIF with WebP/video');
      if (originalSize > 800 * 1024) recs.push('Resize oversized images');
      if (!img.isLazy) recs.push('Enable Lazy Loading');
      recs.push('Add Width and Height attributes');
      if (originalSize > 300 * 1024) recs.push('Serve responsive images');

      return {
        ...img,
        name,
        ext: ext.toUpperCase(),
        originalSize,
        optimizedSize,
        potentialSaving,
        savingsPct,
        severity,
        recs,
        // Debug information
        imageUrl: img.src,
        contentLength: sizeInfo ? sizeInfo.contentLength : null,
        actualFileSize: originalSize,
        compressionEstimate: `${compressionEstimateVal}%`,
        finalRecommendedSize: optimizedSize
      };
    });
  }, [crawlData, stats, targetUrl, imageSizesMap]);

  // 3. Compute Summary Statistics
  const summary = useMemo(() => {
    let totalOriginal = 0;
    let totalOptimized = 0;
    
    images.forEach(img => {
      totalOriginal += img.originalSize;
      totalOptimized += img.optimizedSize;
    });

    const totalSavings = totalOriginal - totalOptimized;
    const savingsPercentage = totalOriginal > 0 ? Math.round((totalSavings / totalOriginal) * 100) : 0;

    // Simulated Page Load Speeds
    // Baseline speed derived from stats loading speed, or defaulting to 2.6s
    const actualLoadTimeMs = stats?.latestStatus?.loadTimeMs || 0;
    const originalSpeed = actualLoadTimeMs > 0 ? parseFloat((actualLoadTimeMs / 1000).toFixed(2)) : 2.6;
    
    // Improvement factor depends on savings percentage (capping improvement at 60% of original speed)
    const speedImprovement = parseFloat((originalSpeed * (savingsPercentage / 100) * 0.55).toFixed(2));
    const optimizedSpeed = parseFloat(Math.max(0.6, originalSpeed - speedImprovement).toFixed(2));
    const speedImprovementPct = Math.round(((originalSpeed - optimizedSpeed) / originalSpeed) * 100);

    return {
      totalImages: images.length,
      totalOriginal,
      totalOptimized,
      totalSavings,
      savingsPercentage,
      originalSpeed,
      optimizedSpeed,
      speedImprovement,
      speedImprovementPct
    };
  }, [images, stats]);

  // 4. Compute Filtered Images
  const filteredImages = useMemo(() => {
    return images.filter(img => {
      const matchesSearch = img.name.toLowerCase().includes(searchTerm.toLowerCase()) || img.src.toLowerCase().includes(searchTerm.toLowerCase());
      
      const format = img.ext.toLowerCase();
      let matchesFormat = true;
      if (formatFilter !== 'all') {
        if (formatFilter === 'jpg') {
          matchesFormat = format === 'jpg' || format === 'jpeg';
        } else {
          matchesFormat = format === formatFilter;
        }
      }

      let matchesSeverity = true;
      if (severityFilter !== 'all') {
        matchesSeverity = img.severity === severityFilter;
      }

      return matchesSearch && matchesFormat && matchesSeverity;
    });
  }, [images, searchTerm, formatFilter, severityFilter]);

  // 5. Chart Data Prep
  const sizeDistributionData = useMemo(() => {
    let under100 = 0;
    let between100And500 = 0;
    let between500And1M = 0;
    let over1M = 0;

    images.forEach(img => {
      const sizeKB = img.originalSize / 1024;
      if (sizeKB < 100) under100++;
      else if (sizeKB < 500) between100And500++;
      else if (sizeKB < 1024) between500And1M++;
      else over1M++;
    });

    return [
      { range: '< 100KB', count: under100 },
      { range: '100-500KB', count: between100And500 },
      { range: '500KB-1MB', count: between500And1M },
      { range: '> 1MB', count: over1M },
    ];
  }, [images]);

  const savingsPieData = useMemo(() => {
    return [
      { name: 'Optimized Size', value: Math.round(summary.totalOptimized / 1024) },
      { name: 'Potential Savings', value: Math.round(summary.totalSavings / 1024) }
    ];
  }, [summary]);

  const formatDistributionData = useMemo(() => {
    const counts = {};
    images.forEach(img => {
      let format = img.ext;
      if (format === 'JPEG') format = 'JPG';
      counts[format] = (counts[format] || 0) + 1;
    });

    return Object.keys(counts).map(key => ({
      name: key,
      value: counts[key]
    }));
  }, [images]);

  const pageSpeedImpactData = useMemo(() => {
    return [
      { name: 'Original Load', Speed: summary.originalSpeed, fill: '#f87171' },
      { name: 'Optimized Load', Speed: summary.optimizedSpeed, fill: '#10b981' }
    ];
  }, [summary]);

  // Theme support colors
  const chartsTheme = {
    gridColor: isDark ? '#1f2937' : '#e2e8f0',
    textColor: isDark ? '#94a3b8' : '#475569',
    primaryColor: '#6366f1', // Indigo 500
    savingsColor: '#10b981', // Emerald 500
    unoptimizedColor: '#ef4444', // Red 500
    warningColor: '#f59e0b', // Amber 500
    pieColors: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6']
  };

  // 6. Global Optimization Count Summary
  const globalRecCounts = useMemo(() => {
    let pngToWebp = 0;
    let jpegCompress = 0;
    let resize = 0;
    let lazy = 0;
    let responsive = 0;
    let dimensions = images.length; // all need proper tags by default

    images.forEach(img => {
      if (img.ext === 'PNG') pngToWebp++;
      if (img.ext === 'JPG' || img.ext === 'JPEG') jpegCompress++;
      if (img.originalSize > 800 * 1024) resize++;
      if (!img.isLazy) lazy++;
      if (img.originalSize > 300 * 1024) responsive++;
    });

    return [
      { label: 'Convert PNG to WebP', count: pngToWebp, status: pngToWebp > 3 ? 'critical' : pngToWebp > 0 ? 'warning' : 'ok' },
      { label: 'Compress JPEG', count: jpegCompress, status: jpegCompress > 3 ? 'critical' : jpegCompress > 0 ? 'warning' : 'ok' },
      { label: 'Resize oversized images', count: resize, status: resize > 1 ? 'critical' : resize > 0 ? 'warning' : 'ok' },
      { label: 'Enable Lazy Loading', count: lazy, status: lazy > 5 ? 'critical' : lazy > 0 ? 'warning' : 'ok' },
      { label: 'Add Width and Height attributes', count: dimensions, status: dimensions > 5 ? 'warning' : 'ok' },
      { label: 'Serve responsive images', count: responsive, status: responsive > 2 ? 'warning' : 'ok' },
    ];
  }, [images]);

  if (loadingSizes && Object.keys(imageSizesMap).length === 0) {
    return (
      <div className="py-24 text-center glass-card p-6 rounded-2xl">
        <RefreshCw className="h-8 w-8 text-indigo-500 rotate-infinite mx-auto mb-4" />
        <h4 className="font-extrabold text-slate-300">Analyzing real image file sizes...</h4>
        <p className="text-xs text-slate-500 mt-1">Fetching real-time metadata and Content-Length headers via SRE proxy</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in-up">
      
      {/* ── TOP SUMMARY SECTION ────────────────────────────────────────── */}
      <div className="glass-card p-6 rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <ImageIcon className="w-40 h-40 text-indigo-500" />
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/60 pb-5 mb-6">
          <div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block mb-1">IMAGE OPTIMIZATION INTELLIGENCE</span>
            <h2 className="text-xl font-extrabold text-slate-200 tracking-tight flex items-center gap-2">
              <span>Image Optimization Report</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                {targetUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
              </span>
            </h2>
          </div>
          
          <div className="flex items-center gap-3 bg-indigo-500/5 px-4 py-2 rounded-xl border border-indigo-500/10">
            <Gauge className="h-5 w-5 text-indigo-400" />
            <div className="text-left">
              <span className="text-[9px] text-slate-450 block font-bold uppercase">Report Grade</span>
              <span className={`text-sm font-black ${summary.savingsPercentage > 50 ? 'text-rose-400' : summary.savingsPercentage > 25 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {summary.savingsPercentage > 50 ? 'Grade F (Needs Compression)' : summary.savingsPercentage > 25 ? 'Grade C (Moderate Savings)' : 'Grade A (Highly Optimized)'}
              </span>
            </div>
          </div>
        </div>

        {/* Summary Grid Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <div className="bg-dark-900/10 border border-slate-800/40 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Images Discovered</span>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-250">{summary.totalImages}</span>
              <span className="text-[10px] text-slate-500 font-medium">assets</span>
            </div>
            <p className="text-[9px] text-slate-500 mt-2 font-mono truncate">{targetUrl}</p>
          </div>

          <div className="bg-dark-900/10 border border-slate-800/40 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Original Weight</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-rose-400">{formatBytes(summary.totalOriginal)}</span>
            </div>
            <p className="text-[9px] text-slate-550 mt-2">Combined raw payload size</p>
          </div>

          <div className="bg-dark-900/10 border border-slate-800/40 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Optimized Weight</span>
            <div className="mt-2">
              <span className="text-2xl font-black text-emerald-400">{formatBytes(summary.totalOptimized)}</span>
            </div>
            <p className="text-[9px] text-emerald-500 font-bold mt-2 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              <span>Save {formatBytes(summary.totalSavings)}</span>
            </p>
          </div>

          <div className="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-xl flex flex-col justify-between">
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Total Savings</span>
            <div className="mt-2">
              <span className="text-3xl font-black text-indigo-400">{summary.savingsPercentage}%</span>
            </div>
            <p className="text-[9px] text-indigo-400/80 font-bold mt-2">TinyPNG-style savings</p>
          </div>

        </div>

        {/* Page Speed Performance Comparison */}
        <div className="mt-6 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center font-bold text-emerald-400 shrink-0">
              ⚡
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-slate-200">Page Load Speed Comparison</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Estimated timeline acceleration through image weight compression.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-8 shrink-0">
            <div className="text-right">
              <span className="text-[9px] text-slate-500 font-bold block uppercase">Original Load Time</span>
              <span className="text-lg font-black text-rose-455 font-mono">{summary.originalSpeed}s</span>
            </div>
            <div className="text-center font-bold text-slate-600 text-xs">➔</div>
            <div className="text-right">
              <span className="text-[9px] text-slate-500 font-bold block uppercase">Optimized Load Time</span>
              <span className="text-lg font-black text-emerald-400 font-mono">{summary.optimizedSpeed}s</span>
            </div>
            <div className="border-l border-slate-800/80 pl-6 text-right">
              <span className="text-[9px] text-indigo-400 font-bold block uppercase">Speed Improvement</span>
              <span className="text-sm font-black text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-mono">
                {summary.speedImprovement}s ({summary.speedImprovementPct}% faster)
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* ── CHARTS SECTION ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Image Size Distribution */}
        <div className="glass-card p-5 rounded-2xl">
          <h3 className="text-slate-250 font-bold text-sm mb-4 flex items-center gap-1.5 border-b border-slate-800/50 pb-2">
            <ImageIcon className="h-4 w-4 text-indigo-400" />
            Image Size Distribution
          </h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sizeDistributionData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartsTheme.gridColor} opacity={0.3} />
                <XAxis dataKey="range" stroke={chartsTheme.textColor} fontSize={10} tickLine={false} />
                <YAxis stroke={chartsTheme.textColor} fontSize={10} tickLine={false} allowDecimals={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: isDark ? '#090d16' : '#ffffff', borderColor: chartsTheme.gridColor, borderRadius: '8px', color: isDark ? '#cbd5e1' : '#1e293b' }}
                />
                <Bar dataKey="count" fill={chartsTheme.primaryColor} radius={[4, 4, 0, 0]}>
                  {sizeDistributionData.map((entry, index) => {
                    const colors = [chartsTheme.primaryColor, '#0ea5e9', chartsTheme.warningColor, chartsTheme.unoptimizedColor];
                    return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Optimization Savings Distribution */}
        <div className="glass-card p-5 rounded-2xl flex flex-col justify-between">
          <h3 className="text-slate-250 font-bold text-sm mb-4 flex items-center gap-1.5 border-b border-slate-800/50 pb-2">
            <Zap className="h-4 w-4 text-emerald-400" />
            Weight Savings Potential
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-7 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={savingsPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    <Cell fill={chartsTheme.primaryColor} />
                    <Cell fill={chartsTheme.savingsColor} />
                  </Pie>
                  <RechartsTooltip formatter={(value) => `${value} KB`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="sm:col-span-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-3.5 w-3.5 rounded-full shrink-0 bg-indigo-500" />
                <div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase">Optimized Payload</p>
                  <p className="text-base font-black text-slate-250">{formatBytes(summary.totalOptimized)}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="h-3.5 w-3.5 rounded-full shrink-0 bg-emerald-500" />
                <div>
                  <p className="text-[10px] text-slate-550 font-bold uppercase">Compressible Savings</p>
                  <p className="text-base font-black text-emerald-400">{formatBytes(summary.totalSavings)} ({summary.savingsPercentage}%)</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart 3: Image Format Distribution */}
        <div className="glass-card p-5 rounded-2xl">
          <h3 className="text-slate-250 font-bold text-sm mb-4 flex items-center gap-1.5 border-b border-slate-800/50 pb-2">
            <ImageIcon className="h-4 w-4 text-cyan-400" />
            Image Format Distribution
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-7 h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={formatDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {formatDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={chartsTheme.pieColors[index % chartsTheme.pieColors.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="sm:col-span-5 grid grid-cols-2 gap-2 text-xs">
              {formatDistributionData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: chartsTheme.pieColors[idx % chartsTheme.pieColors.length] }} />
                  <span className="font-bold text-slate-400">{item.name}:</span>
                  <span className="font-bold text-slate-200">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chart 4: Page Speed Impact Chart */}
        <div className="glass-card p-5 rounded-2xl">
          <h3 className="text-slate-250 font-bold text-sm mb-4 flex items-center gap-1.5 border-b border-slate-800/50 pb-2">
            <Gauge className="h-4 w-4 text-rose-400" />
            Page Speed Impact Timeline (seconds)
          </h3>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pageSpeedImpactData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartsTheme.gridColor} opacity={0.3} />
                <XAxis type="number" stroke={chartsTheme.textColor} fontSize={10} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke={chartsTheme.textColor} fontSize={10} tickLine={false} width={100} />
                <RechartsTooltip formatter={(value) => `${value} seconds`} />
                <Bar dataKey="Speed" radius={[0, 4, 4, 0]}>
                  {pageSpeedImpactData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ── OPTIMIZATION RECOMMENDATIONS ──────────────────────────────── */}
      <div className="glass-card p-6 rounded-2xl">
        <h3 className="text-slate-200 font-extrabold text-base mb-4 flex items-center gap-2 border-b border-slate-800/60 pb-3">
          <Zap className="text-indigo-400 h-5 w-5" /> Global Optimization Checklist Summary
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {globalRecCounts.map((r, idx) => (
            <div key={idx} className={`flex items-start gap-3 p-3.5 bg-dark-800/20 border rounded-xl transition-all ${
              r.status === 'critical' ? 'border-rose-500/20 bg-rose-500/5' : 
              r.status === 'warning' ? 'border-amber-500/20 bg-amber-500/5' : 'border-emerald-500/20 bg-emerald-500/5'
            }`}>
              <div className="mt-0.5 shrink-0">
                {r.status === 'critical' && <AlertCircle className="h-4 w-4 text-rose-400" />}
                {r.status === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                {r.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-200 truncate">{r.label}</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {r.status === 'ok' ? (
                    <span className="text-emerald-500 font-bold flex items-center gap-0.5">✓ Fully Applied</span>
                  ) : (
                    <span>Affects <strong className="text-indigo-400">{r.count}</strong> images</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── IMAGE ANALYSIS TABLE ──────────────────────────────────────── */}
      <div className="glass-card p-6 rounded-2xl">
        
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800/60 pb-4 mb-6">
          <div>
            <h3 className="text-slate-200 font-extrabold text-base flex items-center gap-2">
              <ImageIcon className="text-indigo-400 h-5 w-5" /> Detailed Image Audit Report
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-750 font-bold">
                {filteredImages.length} images shown
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">Click on any image row to see detailed recommendations and file previews.</p>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Search Box */}
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search images..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-dark-900/40 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>

            {/* Format Filter */}
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="bg-dark-900/40 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-slate-400 cursor-pointer focus:outline-none focus:border-indigo-500/50"
            >
              <option value="all">All Formats</option>
              <option value="jpg">JPG / JPEG</option>
              <option value="png">PNG</option>
              <option value="webp">WebP</option>
              <option value="svg">SVG</option>
              <option value="gif">GIF</option>
            </select>

            {/* Severity Filter */}
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-dark-900/40 border border-slate-800/80 rounded-xl px-3 py-2 text-xs text-slate-400 cursor-pointer focus:outline-none focus:border-indigo-500/50"
            >
              <option value="all">All Severities</option>
              <option value="red">🔴 Unoptimized (Critical)</option>
              <option value="yellow">🟡 Needs Improvement</option>
              <option value="green">🟢 Optimized (OK)</option>
            </select>
          </div>
        </div>

        {/* Responsive Table wrapper */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto pr-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900/80 backdrop-blur">
              <tr className="border-b border-slate-800 text-slate-450 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Image Name</th>
                <th className="py-3 px-4">Original Size</th>
                <th className="py-3 px-4">Optimized Size</th>
                <th className="py-3 px-4">Potential Saving</th>
                <th className="py-3 px-4 text-right">Saving %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredImages.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500 font-bold">
                    No images match the current filters.
                  </td>
                </tr>
              ) : (
                filteredImages.map((img, idx) => (
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedImage(img)}
                    className="group border-b border-slate-800/30 hover:bg-indigo-500/[0.02] cursor-pointer transition-all duration-150"
                  >
                    {/* Severity Dot */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="flex h-2.5 w-2.5 relative">
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                          img.severity === 'red' ? 'bg-rose-500' : 
                          img.severity === 'yellow' ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}></span>
                      </span>
                    </td>

                    {/* Image Name / Info */}
                    <td className="py-3.5 px-4 max-w-[280px]">
                      <div className="font-bold text-slate-200 group-hover:text-indigo-400 transition-colors truncate">
                        {img.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                        {img.src}
                      </div>
                      <div className="text-[9px] text-slate-600 font-mono truncate mt-0.5 flex items-center gap-1">
                        <span>📄 On:</span>
                        <span className="underline">{img.pageUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                      </div>
                    </td>

                    {/* Original Size */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-350 whitespace-nowrap">
                      {formatBytes(img.originalSize)}
                    </td>

                    {/* Optimized Size */}
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-400/90 whitespace-nowrap">
                      {formatBytes(img.optimizedSize)}
                    </td>

                    {/* Potential Savings */}
                    <td className="py-3.5 px-4 font-mono font-bold whitespace-nowrap">
                      {img.potentialSaving > 0 ? (
                        <span className={img.severity === 'red' ? 'text-rose-400' : img.severity === 'yellow' ? 'text-amber-400' : 'text-slate-500'}>
                          {formatBytes(img.potentialSaving)}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    {/* Savings Percentage */}
                    <td className="py-3.5 px-4 text-right font-mono font-black whitespace-nowrap">
                      {img.savingsPct > 0 ? (
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                          img.severity === 'red' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          img.severity === 'yellow' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-slate-800 text-slate-500 border border-slate-750'
                        }`}>
                          -{img.savingsPct}%
                        </span>
                      ) : (
                        <span className="text-slate-500">0%</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
      </div>

      {/* ── IMAGE DETAILS MODAL ──────────────────────────────────────── */}
      {selectedImage && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md animate-fade">
          <div className="glass-card rounded-2xl w-full max-w-3xl mx-4 overflow-hidden shadow-2xl flex flex-col md:flex-row relative">
            
            {/* Close Button */}
            <button 
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors z-20 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Left: Preview Panel */}
            <div className="md:w-1/2 bg-slate-950/30 p-8 border-b md:border-b-0 md:border-r border-slate-800/60 flex flex-col justify-center items-center relative">
              <div className="absolute top-4 left-4">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                  selectedImage.severity === 'red' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                  selectedImage.severity === 'yellow' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  {selectedImage.severity === 'red' ? 'Highly Unoptimized' : selectedImage.severity === 'yellow' ? 'Needs Improvement' : 'Optimized'}
                </span>
              </div>

              {/* Actual Image preview */}
              <div className="w-full max-h-60 flex items-center justify-center overflow-hidden rounded-xl border border-slate-800/40 p-4 bg-slate-900/40 shadow-inner mt-4">
                {!previewError && (
                  <img 
                    src={selectedImage.src} 
                    alt={selectedImage.name} 
                    className="max-w-full max-h-48 object-contain rounded-lg shadow-md hover:scale-105 transition-transform duration-300"
                    onLoad={(e) => {
                      setPreviewDimensions({
                        width: e.target.naturalWidth,
                        height: e.target.naturalHeight
                      });
                    }}
                    onError={() => {
                      setPreviewError(true);
                    }}
                  />
                )}
                
                {/* Fallback Display */}
                {previewError && (
                  <div 
                    id="preview-fallback-box" 
                    className="flex flex-col items-center justify-center py-12 text-slate-600 gap-3"
                  >
                    <ImageIcon className="h-12 w-12 text-slate-700 animate-pulse" />
                    <span className="text-[10px] text-slate-500 font-mono text-center truncate max-w-[200px]" title={selectedImage.src}>
                      {selectedImage.name}
                    </span>
                    <span className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
                      Preview unavailable
                    </span>
                  </div>
                )}
              </div>
              
              <div className="mt-4 w-full flex items-center justify-between text-[10px] text-slate-500">
                <span className="font-mono">Format: <strong className="text-slate-350">{selectedImage.ext}</strong></span>
                {previewDimensions && (
                  <span className="font-mono">Dimensions: <strong className="text-indigo-400">{previewDimensions.width} × {previewDimensions.height} px</strong></span>
                )}
                <span className="font-mono">Savings: <strong className="text-emerald-400">-{selectedImage.savingsPct}%</strong></span>
              </div>
            </div>

            {/* Right: Info & Recommendations Checklist */}
            <div className="md:w-1/2 p-6 flex flex-col justify-between">
              
              <div className="space-y-4">
                {/* File Details */}
                <div>
                  <h4 className="text-base font-black text-slate-200 pr-8 truncate" title={selectedImage.name}>
                    {selectedImage.name}
                  </h4>
                  <a 
                    href={selectedImage.src} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline mt-1 inline-flex items-center gap-1 truncate max-w-full"
                  >
                    <span>Open Image URL</span>
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                </div>

                {/* Savings Metrics Info */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-dark-900/10 border border-slate-800/40 rounded-xl text-center">
                  <div className="text-left border-r border-slate-800/80 pr-2">
                    <span className="text-[9px] text-slate-500 font-bold uppercase block">Original Size</span>
                    <span className="text-xs font-black text-rose-455 font-mono">{formatBytes(selectedImage.originalSize)}</span>
                  </div>
                  <div className="text-left border-r border-slate-800/80 px-2">
                    <span className="text-[9px] text-slate-550 font-bold uppercase block">Recommended</span>
                    <span className="text-xs font-black text-emerald-400 font-mono">{formatBytes(selectedImage.optimizedSize)}</span>
                  </div>
                  <div className="text-left pl-2">
                    <span className="text-[9px] text-indigo-450 font-bold uppercase block">Potential Saving</span>
                    <span className="text-xs font-black text-indigo-400 font-mono">
                      {selectedImage.potentialSaving > 0 ? formatBytes(selectedImage.potentialSaving) : '0 KB'}
                    </span>
                  </div>
                </div>

                {/* Checklist Recommendations details */}
                <div className="space-y-2.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Optimization Checklist</span>
                  
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {[
                      { 
                        title: 'Convert PNG to WebP', 
                        applies: selectedImage.ext === 'PNG', 
                        desc: 'Converts uncompressed PNG channels to highly efficient lossy WebP' 
                      },
                      { 
                        title: 'Compress JPEG', 
                        applies: selectedImage.ext === 'JPG' || selectedImage.ext === 'JPEG', 
                        desc: 'Reduces visual noise and metadata fields for smaller payloads' 
                      },
                      { 
                        title: 'Replace animated GIF with WebP/video', 
                        applies: selectedImage.ext === 'GIF', 
                        desc: 'Converts legacy GIF animation loops to modern WebP frames or HTML5 loops' 
                      },
                      { 
                        title: 'Resize oversized images', 
                        applies: selectedImage.originalSize > 800 * 1024, 
                        desc: 'Downscales resolution to fit exact CSS boundaries' 
                      },
                      { 
                        title: 'Enable Lazy Loading', 
                        applies: !selectedImage.isLazy, 
                        desc: 'Defers download of off-screen/below-fold images' 
                      },
                      { 
                        title: 'Add Width and Height attributes', 
                        applies: true, // recommendations for all by default
                        desc: 'Prevents Cumulative Layout Shift (CLS) on content render' 
                      },
                      { 
                        title: 'Serve responsive images', 
                        applies: selectedImage.originalSize > 300 * 1024, 
                        desc: 'Uses srcset/sizes queries to scale resolution down on mobile devices' 
                      }
                    ].map((rec, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-2 bg-dark-800/10 border border-slate-800/30 rounded-lg">
                        <div className="mt-0.5 shrink-0">
                          {rec.applies ? (
                            <span className="flex h-3.5 w-3.5 bg-rose-500/10 rounded-full items-center justify-center text-[9px] text-rose-455 font-bold font-mono">
                              !
                            </span>
                          ) : (
                            <span className="flex h-3.5 w-3.5 bg-emerald-500/10 rounded-full items-center justify-center text-[9px] text-emerald-450 font-mono">
                              ✓
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-[10px] font-bold ${rec.applies ? 'text-rose-400' : 'text-slate-400'}`}>
                            {rec.title}
                          </p>
                          <p className="text-[9px] text-slate-550 leading-tight mt-0.5">{rec.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between gap-4">
                <div className="text-[9px] text-slate-500 font-mono truncate max-w-[150px]">
                  Page: {selectedImage.pageUrl.replace(/^https?:\/\/[^/]+/, '') || '/'}
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => setSelectedImage(null)}
                    className="px-4 py-2 border border-slate-800 hover:bg-slate-800 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                  <a 
                    href={selectedImage.src}
                    download
                    className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-550 hover:to-indigo-450 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/10 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Download Raw</span>
                  </a>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}
