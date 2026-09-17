/**
 * HM STORE - FIREBASE REALTIME DATABASE CLOUD SYNC MODULE
 * Provides Multi-Device Instant Realtime Sync for:
 * 1. Customer Orders (Live order arrivals, sound chimes, status updates, deletions)
 * 2. Products Catalog & Edits (Prices, sizes, codes, stock, additions/deletions)
 * 3. Global Store Settings & Free Shipping Promos
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
          if (isConnected) {
            console.log("ðŸ”¥ [Firebase Live] Ù…ØªØµÙ„ Ø¨Ø§Ù„Ø³ÙŠØ±ÙØ± Ø§Ù„Ø³Ø­Ø§Ø¨ÙŠ Ø¨Ù†Ø¬Ø§Ø­!");
            updateConnectionBadge(true);
          } else {
            console.warn("âš ï¸ [Firebase Live] Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø³ÙŠØ±ÙØ± Ø§Ù„Ø³Ø­Ø§Ø¨ÙŠ...");
            updateConnectionBadge(false);
          }
        });
        return true;
      }
    } catch (err) {
      console.warn("Firebase Init Warning:", err);
    }
    return false;
  }

  function updateConnectionBadge(connected) {
    const badges = document.querySelectorAll('.firebase-live-indicator');
    badges.forEach(function(b) {
      if (connected) {
        b.innerHTML = '<span style="color:#10b981; font-size:12px;">â—</span> Ù…ØªØµÙ„ Ø¨Ø§Ù„Ø³ÙŠØ±ÙØ± Ø§Ù„Ø³Ø­Ø§Ø¨ÙŠ (Live)';
        b.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      } else {
        b.innerHTML = '<span style="color:#f59e0b; font-size:12px;">â—</span> Ø¬Ø§Ø±ÙŠ Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ø³ÙŠØ±ÙØ±...';
        b.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      }
    });
  }

  /* ================= ORDERS SYNC ================= */

  /**
   * Save a new order to Firebase Cloud Database (SDK + REST backup)
   */
  async function saveOrder(order) {
    if (!order || !order.id) return;
    
    // 1. Always backup to localStorage
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

    // 2. Direct REST API Call (Instant cross-domain guarantee)
    try {
      fetch(FIREBASE_CONFIG.databaseURL + '/orders/' + encodeURIComponent(order.id) + '.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      }).catch(function(err) {});
    } catch (e) {}

    // 3. Realtime SDK Call
    if (!db) init();
    if (db) {
      try {
        await db.ref('orders/' + order.id).set(order);
        console.log("â˜ï¸ [Firebase] Order (" + order.id + ") saved to cloud!");
      } catch (err) {
        console.error("Firebase saveOrder Error:", err);
      }
    }
  }

  /**
   * Listen to all orders in realtime across all devices & separate domains
   */
  function listenToOrders(onOrdersUpdated, onNewOrderArrived) {
    if (!db) init();

    if (!db) {
      // Fallback REST polling if SDK isn't available
      fetchOrdersRest(onOrdersUpdated);
      return;
    }

    let isFirstLoad = true;

    db.ref('orders').on('value', function(snapshot) {
      const val = snapshot.val();
      const ordersList = [];
      if (val) {
        Object.keys(val).forEach(function(key) {
          if (val[key] && typeof val[key] === 'object') {
            ordersList.push(val[key]);
          }
        });
      }

      // Sort newest first
      ordersList.sort(function(a, b) {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });

      // Update local storage cache
      try {
        localStorage.setItem('hm_store_orders', JSON.stringify(ordersList));
      } catch (e) {}

      if (typeof onOrdersUpdated === 'function') {
        onOrdersUpdated(ordersList);
      }
      isFirstLoad = false;
    });

    // Listen specifically for new incoming orders from other devices
    if (typeof onNewOrderArrived === 'function') {
      db.ref('orders').limitToLast(1).on('child_added', function(snapshot) {
        if (!isFirstLoad) {
          const newOrder = snapshot.val();
          if (newOrder && newOrder.id) {
            onNewOrderArrived(newOrder);
          }
        }
      });
    }
  }

  /**
   * REST API Fallback to fetch orders
   */
  function fetchOrdersRest(callback) {
    fetch(FIREBASE_CONFIG.databaseURL + '/orders.json')
      .then(function(res) { return res.json(); })
      .then(function(data) {
        const list = [];
        if (data) {
          Object.keys(data).forEach(function(k) {
            if (data[k]) list.push(data[k]);
          });
        }
        list.sort(function(a, b) {
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
        try {
          localStorage.setItem('hm_store_orders', JSON.stringify(list));
        } catch (e) {}
        if (typeof callback === 'function') callback(list);
      })
      .catch(function(e) { console.warn('REST fetch orders fallback error:', e); });
  }

  /**
   * Update order status in Firebase
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
        console.log("â˜ï¸ [Firebase] Order (" + orderId + ") status updated to " + newStatus);
      } catch (err) {
        console.error("Firebase updateOrderStatus Error:", err);
      }
    }
  }

  /**
   * Delete order from Firebase (SDK + REST)
   */
  async function deleteOrder(orderId) {
    if (!orderId) return;

    // 1. Update local cache
    try {
      const local = JSON.parse(localStorage.getItem('hm_store_orders') || '[]');
      const filtered = local.filter(function(o) { return o.id !== orderId; });
      localStorage.setItem('hm_store_orders', JSON.stringify(filtered));
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
        console.log("â˜ï¸ [Firebase] Order (" + orderId + ") removed from cloud");
      } catch (err) {
        console.error("Firebase deleteOrder Error:", err);
      }
    }
  }

  /**
   * Clean/Delete multiple orders from Firebase (e.g. all completed/cancelled)
   */
  async function deleteMultipleOrders(orderIds) {
    if (!Array.isArray(orderIds) || orderIds.length === 0) return;

    // Local cache
    try {
      const local = JSON.parse(localStorage.getItem('hm_store_orders') || '[]');
      const filtered = local.filter(function(o) { return !orderIds.includes(o.id); });
      localStorage.setItem('hm_store_orders', JSON.stringify(filtered));
    } catch (e) {}

    for (let i = 0; i < orderIds.length; i++) {
      deleteOrder(orderIds[i]);
    }
  }

  /* ================= PRODUCTS & SETTINGS SYNC ================= */

  /**
   * Save complete custom products list to Cloud
   */
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
        console.log("â˜ï¸ [Firebase] (" + productsList.length + ") Products synced to cloud!");
      } catch (err) {
        console.error("Firebase saveProducts Error:", err);
      }
    }
  }

  /**
   * Listen to products modifications from any phone or PC
   */
  function listenToProducts(onProductsUpdated) {
    if (!db) init();
    if (!db) return;

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

  /**
   * Save Global Store Settings
   */
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
      } catch (err) {
        console.error("Firebase saveSettings Error:", err);
      }
    }
  }

  /**
   * Listen to Global Store Settings
   */
  function listenToSettings(onSettingsUpdated) {
    if (!db) init();
    if (!db) return;

    db.ref('store_settings').on('value', function(snapshot) {
      const settings = snapshot.val();
      if (settings && typeof onSettingsUpdated === 'function') {
        onSettingsUpdated(settings);
      }
    });
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
    listenToSettings: listenToSettings
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
