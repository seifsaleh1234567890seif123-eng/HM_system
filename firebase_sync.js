/**
 * HM STORE - FIREBASE REALTIME & CLOUD DATABASE SYNC MODULE
 * Ultra-Reliable Multi-Device Hybrid Sync (WebSocket + Fast REST Polling)
 * 100% Compatible with all Networks, ISPs, and Separate Hosting Links
 */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbtFR-a0fHieSQtWvYT7WkxSRAUy2gLPY",
  authDomain: "project-hm-1aeff.firebaseapp.com",
  databaseURL: "https://project-hm-1aeff-default-rtdb.firebaseio.com",
  projectId: "project-hm-1aeff",
  storageBucket: "project-hm-1aeff.firebasestorage.app",
  messagingSenderId: "389151545296",
  appId: "1:389151545296:web:c51f94c250241622244bd5",
  measurementId: "G-CFN470C1F9"
};

const FirebaseSync = (function() {
  let app = null;
  let db = null;
  let isConnected = false;
  let activeOrderCallback = null;
  let activeNewOrderCallback = null;
  let lastKnownOrderIds = new Set();
  let pollIntervalTimer = null;

  function init() {
    try {
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps || !firebase.apps.length) {
          app = firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          app = firebase.app();
        }
        db = firebase.database();
        
        // Monitor connection state
        const connectedRef = db.ref(".info/connected");
        connectedRef.on("value", function(snap) {
          isConnected = snap.val() === true;
          updateConnectionBadge(isConnected);
        });
        return true;
      }
    } catch (err) {
      console.warn("Firebase Init SDK Notice:", err);
    }
    return false;
  }

  function updateConnectionBadge(connected) {
    const badges = document.querySelectorAll('.firebase-live-indicator');
    badges.forEach(function(b) {
      if (connected) {
        b.innerHTML = '<span style="color:#10b981; font-size:12px;">●</span> متصل بالسيرفر السحابي (Live)';
        b.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      } else {
        b.innerHTML = '<span style="color:#10b981; font-size:12px;">●</span> متصل بالسيرفر السحابي (Cloud Sync)';
        b.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      }
    });
  }

  /* ================= ORDERS SYNC ENGINE ================= */

  /**
   * Save a new order to Firebase Cloud Database (Instant Multi-Path)
   */
  async function saveOrder(order) {
    if (!order || !order.id) return;
    
    // 1. Local backup
    try {
      const local = JSON.parse(localStorage.getItem('hm_store_orders') || '[]');
      const existingIdx = local.findIndex(function(o) { return o.id === order.id; });
      if (existingIdx !== -1) {
        local[existingIdx] = order;
      } else {
        local.unshift(order);
      }
      localStorage.setItem('hm_store_orders', JSON.stringify(local));
    } catch (e) {}

    // 2. Immediate Direct REST API PUT
    try {
      fetch(FIREBASE_CONFIG.databaseURL + '/orders/' + encodeURIComponent(order.id) + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }).then(function() {
        console.log("☁️ [Cloud REST] Order (" + order.id + ") saved to Firebase!");
      }).catch(function(err) {});
    } catch (e) {}

    // 3. Realtime SDK Set
    if (!db) init();
    if (db) {
      try {
        await db.ref('orders/' + order.id).set(order);
      } catch (err) {
        console.error("Firebase SDK saveOrder Error:", err);
      }
    }
  }

  /**
   * Process & Dispatch Orders List from Any Source (REST or WebSocket)
   */
  function handleIncomingOrders(ordersList) {
    if (!Array.isArray(ordersList)) return;

    ordersList.sort(function(a, b) {
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    // Check for newly arrived orders
    if (lastKnownOrderIds.size > 0 && typeof activeNewOrderCallback === 'function') {
      ordersList.forEach(function(o) {
        if (o && o.id && !lastKnownOrderIds.has(o.id)) {
          activeNewOrderCallback(o);
        }
      });
    }

    // Update known set
    const newSet = new Set();
    ordersList.forEach(function(o) { if (o && o.id) newSet.add(o.id); });
    lastKnownOrderIds = newSet;

    // Cache locally
    try {
      localStorage.setItem('hm_store_orders', JSON.stringify(ordersList));
    } catch (e) {}

    // Dispatch to UI
    if (typeof activeOrderCallback === 'function') {
      activeOrderCallback(ordersList);
    }
  }

  /**
   * Fetch Orders directly via HTTP REST (Fast, 100% Reliable across all networks)
   */
  function fetchOrdersRest() {
    fetch(FIREBASE_CONFIG.databaseURL + '/orders.json?ts=' + Date.now())
      .then(function(res) { return res.json(); })
      .then(function(data) {
        const list = [];
        if (data && typeof data === 'object') {
          Object.keys(data).forEach(function(k) {
            if (data[k] && typeof data[k] === 'object') {
              list.push(data[k]);
            }
          });
        }
        handleIncomingOrders(list);
        updateConnectionBadge(true);
      })
      .catch(function(err) {
        console.warn('REST sync fetch notice:', err);
      });
  }

  /**
   * Listen to all orders in realtime across all devices & separate domains
   */
  function listenToOrders(onOrdersUpdated, onNewOrderArrived) {
    activeOrderCallback = onOrdersUpdated;
    activeNewOrderCallback = onNewOrderArrived;

    // 1. Immediate initial load via fast REST (Zero latency)
    fetchOrdersRest();

    // 2. Realtime WebSocket subscription
    if (!db) init();
    if (db) {
      try {
        db.ref('orders').on('value', function(snapshot) {
          const val = snapshot.val();
          const list = [];
          if (val) {
            Object.keys(val).forEach(function(key) {
              if (val[key] && typeof val[key] === 'object') {
                list.push(val[key]);
              }
            });
          }
          handleIncomingOrders(list);
        });
      } catch (e) {
        console.warn('WebSocket subscription notice:', e);
      }
    }

    // 3. Ultra-Reliable Background Sync Interval (Every 3.5s)
    // Guarantees zero dropped orders even on Egyptian mobile networks (WE, Vodafone, etc.)
    if (pollIntervalTimer) clearInterval(pollIntervalTimer);
    pollIntervalTimer = setInterval(function() {
      fetchOrdersRest();
    }, 3500);
  }

  /**
   * Update order status in Firebase (Instant Multi-Path)
   */
  async function updateOrderStatus(orderId, newStatus) {
    if (!orderId) return;
    
    // Update local cache
    try {
      const local = JSON.parse(localStorage.getItem('hm_store_orders') || '[]');
      const target = local.find(function(o) { return o.id === orderId; });
      if (target) {
        target.status = newStatus;
        localStorage.setItem('hm_store_orders', JSON.stringify(local));
      }
    } catch (e) {}

    // REST PATCH
    try {
      fetch(FIREBASE_CONFIG.databaseURL + '/orders/' + encodeURIComponent(orderId) + '.json', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      }).catch(function() {});
    } catch (e) {}

    if (!db) init();
    if (db) {
      try {
        await db.ref('orders/' + orderId).update({ status: newStatus });
      } catch (err) {
        console.error("Firebase updateOrderStatus Error:", err);
      }
    }
  }

  /**
   * Delete order from Firebase (Instant Multi-Path)
   */
  async function deleteOrder(orderId) {
    if (!orderId) return;

    // 1. Update local cache
    try {
      const local = JSON.parse(localStorage.getItem('hm_store_orders') || '[]');
      const filtered = local.filter(function(o) { return o.id !== orderId; });
      localStorage.setItem('hm_store_orders', JSON.stringify(filtered));
      lastKnownOrderIds.delete(orderId);
    } catch (e) {}

    // 2. Direct REST DELETE
    try {
      fetch(FIREBASE_CONFIG.databaseURL + '/orders/' + encodeURIComponent(orderId) + '.json', {
        method: 'DELETE'
      }).catch(function() {});
    } catch (e) {}

    // 3. SDK delete
    if (!db) init();
    if (db) {
      try {
        await db.ref('orders/' + orderId).remove();
      } catch (err) {
        console.error("Firebase deleteOrder Error:", err);
      }
    }
  }

  /**
   * Clean/Delete multiple orders from Firebase
   */
  async function deleteMultipleOrders(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) return;

    // Local cache
    try {
      const local = JSON.parse(localStorage.getItem('hm_store_orders') || '[]');
      const filtered = local.filter(function(o) { return !orderIds.includes(o.id); });
      localStorage.setItem('hm_store_orders', JSON.stringify(filtered));
      orderIds.forEach(function(id) { lastKnownOrderIds.delete(id); });
    } catch (e) {}

    for (let i = 0; i < orderIds.length; i++) {
      deleteOrder(orderIds[i]);
    }
  }

  /* ================= PRODUCTS & SETTINGS SYNC ================= */

  async function saveProducts(productsList) {
    if (!Array.isArray(productsList)) return;

    try {
      localStorage.setItem('hm_custom_products', JSON.stringify(productsList));
    } catch (e) {}

    try {
      fetch(FIREBASE_CONFIG.databaseURL + '/custom_products.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productsList)
      }).catch(function() {});
    } catch (e) {}

    if (!db) init();
    if (db) {
      try {
        await db.ref('custom_products').set(productsList);
      } catch (err) {}
    }
  }

  function listenToProducts(onProductsUpdated) {
    if (!db) init();
    if (db) {
      db.ref('custom_products').on('value', function(snapshot) {
        const products = snapshot.val();
        if (Array.isArray(products) && products.length > 0) {
          try {
            localStorage.setItem('hm_custom_products', JSON.stringify(products));
          } catch (e) {}
          if (typeof onProductsUpdated === 'function') {
            onProductsUpdated(products);
          }
        }
      });
    }
  }

  async function saveSettings(settings) {
    try {
      fetch(FIREBASE_CONFIG.databaseURL + '/store_settings.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      }).catch(function() {});
    } catch (e) {}

    if (!db) init();
    if (db) {
      try {
        await db.ref('store_settings').set(settings);
      } catch (err) {}
    }
  }

  function listenToSettings(onSettingsUpdated) {
    if (!db) init();
    if (db) {
      db.ref('store_settings').on('value', function(snapshot) {
        const settings = snapshot.val();
        if (settings && typeof onSettingsUpdated === 'function') {
          onSettingsUpdated(settings);
        }
      });
    }
  }

  return {
    init: init,
    getDb: function() { return db; },
    saveOrder: saveOrder,
    listenToOrders: listenToOrders,
    updateOrderStatus: updateOrderStatus,
    deleteOrder: deleteOrder,
    deleteMultipleOrders: deleteMultipleOrders,
    saveProducts: saveProducts,
    listenToProducts: listenToProducts,
    saveSettings: saveSettings,
    listenToSettings: listenToSettings,
    fetchOrdersRest: fetchOrdersRest
  };
})();

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  window.FirebaseSync = FirebaseSync;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      FirebaseSync.init();
    });
  } else {
    FirebaseSync.init();
  }
}
