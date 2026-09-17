/**
 * HM STORE - SYSTEM & ORDERS DASHBOARD JAVASCRIPT
 * Real-time Order Management, Pure SVG Icons, Robust Image Handling
 */

// Configuration
const CONFIG = {
  STORE_NAME: "متجر HM للأزياء والمفروشات",
  WHATSAPP_PHONE: "201281032887",
  ADMIN_PASSWORD: "hm admin.com"
};

// State
let ordersState = {
  orders: [],
  filteredOrders: [],
  searchQuery: '',
  selectedStatus: 'all',
  selectedGov: 'all',
  selectedPayMethod: 'all',
  activeOrderModalId: null,
  isAuthenticated: true,
  isSoundEnabled: localStorage.getItem('hm_sound_enabled') !== 'false',
  audioUnlocked: false,
  lastKnownOrderCount: 0
};

// Global AudioContext and Pre-generated WAV Data URI
let sharedAudioCtx = null;
let cachedWavChimeUri = null;

/**
 * Generate a standalone high-quality 16-bit PCM WAV Chime in memory
 * Guarantees 100% offline playback capability without external audio files
 */
function getWavChimeDataUri() {
  if (cachedWavChimeUri) return cachedWavChimeUri;

  try {
    const sampleRate = 22050;
    const duration = 0.85;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new Uint8Array(44 + numSamples * 2);

    function writeString(offset, str) {
      for (let i = 0; i < str.length; i++) buffer[offset + i] = str.charCodeAt(i);
    }
    function write32(offset, val) {
      buffer[offset] = val & 0xff;
      buffer[offset + 1] = (val >> 8) & 0xff;
      buffer[offset + 2] = (val >> 16) & 0xff;
      buffer[offset + 3] = (val >> 24) & 0xff;
    }
    function write16(offset, val) {
      buffer[offset] = val & 0xff;
      buffer[offset + 1] = (val >> 8) & 0xff;
    }

    // RIFF header
    writeString(0, 'RIFF');
    write32(4, 36 + numSamples * 2);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    write32(16, 16);
    write16(20, 1); // PCM
    write16(22, 1); // Mono
    write32(24, sampleRate);
    write32(28, sampleRate * 2);
    write16(32, 2);
    write16(34, 16);
    writeString(36, 'data');
    write32(40, numSamples * 2);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;

      // Note 1 (Ding 1: 1046.5 Hz - C6)
      if (t < 0.35) {
        const decay1 = Math.exp(-t * 9);
        sample += Math.sin(2 * Math.PI * 1046.5 * t) * decay1 * 0.45;
        sample += Math.sin(2 * Math.PI * 2093.0 * t) * decay1 * 0.15;
      }
      // Note 2 (Ding 2: 1568.0 Hz - G6)
      if (t >= 0.12) {
        const t2 = t - 0.12;
        const decay2 = Math.exp(-t2 * 4.5);
        sample += Math.sin(2 * Math.PI * 1567.98 * t2) * decay2 * 0.65;
        sample += Math.sin(2 * Math.PI * 3135.96 * t2) * decay2 * 0.25;
      }

      sample = Math.max(-1, Math.min(1, sample));
      const intSample = Math.floor(sample * 32767);
      write16(44 + i * 2, intSample);
    }

    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    cachedWavChimeUri = 'data:audio/wav;base64,' + btoa(binary);
    return cachedWavChimeUri;
  } catch (e) {
    return null;
  }
}

function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(function() {});
  }
  return sharedAudioCtx;
}

// Auto-unlock audio on first touch
['click', 'touchstart', 'keydown'].forEach(function(evt) {
  document.addEventListener(evt, function() {
    ordersState.audioUnlocked = true;
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(function() {});
    }
  }, { once: false, passive: true });
});

// Initialize System on DOM Loaded
document.addEventListener('DOMContentLoaded', function() {
  loadOrders();
  ordersState.lastKnownOrderCount = ordersState.orders.length;
  initRealtimeSync();
  initGovFilterOptions();
  updateSoundButtonUI();
  renderDashboard();

  // Prepare & preload audio element
  try {
    const uri = getWavChimeDataUri();
    const audioEl = document.getElementById('sysOrderAudio');
    if (audioEl && uri) {
      audioEl.src = uri;
      audioEl.load();
    }
  } catch (e) {}

  // Search and Filter Listeners
  const searchInp = document.getElementById('sysSearchInput');
  if (searchInp) {
    searchInp.addEventListener('input', function(e) {
      ordersState.searchQuery = e.target.value.trim().toLowerCase();
      const clearBtn = document.getElementById('sysClearSearchBtn');
      if (clearBtn) clearBtn.style.display = ordersState.searchQuery ? 'block' : 'none';
      applyFilters();
    });
  }

  const statusSel = document.getElementById('statusFilterSelect');
  if (statusSel) {
    statusSel.addEventListener('change', function(e) {
      handleSelectStatusChange(e.target.value);
    });
  }

  const paySel = document.getElementById('payMethodFilterSelect');
  if (paySel) {
    paySel.addEventListener('change', function(e) {
      handleSelectPayChange(e.target.value);
    });
  }

  const govSel = document.getElementById('govFilterSelect');
  if (govSel) {
    govSel.addEventListener('change', function(e) {
      ordersState.selectedGov = e.target.value;
      applyFilters();
    });
  }
});

/**
 * Load orders from localStorage cache
 */
function loadOrders() {
  try {
    const raw = localStorage.getItem('hm_store_orders');
    ordersState.orders = raw ? JSON.parse(raw) : [];
  } catch (err) {
    ordersState.orders = [];
  }
  ordersState.filteredOrders = [].concat(ordersState.orders);
}

/**
 * Save orders to localStorage
 */
function saveOrders() {
  try {
    localStorage.setItem('hm_store_orders', JSON.stringify(ordersState.orders));
  } catch (e) {}
}

/**
 * Real-time sync across all devices via Firebase Cloud Database & local fallbacks
 */
function initRealtimeSync() {
  function bindFirebase() {
    if (typeof FirebaseSync !== 'undefined') {
      FirebaseSync.listenToOrders(
        function(cloudOrders) {
          if (Array.isArray(cloudOrders)) {
            const isNewArrival = ordersState.orders.length > 0 && cloudOrders.length > ordersState.orders.length;
            ordersState.orders = cloudOrders;
            ordersState.lastKnownOrderCount = cloudOrders.length;
            applyFilters();
            updateStatsCards();
          }
        },
        function(newOrder) {
          if (newOrder && newOrder.id) {
            triggerNewOrderAlert(newOrder.id, newOrder.customer ? newOrder.customer.name : 'عميل جديد');
          }
        }
      );
      return true;
    }
    return false;
  }

  if (!bindFirebase()) {
    setTimeout(bindFirebase, 300);
    setTimeout(bindFirebase, 1200);
  }

  // Storage listener across tabs
  window.addEventListener('storage', function(e) {
    if (e.key === 'hm_store_orders') {
      const prevCount = ordersState.orders.length;
      loadOrders();
      applyFilters();
      if (ordersState.orders.length > prevCount) {
        ordersState.lastKnownOrderCount = ordersState.orders.length;
        const newest = ordersState.orders[0];
        triggerNewOrderAlert(newest ? newest.id : '', newest && newest.customer ? newest.customer.name : 'عميل جديد');
      }
    }
  });
}

/**
 * Trigger Sound, Toast, and Tab Title alert on new order
 */
function triggerNewOrderAlert(orderId, customerName) {
  playOrderNotificationSound();
  
  const idStr = orderId ? ' (#' + orderId + ')' : '';
  const nameStr = customerName ? ' من ' + customerName : '';
  showSysToast('🔔 طلب شراء جديد وصل الآن' + idStr + nameStr + '!', 'success');
  
  flashTabTitle('🔔 (طلب جديد وصل!)');
}

/**
 * Play high-quality notification chime
 */
function playOrderNotificationSound() {
  if (!ordersState.isSoundEnabled) return;

  try {
    const audioEl = document.getElementById('sysOrderAudio');
    if (audioEl) {
      if (!audioEl.src) audioEl.src = getWavChimeDataUri();
      audioEl.currentTime = 0;
      audioEl.play().catch(function() {});
    }
  } catch (e) {}

  try {
    const dataUri = getWavChimeDataUri();
    if (dataUri) {
      const snd = new Audio(dataUri);
      snd.volume = 1.0;
      snd.play().catch(function() {});
    }
  } catch (err) {}
}

/**
 * Toggle sound notification on/off
 */
function toggleSoundNotification() {
  getAudioContext();
  ordersState.isSoundEnabled = !ordersState.isSoundEnabled;
  localStorage.setItem('hm_sound_enabled', ordersState.isSoundEnabled ? 'true' : 'false');
  updateSoundButtonUI();

  if (ordersState.isSoundEnabled) {
    playOrderNotificationSound();
    showSysToast('🔊 تم تفعيل صوت التنبيهات للطلبات الجديدة', 'success');
  } else {
    showSysToast('🔇 تم كتم صوت التنبيهات للطلبات الجديدة', 'warning');
  }
}

/**
 * Update Sound Button Appearance with Clean SVG
 */
function updateSoundButtonUI() {
  const wrap = document.getElementById('soundIconWrap');
  const text = document.getElementById('soundStatusText');
  const btn = document.getElementById('toggleSoundBtn');

  if (!wrap || !text || !btn) return;

  if (ordersState.isSoundEnabled) {
    wrap.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="color:#10b981; vertical-align:middle;"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
    text.textContent = 'الصوت: مفعل';
    btn.style.borderColor = '#10b981';
  } else {
    wrap.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="color:#ef4444; vertical-align:middle;"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
    text.textContent = 'الصوت: مكتوم';
    btn.style.borderColor = '#ef4444';
  }
}

/**
 * Test order sound immediately
 */
function testOrderSound() {
  const wasEnabled = ordersState.isSoundEnabled;
  ordersState.isSoundEnabled = true;
  playOrderNotificationSound();
  ordersState.isSoundEnabled = wasEnabled;
  showSysToast('🔔 تم تشغيل صوت تنبيه الطلبات كتجربة!', 'info');
}

/**
 * Flash browser tab title to alert user
 */
let titleFlashTimer = null;
function flashTabTitle(alertText) {
  if (titleFlashTimer) clearInterval(titleFlashTimer);
  const originalTitle = document.title;
  let isAlert = true;
  let count = 0;

  titleFlashTimer = setInterval(function() {
    document.title = isAlert ? alertText : originalTitle;
    isAlert = !isAlert;
    count++;
    if (count > 10) {
      clearInterval(titleFlashTimer);
      document.title = originalTitle;
    }
  }, 800);
}

/**
 * Populate Governorates Filter
 */
function initGovFilterOptions() {
  const govSelect = document.getElementById('govFilterSelect');
  if (!govSelect) return;

  const egyptGovs = [
    "الزقازيق", "الشرقية", "القاهرة", "الجيزة", "محطات المترو", "الإسكندرية", "القليوبية",
    "المنصورة / الدقهلية", "الغربية", "المنوفية", "كفر الشيخ", "البحيرة", "رشيد",
    "دمياط", "بورسعيد", "الإسماعيلية", "السويس", "الفيوم", "بني سويف", "المنيا",
    "أسيوط", "سوهاج", "قنا", "الأقصر", "أسوان", "الغردقة والبحر الأحمر", "شرم الشيخ",
    "مرسى مطروح", "الوادي الجديد", "شمال سيناء", "جنوب سيناء"
  ];

  egyptGovs.forEach(function(gov) {
    const opt = document.createElement('option');
    opt.value = gov;
    opt.textContent = gov;
    govSelect.appendChild(opt);
  });
}

/**
 * High-definition standalone WhatsApp SVG Icon
 */
function getWhatsAppIconSVG(size) {
  const s = size || 14;
  return '<svg style="width:' + s + 'px; height:' + s + 'px; fill:currentColor; vertical-align:middle; display:inline-block;" viewBox="0 0 448 512"><path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7.9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"/></svg>';
}

/**
 * Helper to generate color-coded payment method badge
 */
function getPaymentBadgeHTML(payMethod) {
  const method = (payMethod || 'الدفع عند الاستلام').toString().toLowerCase();

  if (method.includes('فودافون') || method.includes('vodafone')) {
    return '<span class="sys-pay-badge sys-pay-vodafone" title="طريقة الدفع: فودافون كاش">📱 فودافون كاش</span>';
  }

  if (method.includes('انستا') || method.includes('إنستا') || method.includes('instapay')) {
    return '<span class="sys-pay-badge sys-pay-instapay" title="طريقة الدفع: إنستاباي (InstaPay)">⚡ إنستاباي</span>';
  }

  return '<span class="sys-pay-badge sys-pay-cod" title="طريقة الدفع: الدفع عند الاستلام">💵 دفع عند الاستلام</span>';
}

/**
 * Quick Filter Handlers
 */
function setQuickStatusFilter(status, btnEl) {
  ordersState.selectedStatus = status;
  ordersState.selectedPayMethod = 'all';
  const statusSelect = document.getElementById('statusFilterSelect');
  if (statusSelect) statusSelect.value = status;
  const paySelect = document.getElementById('payMethodFilterSelect');
  if (paySelect) paySelect.value = 'all';

  updateQuickPillsUI(status, 'status');
  applyFilters();
}

function setQuickPaymentFilter(method, btnEl) {
  ordersState.selectedPayMethod = method;
  ordersState.selectedStatus = 'all';
  const paySelect = document.getElementById('payMethodFilterSelect');
  if (paySelect) paySelect.value = method;
  const statusSelect = document.getElementById('statusFilterSelect');
  if (statusSelect) statusSelect.value = 'all';

  updateQuickPillsUI(method, 'payment');
  applyFilters();
}

function updateQuickPillsUI(val, type) {
  document.querySelectorAll('.sys-pill').forEach(function(p) { p.classList.remove('active'); });
  if (val === 'all') {
    document.getElementById('pillAll')?.classList.add('active');
  } else if (val === 'جديد') {
    document.getElementById('pillNew')?.classList.add('active');
  } else if (val === 'قيد التجهيز') {
    document.getElementById('pillProc')?.classList.add('active');
  } else if (val === 'تم الشحن') {
    document.getElementById('pillShip')?.classList.add('active');
  } else if (val === 'تم التسليم') {
    document.getElementById('pillDeliv')?.classList.add('active');
  } else if (val === 'vodafone') {
    document.getElementById('pillVoda')?.classList.add('active');
  } else if (val === 'instapay') {
    document.getElementById('pillInsta')?.classList.add('active');
  }
}

function handleSelectStatusChange(val) {
  ordersState.selectedStatus = val;
  updateQuickPillsUI(val, 'status');
  applyFilters();
}

function handleSelectPayChange(val) {
  ordersState.selectedPayMethod = val;
  updateQuickPillsUI(val, 'payment');
  applyFilters();
}

function clearSysSearch() {
  const input = document.getElementById('sysSearchInput');
  const btn = document.getElementById('sysClearSearchBtn');
  if (input) input.value = '';
  if (btn) btn.style.display = 'none';
  ordersState.searchQuery = '';
  applyFilters();
}

/**
 * Apply Search and Status/Gov/Payment Filters
 */
function applyFilters() {
  const query = ordersState.searchQuery;
  const status = ordersState.selectedStatus;
  const gov = ordersState.selectedGov;
  const payMethod = ordersState.selectedPayMethod;

  ordersState.filteredOrders = ordersState.orders.filter(function(order) {
    if (status !== 'all' && order.status !== status) return false;
    if (gov !== 'all' && !(order.customer?.governorate || '').includes(gov)) return false;

    if (payMethod !== 'all') {
      const p = (order.customer?.payMethod || 'الدفع عند الاستلام').toLowerCase();
      if (payMethod === 'cod' && !(p.includes('استلام') || p.includes('cod'))) return false;
      if (payMethod === 'vodafone' && !(p.includes('فودافون') || p.includes('vodafone'))) return false;
      if (payMethod === 'instapay' && !(p.includes('انستا') || p.includes('إنستا') || p.includes('instapay'))) return false;
    }

    if (query) {
      const matchId = (order.id || '').toLowerCase().includes(query);
      const matchName = (order.customer?.name || '').toLowerCase().includes(query);
      const matchPhone = (order.customer?.phone || '').toLowerCase().includes(query);
      const matchAddress = (order.customer?.address || '').toLowerCase().includes(query);
      const matchGov = (order.customer?.governorate || '').toLowerCase().includes(query);
      const matchPay = (order.customer?.payMethod || '').toLowerCase().includes(query);
      const matchItem = (order.items || []).some(function(item) {
        return (item.name || '').toLowerCase().includes(query) || (item.code || '').toLowerCase().includes(query);
      });

      if (!matchId && !matchName && !matchPhone && !matchAddress && !matchGov && !matchPay && !matchItem) {
        return false;
      }
    }

    return true;
  });

  renderDashboard();
}

function renderDashboard() {
  updateStatsCards();
  renderOrdersTable();
}

/**
 * Update Analytics / Stats
 */
function updateStatsCards() {
  const totalOrders = ordersState.orders.length;
  const newOrders = ordersState.orders.filter(function(o) { return o.status === 'جديد'; }).length;
  const processingOrders = ordersState.orders.filter(function(o) { return o.status === 'قيد التجهيز' || o.status === 'تم الشحن'; }).length;
  const completedOrders = ordersState.orders.filter(function(o) { return o.status === 'تم التسليم'; }).length;
  
  const totalRevenue = ordersState.orders
    .filter(function(o) { return o.status !== 'ملغي'; })
    .reduce(function(sum, o) { return sum + (o.grandTotal || 0); }, 0);

  const elTotal = document.getElementById('statTotalOrders');
  const elNew = document.getElementById('statNewOrders');
  const elProc = document.getElementById('statProcessingOrders');
  const elComp = document.getElementById('statCompletedOrders');
  const elRev = document.getElementById('statTotalRevenue');
  const elBadge = document.getElementById('ordersCountBadge');

  if (elTotal) elTotal.textContent = totalOrders;
  if (elNew) elNew.textContent = newOrders;
  if (elProc) elProc.textContent = processingOrders;
  if (elComp) elComp.textContent = completedOrders;
  if (elRev) elRev.textContent = totalRevenue.toLocaleString('ar-EG') + ' ج.م';
  if (elBadge) elBadge.textContent = ordersState.filteredOrders.length + ' طلب';
}

/**
 * Helper to resolve product image, code, and details
 */
function resolveProductInfo(item) {
  let img = item.image || '';
  let code = item.code || '';
  const name = item.name || '';

  if ((!img || !code) && window.PRODUCTS_DATA && Array.isArray(window.PRODUCTS_DATA)) {
    const found = window.PRODUCTS_DATA.find(function(p) { return p.id === item.id || p.name === name || (code && p.code === code); });
    if (found) {
      if (!img) img = found.image;
      if (!code) code = found.code;
    }
  }

  if (!code && name) {
    const codeMatch = name.match(/كود\s*([A-Za-z0-9\-_]+)/i);
    if (codeMatch) code = codeMatch[1];
  }

  let resolvedImg = img;
  if (resolvedImg && !resolvedImg.startsWith('http') && !resolvedImg.startsWith('data:') && !resolvedImg.startsWith('../')) {
    resolvedImg = '../' + resolvedImg;
  }

  return {
    id: item.id,
    name: name,
    image: resolvedImg,
    code: code || 'عام',
    price: item.price,
    quantity: item.quantity,
    unit: item.unit,
    shortLabel: item.shortLabel,
    totalPieces: item.totalPieces,
    selectedSize: item.selectedSize,
    selectedColor: item.selectedColor,
    itemTotal: item.itemTotal
  };
}

/**
 * Render Table Rows & Mobile Order Cards
 */
function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  const emptyState = document.getElementById('emptyOrdersState');
  if (!tbody) return;

  if (ordersState.filteredOrders.length === 0) {
    tbody.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  tbody.innerHTML = ordersState.filteredOrders.map(function(order) {
    const cust = order.customer || {};
    const cleanPhone = (cust.phone || '').replace(/[^0-9]/g, '');
    const waPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;
    const waMsg = encodeURIComponent('مرحباً ' + (cust.name || '') + '، نتواصل معك بخصوص طلبك رقم (' + order.id + ') من متجر HM Store.');
    const statusClass = getStatusClass(order.status);

    return '<tr class="sys-order-row ' + statusClass + '" data-status="' + order.status + '">' +
      '<td class="sys-col-order" data-label="رقم وتاريخ الطلب">' +
        '<div class="order-id-wrap">' +
          '<span class="order-id-badge">' + order.id + '</span>' +
          '<span class="order-date-text">' + (order.dateFormatted || formatDate(order.createdAt)) + '</span>' +
        '</div>' +
      '</td>' +
      '<td class="sys-col-customer" data-label="بيانات العميل">' +
        '<div class="cust-cell-name">' +
          '<div class="cust-avatar-icon">👤</div>' +
          '<strong class="cust-name-title">' + (cust.name || 'عميل') + '</strong>' +
        '</div>' +
        '<div class="cust-cell-phone">' +
          '<a href="tel:' + cust.phone + '" class="cust-phone-link" title="اتصال هاتفي">📞 ' + (cust.phone || '-') + '</a>' +
          (cleanPhone ? '<a href="https://wa.me/' + waPhone + '?text=' + waMsg + '" target="_blank" class="cust-wa-btn" title="محادثة واتساب سريعة">' + getWhatsAppIconSVG(14) + ' <span>واتساب</span></a>' : '') +
        '</div>' +
      '</td>' +
      '<td class="sys-col-location" data-label="المحافظة والعنوان">' +
        '<div class="cust-gov-pill">📍 ' + (cust.governorate || 'غير محدد') + '</div>' +
        '<div class="cust-address-text">' + (cust.address || '-') + '</div>' +
        (cust.notes && cust.notes !== 'لا توجد ملاحظات' ? '<div class="cust-notes-preview">💬 ' + cust.notes + '</div>' : '') +
      '</td>' +
      '<td class="sys-col-items" data-label="المنتجات والكمية">' +
        '<div class="sys-order-items-mini">' +
          (order.items || []).map(function(rawItem) {
            const item = resolveProductInfo(rawItem);
            const unitLabel = item.unit || item.shortLabel || 'قطعة';
            return '<div class="sys-order-item-mini-card">' +
              '<div class="sys-thumb-wrap">' +
                '<img src="' + encodeURI(item.image) + '" class="sys-order-item-mini-img" alt="' + item.name + '" loading="lazy" onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'flex\';" />' +
                '<div class="sys-img-fallback-box" style="display:none;">👕</div>' +
              '</div>' +
              '<div class="sys-order-item-mini-info">' +
                '<div class="sys-order-item-mini-title">' + item.name + '</div>' +
                '<div class="sys-order-item-mini-meta">' +
                  '<span class="sys-item-code-tag">كود: ' + item.code + '</span>' +
                  '<span class="sys-item-qty-tag">' + item.quantity + ' × (' + unitLabel + ')</span>' +
                  (item.selectedSize && item.selectedSize !== 'قياسي' ? '<span class="sys-item-size-tag">مقاس: ' + item.selectedSize + '</span>' : '') +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</td>' +
      '<td class="sys-col-payment" data-label="الحساب والدفع">' +
        '<div class="sys-order-price-row">' +
          '<span class="sys-grand-total-val">' + (order.grandTotal || 0) + ' ج.م</span>' +
          getPaymentBadgeHTML(cust.payMethod) +
        '</div>' +
        '<div class="sys-shipping-info-tag ' + (order.freeShippingApplied ? 'free-ship' : '') + '">' +
          (order.freeShippingApplied ? '🎁 شحن مجاني' : 'شحن: ' + (order.shippingFee || 0) + ' ج.م') +
        '</div>' +
      '</td>' +
      '<td class="sys-col-status" data-label="حالة الطلب">' +
        '<div class="status-select-wrap">' +
          '<select class="status-pill ' + statusClass + '" onchange="updateOrderStatus(\'' + order.id + '\', this.value)">' +
            '<option value="جديد" ' + (order.status === 'جديد' ? 'selected' : '') + '>🟡 جديد</option>' +
            '<option value="قيد التجهيز" ' + (order.status === 'قيد التجهيز' ? 'selected' : '') + '>🔵 قيد التجهيز</option>' +
            '<option value="تم الشحن" ' + (order.status === 'تم الشحن' ? 'selected' : '') + '>🚚 تم الشحن</option>' +
            '<option value="تم التسليم" ' + (order.status === 'تم التسليم' ? 'selected' : '') + '>🟢 تم التسليم</option>' +
            '<option value="ملغي" ' + (order.status === 'ملغي' ? 'selected' : '') + '>🔴 ملغي</option>' +
          '</select>' +
        '</div>' +
      '</td>' +
      '<td class="sys-col-actions" data-label="إجراءات">' +
        '<div class="sys-action-btns">' +
          '<button class="sys-icon-btn btn-details" title="عرض تفاصيل الطلب كاملة" onclick="openOrderDetailsModal(\'' + order.id + '\')">' +
            '🔍 <span class="mobile-action-label">تفاصيل</span>' +
          '</button>' +
          (cleanPhone ? '<a href="https://wa.me/' + waPhone + '?text=' + waMsg + '" target="_blank" class="sys-icon-btn btn-wa" title="محادثة واتساب">' + getWhatsAppIconSVG(15) + ' <span class="mobile-action-label">واتساب</span></a>' : '') +
          '<button class="sys-icon-btn btn-print" title="طباعة فاتورة / بوليصة شحن" onclick="printOrderInvoice(\'' + order.id + '\')">' +
            '🖨️ <span class="mobile-action-label">طباعة</span>' +
          '</button>' +
          '<button class="sys-icon-btn btn-delete" title="حذف الطلب" onclick="deleteOrder(\'' + order.id + '\')">' +
            '🗑️ <span class="mobile-action-label">حذف</span>' +
          '</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join('');
}

function getStatusClass(status) {
  switch (status) {
    case 'جديد': return 'status-new';
    case 'قيد التجهيز': return 'status-processing';
    case 'تم الشحن': return 'status-shipped';
    case 'تم التسليم': return 'status-delivered';
    case 'ملغي': return 'status-cancelled';
    default: return 'status-new';
  }
}

/**
 * Update Order Status in Cloud (Firebase) and UI
 */
function updateOrderStatus(orderId, newStatus) {
  const order = ordersState.orders.find(function(o) { return o.id === orderId; });
  if (order) {
    order.status = newStatus;
    saveOrders();
    updateStatsCards();
    
    if (typeof FirebaseSync !== 'undefined') {
      FirebaseSync.updateOrderStatus(orderId, newStatus);
    }

    showSysToast('تم تحديث حالة الطلب (' + orderId + ') إلى: ' + newStatus, 'info');
    renderOrdersTable();
  }
}

/**
 * Delete single order from Cloud (Firebase) and UI
 */
function deleteOrder(orderId) {
  if (confirm('هل أنت متأكد من رغبتك في حذف الطلب رقم (' + orderId + ') نهائياً من السحابة؟')) {
    ordersState.orders = ordersState.orders.filter(function(o) { return o.id !== orderId; });
    saveOrders();
    
    if (typeof FirebaseSync !== 'undefined') {
      FirebaseSync.deleteOrder(orderId);
    }

    applyFilters();
    showSysToast('تم حذف الطلب (' + orderId + ') بنجاح', 'info');
  }
}

/**
 * Open Order Details Modal
 */
function openOrderDetailsModal(orderId) {
  const order = ordersState.orders.find(function(o) { return o.id === orderId; });
  if (!order) return;

  ordersState.activeOrderModalId = orderId;
  const cust = order.customer || {};
  const cleanPhone = (cust.phone || '').replace(/[^0-9]/g, '');
  const waPhone = cleanPhone.startsWith('0') ? '2' + cleanPhone : cleanPhone;

  document.getElementById('modalOrderId').textContent = order.id;
  document.getElementById('modalCustName').textContent = cust.name || 'عميل';
  document.getElementById('modalCustPhone').innerHTML = '<a href="tel:' + cust.phone + '" class="cust-phone-link">📞 ' + (cust.phone || '-') + '</a>' +
    (cleanPhone ? '<a href="https://wa.me/' + waPhone + '" target="_blank" class="cust-wa-btn" style="margin-right:8px;">' + getWhatsAppIconSVG(14) + ' واتساب</a>' : '');
  
  document.getElementById('modalCustGov').textContent = cust.governorate || '-';
  document.getElementById('modalCustAddress').textContent = cust.address || '-';
  document.getElementById('modalCustNotes').textContent = cust.notes || 'لا توجد ملاحظات';
  
  const payBadge = getPaymentBadgeHTML(cust.payMethod);
  document.getElementById('modalCustPayment').innerHTML = '<div style="display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:3px;">' + payBadge + '</div>';

  const tbody = document.getElementById('modalItemsTbody');
  if (tbody) {
    tbody.innerHTML = (order.items || []).map(function(rawItem, i) {
      const item = resolveProductInfo(rawItem);
      const pieceCount = item.totalPieces || item.quantity || 1;
      const unitLabel = item.unit || item.shortLabel || 'قطعة';
      return '<tr>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' +
          '<div class="order-item-info-col">' +
            '<img src="' + encodeURI(item.image) + '" class="order-item-thumb" onerror="this.src=\'data:image/svg+xml;utf8,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'40\\\' height=\\\'40\\\' viewBox=\\\'0 0 24 24\\\' fill=\\\'%23cbd5e1\\\'><path d=\\\'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z\\\'/></svg>\'" />' +
            '<div>' +
              '<strong style="color:var(--sys-text-main); font-size:0.9rem;">' + item.name + '</strong>' +
              '<div style="font-size:0.75rem; color:var(--sys-text-muted); margin-top:3px;">' +
                '<span class="sys-item-code-tag">كود: ' + item.code + '</span>' +
                (item.selectedSize ? ' | المقاس: <strong>' + item.selectedSize + '</strong>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td style="font-weight:700;">' + item.quantity + ' × (' + unitLabel + ')<div style="font-size:0.75rem; color:var(--sys-text-muted);">(' + pieceCount + ' قطع إجمالي)</div></td>' +
        '<td>' + item.price + ' ج.م</td>' +
        '<td style="font-weight:800; color:var(--sys-primary);">' + (item.itemTotal || (item.price * pieceCount)) + ' ج.م</td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('modalSubtotal').textContent = (order.subtotal || 0) + ' ج.م';
  document.getElementById('modalShipping').innerHTML = order.freeShippingApplied 
    ? '<span style="color:#059669; font-weight:800;">شحن مجاني 🎁 (0 ج.م)</span>'
    : (order.shippingFee || 0) + ' ج.م';
  document.getElementById('modalGrandTotal').textContent = (order.grandTotal || 0) + ' ج.م';

  const statusSel = document.getElementById('modalOrderStatusSelect');
  if (statusSel) statusSel.value = order.status || 'جديد';

  const modal = document.getElementById('orderDetailsModal');
  if (modal) modal.classList.add('active');
}

function closeOrderDetailsModal() {
  const modal = document.getElementById('orderDetailsModal');
  if (modal) modal.classList.remove('active');
  ordersState.activeOrderModalId = null;
}

function handleModalStatusChange(newStatus) {
  if (ordersState.activeOrderModalId) {
    updateOrderStatus(ordersState.activeOrderModalId, newStatus);
  }
}

/**
 * Print Order Invoice
 */
function printOrderInvoice(orderId) {
  const order = ordersState.orders.find(function(o) { return o.id === orderId; });
  if (!order) return;

  const cust = order.customer || {};
  const area = document.getElementById('printInvoiceArea');
  if (!area) return;

  area.innerHTML = '<div class="invoice-box" style="direction:rtl; font-family:sans-serif; padding:20px; border:2px solid #000; max-width:800px; margin:0 auto;">' +
    '<div style="text-align:center; border-bottom:2px solid #000; padding-bottom:10px; margin-bottom:15px;">' +
      '<h1 style="margin:0; font-size:1.8rem;">' + CONFIG.STORE_NAME + '</h1>' +
      '<p style="margin:4px 0 0 0; font-size:1rem;">فاتورة وبوليصة تسليم أوردر - رقم: <strong>' + order.id + '</strong></p>' +
      '<p style="margin:2px 0 0 0; font-size:0.85rem; color:#555;">تاريخ الطلب: ' + (order.dateFormatted || formatDate(order.createdAt)) + '</p>' +
    '</div>' +
    '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px; font-size:0.95rem;">' +
      '<div><strong>اسم العميل:</strong> ' + (cust.name || '-') + '</div>' +
      '<div><strong>رقم الهاتف:</strong> ' + (cust.phone || '-') + '</div>' +
      '<div><strong>المحافظة:</strong> ' + (cust.governorate || '-') + '</div>' +
      '<div><strong>طريقة الدفع:</strong> ' + (cust.payMethod || 'دفع عند الاستلام') + '</div>' +
      '<div style="grid-column:1/-1;"><strong>العنوان التفصيلي:</strong> ' + (cust.address || '-') + '</div>' +
      (cust.notes ? '<div style="grid-column:1/-1; background:#f5f5f5; padding:6px;"><strong>ملاحظات:</strong> ' + cust.notes + '</div>' : '') +
    '</div>' +
    '<table style="width:100%; border-collapse:collapse; margin-bottom:15px; text-align:right;" border="1">' +
      '<tr style="background:#f0f0f0;">' +
        '<th style="padding:6px;">#</th>' +
        '<th style="padding:6px;">المنتج</th>' +
        '<th style="padding:6px;">الكود</th>' +
        '<th style="padding:6px;">الكمية</th>' +
        '<th style="padding:6px;">المقاس</th>' +
        '<th style="padding:6px;">الإجمالي</th>' +
      '</tr>' +
      (order.items || []).map(function(it, idx) {
        return '<tr>' +
          '<td style="padding:6px;">' + (idx + 1) + '</td>' +
          '<td style="padding:6px;">' + it.name + '</td>' +
          '<td style="padding:6px;">' + (it.code || '-') + '</td>' +
          '<td style="padding:6px;">' + it.quantity + ' × (' + (it.unit || 'قطعة') + ')</td>' +
          '<td style="padding:6px;">' + (it.selectedSize || 'قياسي') + '</td>' +
          '<td style="padding:6px; font-weight:bold;">' + (it.itemTotal || (it.price * (it.multiplier || 1) * it.quantity)) + ' ج.م</td>' +
        '</tr>';
      }).join('') +
    '</table>' +
    '<div style="text-align:left; font-size:1.05rem; line-height:1.6;">' +
      '<div>إجمالي المنتجات: <strong>' + (order.subtotal || 0) + ' ج.م</strong></div>' +
      '<div>مصاريف الشحن: <strong>' + (order.freeShippingApplied ? '0 ج.م (شحن مجاني)' : (order.shippingFee || 0) + ' ج.م') + '</strong></div>' +
      '<div style="font-size:1.3rem; margin-top:5px; border-top:2px solid #000; padding-top:5px;">المبلغ الإجمالي المستحق: <strong>' + (order.grandTotal || 0) + ' ج.م</strong></div>' +
    '</div>' +
  '</div>';

  window.print();
}

/**
 * Export Orders to CSV
 */
function exportOrdersToCSV() {
  if (ordersState.orders.length === 0) {
    showSysToast('لا توجد طلبات لتصديرها', 'warning');
    return;
  }

  let csv = '\uFEFFرقم الطلب,تاريخ الطلب,اسم العميل,رقم الهاتف,المحافظة,العنوان,طريقة الدفع,حالة الطلب,عدد المنتجات,إجمالي المنتجات,مصاريف الشحن,المبلغ الإجمالي,تفاصيل الأصناف\n';

  ordersState.orders.forEach(function(o) {
    const cust = o.customer || {};
    const itemsDesc = (o.items || []).map(function(it) {
      return (it.name || '') + ' [كود:' + (it.code || '') + ' - كمية:' + it.quantity + ' ' + (it.unit || '') + ' - مقاس:' + (it.selectedSize || '') + ']';
    }).join(' | ').replace(/"/g, '""');

    const row = [
      o.id,
      '"' + (o.dateFormatted || formatDate(o.createdAt)) + '"',
      '"' + (cust.name || '').replace(/"/g, '""') + '"',
      '"' + (cust.phone || '').replace(/"/g, '""') + '"',
      '"' + (cust.governorate || '').replace(/"/g, '""') + '"',
      '"' + (cust.address || '').replace(/"/g, '""') + '"',
      '"' + (cust.payMethod || 'دفع عند الاستلام') + '"',
      '"' + o.status + '"',
      (o.items || []).length,
      o.subtotal || 0,
      o.shippingFee || 0,
      o.grandTotal || 0,
      '"' + itemsDesc + '"'
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'طلبات_HM_Store_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showSysToast('📊 تم تصدير ملف الإكسل (CSV) بنجاح', 'success');
}

/**
 * Backup Orders JSON
 */
function backupOrdersJSON() {
  const data = JSON.stringify(ordersState.orders, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'نسخة_احتياطية_طلبات_HM_' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showSysToast('💾 تم حفظ النسخة الاحتياطية JSON بنجاح', 'success');
}

/**
 * Clear All Completed / Cancelled Orders
 */
function clearOldOrders() {
  const toDelete = ordersState.orders.filter(function(o) { return o.status === 'تم التسليم' || o.status === 'ملغي'; });
  const completedCount = toDelete.length;
  if (completedCount === 0) {
    showSysToast('لا توجد طلبات مسلّمة أو ملغية للأرشفة حالياً', 'info');
    return;
  }

  if (confirm('هل ترغب في مسح وأرشفة ' + completedCount + ' طلب من الطلبات المسلمة والملغية نهائياً من السيرفر السحابي؟ (سيتم الإبقاء على الطلبات الجديدة وقيد التجهيز)')) {
    const idsToDelete = toDelete.map(function(o) { return o.id; });
    ordersState.orders = ordersState.orders.filter(function(o) { return o.status !== 'تم التسليم' && o.status !== 'ملغي'; });
    saveOrders();

    if (typeof FirebaseSync !== 'undefined' && FirebaseSync.deleteMultipleOrders) {
      FirebaseSync.deleteMultipleOrders(idsToDelete);
    } else {
      idsToDelete.forEach(function(id) {
        fetch('https://project-hm-1aeff-default-rtdb.firebaseio.com/orders/' + encodeURIComponent(id) + '.json', { method: 'DELETE' }).catch(function() {});
      });
    }

    applyFilters();
    showSysToast('✅ تم تنظيف ومسح ' + completedCount + ' طلب من السحابة بنجاح ولن تعود عند التحديث', 'success');
  }
}

/**
 * Helper to format dates
 */
function formatDate(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  } catch (e) {
    return isoStr;
  }
}

/**
 * System Toast Notification
 */
function showSysToast(message, type) {
  let container = document.getElementById('sysToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sysToastContainer';
    container.className = 'sys-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'sys-toast';
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = '<span style="font-size:1.1rem;">' + icon + '</span> <span>' + message + '</span>';
  container.appendChild(toast);

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}
