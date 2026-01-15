/**
 * RESTAURANT MENU APP
 * Handles both Client and Admin logic.
 */

// Global Error Handler for Debugging on Mobile/Tablet
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('Error: ' + msg);
    return false;
};

// Supabase Configuration - PLEASE FILL THESE
const SUPABASE_URL = 'https://npcguralvmfhgeohstom.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wY2d1cmFsdm1maGdlb2hzdG9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0MzgyMDIsImV4cCI6MjA4NDAxNDIwMn0.vTbOJmIGAe5eEP4fN6F5s49WBiOKMJnWX_qSFbL0ugA';

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.warn("Supabase not initialized. Please set SUPABASE_URL and SUPABASE_KEY in script.js");
}

const DEFAULT_MENU = []; // Emptied as requested

const DEFAULT_CATEGORIES = [
    { id: "all", name: "الكل" },
    { id: "meals", name: "وجبات" },
    { id: "drinks", name: "مشروبات" },
    { id: "desserts", name: "حلويات" }
];

class AppState {
    constructor() {
        this.menu = this.load('menu', DEFAULT_MENU);
        this.orders = this.load('orders', []);
        this.categories = this.load('categories', DEFAULT_CATEGORIES);
        this.cart = []; // Start empty on every session (refresh/close)
        this.soundEnabled = this.load('sound_enabled', false);
        this.restaurantInfo = this.load('restaurant_info', {
            name: 'LinCart Cafe',
            slogan: 'أهلاً بك',
            currency: 'د.ل'
        });

        const defaultUsers = [
            { id: 1, name: 'مدير النظام', username: 'admin', password: '123', role: 'admin' }
        ];
        this.users = this.load('users', defaultUsers);
        this.currentUser = this.load('current_user', null);

        // Background Sync if Supabase is ready
        this.sync();

        // Proactive Cleanup (Keep for local cache limit)
        this.cleanupStorage();
    }

    async sync() {
        if (!supabaseClient) return;

        try {
            console.log("Syncing with Supabase...");

            // Sync Categories
            const { data: cats, error: catErr } = await supabaseClient.from('categories').select('*');
            if (!catErr && cats) {
                this.categories = cats;
                this.save('categories', cats);
            }

            // Sync Menu
            const { data: menu, error: menuErr } = await supabaseClient.from('menu_items').select('*');
            if (!menuErr && menu) {
                this.menu = menu;
                this.save('menu', menu);
            }

            // Sync Orders (Only recent ones maybe? Let's take all for now)
            const { data: orders, error: orderErr } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
            if (!orderErr && orders) {
                this.orders = orders;
                this.save('orders', orders);
            }

            // Sync Users
            const { data: users, error: userErr } = await supabaseClient.from('users').select('*');
            if (!userErr && users) {
                this.users = users;
                this.save('users', users);
            }

            console.log("Sync Complete.");

            // Re-render UI if on admin or client
            if (typeof renderMenu === 'function') renderMenu('all');
            if (typeof renderOrders === 'function') renderOrders();
            if (typeof updateStats === 'function') updateStats();
            if (typeof renderCategories === 'function') renderCategories();

        } catch (e) {
            console.error("Sync Failed", e);
        }
    }

    cleanupStorage() {
        try {
            // Radical Fix: Remove images from ALL existing orders to free space
            if (this.orders && this.orders.length > 0) {
                let movedSpace = false;
                this.orders = this.orders.map(o => {
                    o.items = o.items.map(i => {
                        if (i.image) {
                            const { image, ...rest } = i;
                            movedSpace = true;
                            return rest;
                        }
                        return i;
                    });
                    return o;
                });

                if (movedSpace) {
                    console.log("Optimized existing orders by removing images.");
                    this.save('orders', this.orders);
                }
            }

            let total = 0;
            for (let x in localStorage) {
                if (localStorage.hasOwnProperty(x)) total += (localStorage[x].length * 2);
            }
            // If usage > 4MB (approx 5MB limit)
            if (total > 4 * 1024 * 1024) {
                console.warn("Storage still full, force trimming...");
                if (this.orders.length > 10) {
                    this.orders = this.orders.slice(0, 10);
                    this.save('orders', this.orders);
                }
            }
        } catch (e) {
            console.error("Cleanup Error", e);
        }
    }



    // Custom UI Helpers
    // Custom UI Helpers
    confirm(title, msg, type = 'info', callback) {
        if (typeof msg === 'function') {
            callback = msg;
            msg = title;
            title = 'تأكيد الإجراء';
        }

        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const msgEl = document.getElementById('confirm-msg');
        const iconEl = document.getElementById('confirm-icon');
        const yesBtn = document.getElementById('confirm-yes-btn');
        const noBtn = document.getElementById('confirm-no-btn') || document.querySelector('#confirm-modal .btn-secondary');

        if (!modal) return confirm(msg) && callback();

        titleEl.innerText = title;
        msgEl.innerText = msg;

        // Setup Type
        if (type === 'danger') {
            iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#e74c3c; font-size: 2.5rem;"></i>';
            yesBtn.style.backgroundColor = '#e74c3c';
        } else {
            iconEl.innerHTML = '<i class="fa-solid fa-circle-question" style="color:#2ecc71; font-size: 2.5rem;"></i>';
            yesBtn.style.backgroundColor = '#2ecc71';
        }

        modal.style.display = 'flex';

        yesBtn.onclick = () => {
            modal.style.display = 'none';
            if (callback) callback();
        };

        if (noBtn) noBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    alert(msg, type = 'success') {
        const toast = document.getElementById('toast');
        if (!toast) return alert(msg);

        toast.innerText = msg;
        toast.className = `toast show-toast ${type === 'danger' || type === 'error' ? 'error' : ''}`;
        toast.style.backgroundColor = (type === 'danger' || type === 'error') ? '#e74c3c' : '#2ecc71';

        setTimeout(() => {
            toast.className = 'toast hidden';
        }, 3000);
    }

    load(key, fallback) {
        try {
            const data = localStorage.getItem('rest_app_' + key);
            return data ? JSON.parse(data) : fallback;
        } catch (e) {
            console.error("Storage Load Error", e);
            return fallback;
        }
    }

    save(key, data) {
        try {
            localStorage.setItem('rest_app_' + key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error("Storage Save Error", e);

            // Auto-Cleanup Strategy for Orders
            if (key === 'orders' && this.orders.length > 20) {
                // Keep only the last 50 orders, prioritizing keeping 'new' or 'preparing'
                // For simplicity: just keep last 50.
                try {
                    const trimmed = data.slice(0, 50);
                    localStorage.setItem('rest_app_' + key, JSON.stringify(trimmed));
                    this.orders = trimmed; // Update in-memory
                    this.alert("تم حذف الأرشيف القديم لتوفير مساحة", "warning");
                    return true;
                } catch (retryErr) {
                    return false;
                }
            }

            if (this.alert) this.alert("فشل حفظ البيانات! الذاكرة ممتلئة.", "error");
            return false;
        }
    }


    resetData() {
        this.confirm('إعادة تعيين المصنع', 'تحذير: هذا سيؤدي إلى مسح جميع الأصناف والطلبات والإعدادات نهائياً من هذا المتصفح. هل تريد المتابعة؟', 'danger', () => {
            localStorage.clear();
            this.alert('تم مسح جميع البيانات بنجاح', 'success');
            setTimeout(() => location.reload(), 1500);
        });
    }


    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        this.save('sound_enabled', this.soundEnabled);
        return this.soundEnabled;
    }

    updateRestaurantInfo(data) {
        this.restaurantInfo = { ...this.restaurantInfo, ...data };
        this.save('restaurant_info', this.restaurantInfo);
    }

    async addMenuItem(item) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.from('menu_items').insert([item]).select();
            if (error) {
                this.alert("فشل إضافة الصنف لقاعدة البيانات", "error");
                console.error(error);
                return;
            }
            if (data) this.menu.push(data[0]);
        } else {
            item.id = Date.now();
            this.menu.push(item);
        }
        this.save('menu', this.menu);
        this.alert("تم إضافة الصنف بنجاح", "success");
    }

    async updateMenuItem(id, updates) {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('menu_items').update(updates).eq('id', id);
            if (error) {
                this.alert("فشل تحديث الصنف", "error");
                console.error(error);
                return;
            }
        }
        const idx = this.menu.findIndex(m => m.id == id);
        if (idx > -1) {
            this.menu[idx] = { ...this.menu[idx], ...updates };
            this.save('menu', this.menu);
            this.alert("تم تحديث الصنف", "success");
        }
    }

    async deleteMenuItem(id) {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('menu_items').delete().eq('id', id);
            if (error) {
                this.alert("فشل حذف الصنف", "error");
                console.error(error);
                return;
            }
        }
        this.menu = this.menu.filter(m => m.id != id);
        this.save('menu', this.menu);
        this.alert("تم حذف الصنف", "success");
    }

    async addCategory(cat) {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('categories').insert([cat]);
            if (error) {
                this.alert("فشل إضافة التصنيف", "error");
                console.error(error);
                return;
            }
        }
        // Avoid duplicates in memory
        if (!this.categories.find(c => c.id === cat.id)) {
            this.categories.push(cat);
            this.save('categories', this.categories);
            this.alert("تم إضافة التصنيف", "success");
        }
    }

    async deleteCategory(id) {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('categories').delete().eq('id', id);
            if (error) {
                this.alert("فشل حذف التصنيف", "error");
                console.error(error);
                return;
            }
        }
        this.categories = this.categories.filter(c => c.id !== id);
        this.save('categories', this.categories);
        this.alert("تم حذف التصنيف", "success");
    }

    generateUniqueId() {
        let newId;
        let isDuplicate = true;
        while (isDuplicate) {
            // Mix Date.now random slice with a random digit to increase entropy
            newId = (Math.floor(Math.random() * 900000) + 100000).toString();
            isDuplicate = this.orders.some(o => o.id === newId);
        }
        return newId;
    }

    async placeOrder(customerName, items, note = '') {
        // Optimization: Strip images from items to save huge space
        const optimizedItems = items.map(i => {
            const { image, ...rest } = i; // Remove image property
            return rest;
        });

        const order = {
            id: this.generateUniqueId(),
            customer: customerName,
            items: optimizedItems,
            note: note,
            total: items.reduce((sum, item) => sum + (item.price * item.qty), 0),
            status: "new",
            timestamp: new Date().toISOString()
        };

        if (supabaseClient) {
            const { error } = await supabaseClient.from('orders').insert([order]);
            if (error) {
                this.alert("فشل إرسال الطلب لقاعدة البيانات", "error");
                console.error(error);
                // We proceed to save locally as fallback, but warn the user
            }
        }

        this.orders.unshift(order);

        // Attempt Local Save
        const success = this.save('orders', this.orders);

        if (!success) {
            this.orders = this.orders.slice(0, 10);
            this.save('orders', this.orders);
        }
        return order;
    }

    async updateOrderStatus(orderId, status) {
        if (supabaseClient) {
            const { error } = await supabaseClient.from('orders').update({ status }).eq('id', orderId);
            if (error) {
                this.alert("فشل تحديث حالة الطلب في السيرفر", "error");
                console.error(error);
            }
        }
        const order = this.orders.find(o => o.id == orderId);
        if (order) {
            order.status = status;
            this.save('orders', this.orders);
        }
    }

    logout() {
        this.confirm('تسجيل الخروج', 'هل أنت متأكد من رغبتك في تسجيل الخروج؟', 'info', () => {
            this.currentUser = null;
            this.save('current_user', null);
            this.alert('تم تسجيل الخروج بنجاح');
            setTimeout(() => {
                const isLoginPage = window.location.pathname.includes('login.html');
                if (!isLoginPage) window.location.href = 'login.html';
                else location.reload();
            }, 1000);
        });
    }

    async login(username, password) {
        if (supabaseClient) {
            const { data, error } = await supabaseClient.from('users')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (error || !data) return false;

            this.currentUser = data;
            this.save('current_user', data);
            return true;
        }

        const user = this.users.find(u => u.username === username && u.password === password);
        if (user) {
            this.currentUser = user;
            this.save('current_user', user);
            return true;
        }
        return false;
    }

    hasPermission(permission) {
        if (!this.currentUser) return false;
        if (this.currentUser.role === 'admin') return true;

        // Employee permissions
        const employeePermissions = ['view_orders', 'update_orders', 'view_menu'];
        return employeePermissions.includes(permission);
    }

    prompt(title, callback) {
        const modal = document.getElementById('prompt-modal');
        const titleEl = document.getElementById('prompt-title');
        const inputEl = document.getElementById('prompt-input');
        const okBtn = document.getElementById('prompt-ok-btn') || document.getElementById('prompt-modal').querySelector('.btn-primary');

        if (!modal) return callback(prompt(title));

        titleEl.innerText = title;
        inputEl.value = '';
        modal.style.display = 'flex';
        inputEl.focus();

        const finish = () => {
            const val = inputEl.value.trim();
            if (val) {
                modal.style.display = 'none';
                callback(val);
            }
        };

        okBtn.onclick = finish;
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') finish();
        };
    }

    getCatName(catId) {
        const cat = this.categories.find(c => c.id === catId);
        return cat ? cat.name : 'عام';
    }
}

const app = new AppState();

// --- CLIENT SIDE LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    // Shared Global Updates
    updateClientHeader();
    startDashboardClock();

    if (document.getElementById('menu-container')) {
        initClient();
    }
    // --- ADMIN SIDE LOGIC ---
    if (document.querySelector('.admin-layout')) {
        initAdmin();
    }
});

function initClient() {
    const menuContainer = document.getElementById('menu-container');
    const categoriesContainer = document.getElementById('categories-container');
    const cartBtn = document.getElementById('cart-btn');
    const cartModalOverlay = document.getElementById('cart-modal');
    const closeCart = document.getElementById('close-cart');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartTotalEl = document.getElementById('cart-total');
    const cartCountEl = document.getElementById('cart-count');
    const checkoutBtn = document.getElementById('checkout-btn');
    const bottomBar = document.getElementById('bottom-cart-bar');
    const barCount = document.getElementById('bar-count');
    const barTotal = document.getElementById('bar-total');
    const barCheckoutBtn = document.getElementById('bar-checkout-btn');
    const searchBtn = document.querySelector('.search-btn');

    // Check for Display Mode (Read Only)
    const urlParams = new URLSearchParams(window.location.search);
    const isDisplayMode = urlParams.get('mode') === 'display';

    if (isDisplayMode) {
        if (cartBtn) cartBtn.style.display = 'none';
        if (bottomBar) bottomBar.style.display = 'none';
        document.body.classList.add('display-mode');
    }

    // Initial Render
    renderCategories();
    renderMenu('all');
    updateCartUI(); // Initial check for bottom bar

    // Event Listeners
    categoriesContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.cat-pill');
        if (btn) {
            document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenu(btn.dataset.cat);
            // Smooth scroll to fit centered if needed (optional)
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    });

    if (cartBtn) cartBtn.addEventListener('click', toggleCart);
    if (closeCart) closeCart.addEventListener('click', toggleCart);

    // Bottom bar checkout opens cart
    if (barCheckoutBtn) barCheckoutBtn.addEventListener('click', toggleCart);

    if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);

    // Search (Simple implementation: toggle simple prompt or filter)
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            app.prompt('ابحث عن صنف:', (val) => {
                // Simple hack: filter menu by text
                const items = app.menu.filter(i => i.name.includes(val));
                renderMenuCustom(items);
            });
        });
    }

    // Init Track Order
    initTrackOrder();

    function initTrackOrder() {
        const trackBtn = document.getElementById('track-btn');
        const trackModal = document.getElementById('track-modal');
        const closeTrack = document.getElementById('close-track');
        const trackInput = document.getElementById('track-input');
        const trackSubmit = document.getElementById('track-submit-btn');
        const resultDiv = document.getElementById('track-result');
        const statusIcon = document.getElementById('track-status-icon');
        const statusText = document.getElementById('track-status-text');
        const trackTime = document.getElementById('track-time');

        if (!trackBtn) return;

        trackBtn.addEventListener('click', () => {
            trackModal.style.display = 'flex';
            trackInput.value = '';
            resultDiv.style.display = 'none';
        });

        closeTrack.addEventListener('click', () => {
            trackModal.style.display = 'none';
        });

        trackSubmit.addEventListener('click', () => {
            const id = trackInput.value.trim().replace('#', '');
            if (!id) return app.alert("أدخل رقم الطلب", "error");

            // Refresh data from 'database' (localStorage) before search
            app.orders = app.load('orders', []);
            const order = app.orders.find(o => o.id === id);

            if (order) {
                resultDiv.style.display = 'block';
                let statusAr = 'غير معروف';
                let icon = '';
                let color = '';

                switch (order.status) {
                    case 'new':
                        statusAr = 'قيد الانتظار';
                        icon = '<i class="fa-solid fa-clock"></i>';
                        color = '#f1c40f';
                        break;
                    case 'cooking':
                        statusAr = 'جاري التحضير';
                        icon = '<i class="fa-solid fa-fire-burner"></i>';
                        color = '#e67e22';
                        break;
                    case 'ready':
                        statusAr = 'جاهز للاستلام';
                        icon = '<i class="fa-solid fa-bell-concierge"></i>';
                        color = '#2ecc71';
                        break;
                    case 'delivered':
                        statusAr = 'مكتمل';
                        icon = '<i class="fa-solid fa-check-circle"></i>';
                        color = '#2c3e50';
                        break;
                    case 'cancelled':
                        statusAr = 'ملغي';
                        icon = '<i class="fa-solid fa-ban"></i>';
                        color = '#e74c3c';
                        break;
                }

                statusIcon.innerHTML = icon;
                statusIcon.style.color = color;
                statusText.innerText = statusAr;
                statusText.style.color = color;
                trackTime.innerText = new Date(order.timestamp).toLocaleString('ar-LY');

            } else {
                app.alert("رقم الطلب غير صحيح", "error");
                resultDiv.style.display = 'none';
            }
        });
    }

    // Helper Functions
    function renderCategories() {
        categoriesContainer.innerHTML = app.categories.map(cat =>
            `<button class="cat-pill ${cat.id === 'all' ? 'active' : ''}" data-cat="${cat.id}">
                ${cat.id === 'all' ? '<i class="fa-solid fa-utensils"></i>' : ''}
                <span>${cat.name}</span>
            </button>`
        ).join('');
    }

    function renderMenuCustom(itemsOverride) {
        menuContainer.innerHTML = '';
        // Show all items, even inactive ones (which means unavailable)
        const items = itemsOverride || app.menu;

        if (items.length === 0) {
            menuContainer.innerHTML = `
                <div class="premium-empty-state" style="padding: 2rem; text-align: center; color: #888;">
                    <i class="fa-solid fa-utensils" style="font-size: 2rem; margin-bottom: 1rem; color: #ddd;"></i>
                    <h3>لا توجد أصناف</h3>
                </div>
            `;
            return;
        }

        items.forEach(item => {
            const inCart = app.cart.find(c => c.id === item.id);
            const qty = inCart ? inCart.qty : 0;
            const isUnavailable = !item.active;

            const card = document.createElement('div');
            card.className = `menu-card ${isUnavailable ? 'unavailable' : ''}`;
            card.id = `menu-item-${item.id}`;

            let actionHtml = '';
            if (isDisplayMode) {
                actionHtml = '';
            } else if (isUnavailable) {
                // Disabled controls for unavailable items
                actionHtml = `
                    <div class="qty-control">
                        <button class="qty-btn" disabled style="cursor:not-allowed;">+</button>
                        <div class="qty-val">0</div>
                        <button class="qty-btn" disabled style="cursor:not-allowed;">-</button>
                    </div>
                `;
            } else {
                // Always Show Qty Control (Default 0)
                actionHtml = `
                    <div class="qty-control">
                        <button class="qty-btn" onclick="updateItemQty(${item.id}, 1)">+</button>
                        <div class="qty-val">${qty}</div>
                        <button class="qty-btn" onclick="updateItemQty(${item.id}, -1)">-</button>
                    </div>
                `;
            }

            // Image Container with Badge if unavailable
            const imgHtml = `
                <div style="position: relative;">
                    <img src="${item.image}" alt="${item.name}" class="menu-card-img" loading="lazy">
                    ${isUnavailable ? '<span class="badge-unavailable">غير متوفر</span>' : ''}
                </div>
            `;

            card.innerHTML = `
                <div class="menu-card-info">
                    <div class="menu-card-title">${item.name}</div>
                    <div class="menu-card-desc">${item.description || ''}</div>
                    <div class="menu-card-footer">
                        <div class="menu-card-price">${item.price.toFixed(2)} د.ل</div>
                        <div class="action-btn-wrapper" id="action-wrapper-${item.id}">
                            ${actionHtml}
                        </div>
                    </div>
                </div>
                ${imgHtml}
            `;
            menuContainer.appendChild(card);
        });
    }

    function renderMenu(filter) {
        if (filter === 'all') {
            // Pass all items regardless of active status
            renderMenuCustom(app.menu);
        } else {
            // Pass items for category regardless of active status
            const items = app.menu.filter(item => item.category === filter);
            renderMenuCustom(items);
        }
    }

    // Optimized: Only re-render the action wrapper of the specific item
    function updateItemCardUI(id) {
        const itemInCart = app.cart.find(c => c.id === id);
        const qty = itemInCart ? itemInCart.qty : 0;
        const wrapper = document.getElementById(`action-wrapper-${id}`);
        if (!wrapper) return;

        wrapper.innerHTML = `
            <div class="qty-control">
                <button class="qty-btn" onclick="updateItemQty(${id}, 1)">+</button>
                <div class="qty-val">${qty}</div>
                <button class="qty-btn" onclick="updateItemQty(${id}, -1)">-</button>
            </div>
        `;
    }

    window.addToCart = (id) => {
        const item = app.menu.find(m => m.id === id);
        const existing = app.cart.find(c => c.id === id);
        if (existing) {
            existing.qty++;
        } else {
            app.cart.push({ ...item, qty: 1 });
        }
        app.save('cart', app.cart);

        updateItemCardUI(id);
        updateCartUI();

        // Simple vibration/feedback
        if (navigator.vibrate) navigator.vibrate(50);
    };

    window.updateItemQty = (id, change) => {
        const idx = app.cart.findIndex(c => c.id === id);
        if (idx > -1) {
            app.cart[idx].qty += change;
            if (app.cart[idx].qty <= 0) {
                app.cart.splice(idx, 1);
            }
        } else if (change > 0) {
            // Edge case: adding from 0 if somehow triggered
            const item = app.menu.find(m => m.id === id);
            app.cart.push({ ...item, qty: 1 });
        }
        app.save('cart', app.cart);

        updateItemCardUI(id);
        updateCartUI();
    };

    function updateCartUI() {
        let total = 0;
        let count = 0;

        // Populate modal list
        cartItemsContainer.innerHTML = '';

        if (app.cart.length === 0) {
            cartItemsContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:#aaa;">السلة فارغة</div>';
            bottomBar.classList.add('hidden');
            if (document.getElementById('track-btn')) {
                document.getElementById('track-btn').classList.remove('raised');
            }
        } else {
            bottomBar.classList.remove('hidden');
            if (document.getElementById('track-btn')) {
                document.getElementById('track-btn').classList.add('raised');
            }

            app.cart.forEach(item => {
                total += item.price * item.qty;
                count += item.qty;

                const div = document.createElement('div');
                div.className = 'cart-item-row';
                div.innerHTML = `
                    <div class="cart-item-info">
                        <img src="${item.image}" class="cart-item-img">
                        <div>
                            <div style="font-weight:700; font-size:0.95rem;">${item.name}</div>
                            <small class="text-muted">${item.price} د.ل</small>
                        </div>
                    </div>
                    <div class="qty-control" style="height: 30px;">
                        <button class="qty-btn" onclick="updateItemQty(${item.id}, 1)">+</button>
                        <div class="qty-val">${item.qty}</div>
                        <button class="qty-btn" onclick="updateItemQty(${item.id}, -1)">-</button>
                    </div>
                `;
                cartItemsContainer.appendChild(div);
            });
        }

        // Update Totals
        const totalStr = total.toFixed(2);
        cartTotalEl.innerText = totalStr + ' د.ل';
        cartCountEl.innerText = count;

        // Update Bottom Bar with Arabic Pluralization
        if (barTotal) barTotal.innerText = totalStr + ' د.ل';
        const countBox = document.getElementById('bar-count-box');
        if (countBox) {
            let label = 'أصناف';
            if (count === 1) label = 'صنف';
            else if (count === 2) label = 'صنفان';

            // For count 1 and 2, we can just show the word or number + word
            // User requested: 1 -> صنف, 2 -> صنفان, 3+ -> اصناف
            if (count === 1) countBox.innerText = `1 صنف`;
            else if (count === 2) countBox.innerText = `2 صنفان`;
            else countBox.innerText = `${count} أصناف`;
        }
    }

    function toggleCart() {
        cartModalOverlay.classList.toggle('active');
        if (cartModalOverlay.classList.contains('active')) {
            cartModalOverlay.onclick = (e) => {
                if (e.target === cartModalOverlay) toggleCart();
            }
        }
    }

    // Toggle Delivery Fields Visibility
    const orderInputsDiv = document.querySelector('.order-inputs');
    const radioInputs = document.querySelectorAll('input[name="orderType"]');

    function updateDeliveryFields() {
        const type = document.querySelector('input[name="orderType"]:checked').value;
        if (type === 'delivery') {
            orderInputsDiv.style.display = 'block';
        } else {
            orderInputsDiv.style.display = 'none';
        }
    }

    radioInputs.forEach(r => r.addEventListener('change', updateDeliveryFields));
    updateDeliveryFields(); // Initial state

    async function handleCheckout() {
        if (app.cart.length === 0) return app.alert('السلة فارغة!', 'error');

        const orderType = document.querySelector('input[name="orderType"]:checked').value;
        let customerStr = '';

        if (orderType === 'delivery') {
            const nameVal = document.getElementById('cust-name').value.trim();
            const phoneVal = document.getElementById('cust-phone').value.trim();

            if (!nameVal) return app.alert('الرجاء إدخال الاسم', 'error');
            if (!phoneVal) return app.alert('الرجاء إدخال رقم الهاتف', 'error');

            customerStr = `${nameVal} - ${phoneVal} \n (توصيل)`;
        } else {
            // Pickup / Local
            customerStr = `طلب استلام`;
        }

        try {
            const noteEl = document.getElementById('order-note');
            const noteVal = noteEl ? noteEl.value.trim() : '';
            const order = await app.placeOrder(customerStr, [...app.cart], noteVal);

            // Clear Cart
            app.cart = [];
            app.save('cart', app.cart);

            // Reset UI
            updateCartUI();
            toggleCart(); // Close cart modal
            document.getElementById('cust-name').value = '';
            document.getElementById('cust-phone').value = '';
            document.getElementById('order-note').value = '';

            // Show Confirmation
            const confirmScreen = document.getElementById('confirmation-screen');
            const confirmId = document.getElementById('confirmed-order-id');
            const closeConfirm = document.getElementById('close-confirmation');

            confirmId.innerText = '#' + order.id;
            confirmScreen.classList.add('active');

            closeConfirm.onclick = () => {
                location.reload();
            };

        } catch (e) {
            console.error("Checkout Error", e);
            app.alert("حدث خطأ: " + e.message, 'error');
        }
    }

    // Toast Logic reused from AppState or existing... kept simple here
    // We can rely on AppState.alert for notifications now
}

function updateClientHeader() {
    const nameEl = document.getElementById('app-rest-name');
    const sloganEl = document.getElementById('app-rest-slogan');

    const sidebarName = document.getElementById('sidebar-app-name');
    const dashboardRestName = document.getElementById('dashboard-rest-name');

    if (app.restaurantInfo) {
        if (nameEl) nameEl.innerText = app.restaurantInfo.name;
        if (sloganEl) sloganEl.innerText = app.restaurantInfo.slogan;
        if (sidebarName) sidebarName.innerText = app.restaurantInfo.name;
        if (dashboardRestName) dashboardRestName.innerText = app.restaurantInfo.name;
        document.title = app.restaurantInfo.name;
    }
}

function startDashboardClock() {
    const timeEl = document.getElementById('dashboard-time');
    const dateEl = document.getElementById('dashboard-date');
    const msgEl = document.getElementById('dashboard-welcome-msg');

    if (!timeEl) return;

    const update = () => {
        const now = new Date();
        timeEl.innerText = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        dateEl.innerText = now.toLocaleDateString('ar-LY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // Welcome Msg based on time
        if (msgEl) {
            const hour = now.getHours();
            if (hour < 12) msgEl.innerText = 'صباح الخير، نتمنى لك يوماً مثمراً';
            else if (hour < 18) msgEl.innerText = 'طاب يومك، استمر في العمل الرائع';
            else msgEl.innerText = 'مساء الخير، نهاية يوم موفقة';
        }
    };

    update();
    setInterval(update, 1000);
}

// --- ADMIN SIDE LOGIC ---
// Managed by DOMContentLoaded above

function initAdmin() {
    const adminMenuContainer = document.getElementById('admin-menu-container');
    const menuSearch = document.getElementById('menu-search');
    let currentFilter = 'all';
    let audioCtx = null;

    // --- Authentication & UI Prep ---
    if (app.currentUser) {
        document.getElementById('sidebar-user-name').innerText = app.currentUser.name;
        document.getElementById('dashboard-welcome-msg').innerText = `أهلاً بك، طاب يومك ${app.currentUser.name}`;

        // Show Users link only for admins
        const usersMenuItem = document.getElementById('sidebar-users-item');
        if (usersMenuItem) usersMenuItem.style.display = app.currentUser.role === 'admin' ? 'block' : 'none';

        // Restrict actions if employee
        if (app.currentUser.role !== 'admin') {
            // Hide delete buttons in admin menu and other admin-only elements via CSS
            document.body.classList.add('role-employee');
        } else {
            document.body.classList.remove('role-employee');
        }
    }

    // --- Helper Funcs (Scoped to initAdmin) ---
    // getCatName moved to AppState class

    function renderAdminFilters() {
        const controlsBar = document.getElementById('admin-category-filters');
        if (!controlsBar) return;
        controlsBar.innerHTML = '';
        app.categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = `filter-tag ${currentFilter === cat.id ? 'active' : ''}`;
            btn.innerText = cat.name;
            btn.onclick = () => {
                currentFilter = cat.id;
                renderAdminFilters();
                renderAdminMenu();
            };
            controlsBar.appendChild(btn);
        });
    }

    function populateCategoryDropdown() {
        const select = document.getElementById('item-cat');
        if (!select) return;
        select.innerHTML = '';
        app.categories.forEach(cat => {
            if (cat.id === 'all') return;
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.innerText = cat.name;
            select.appendChild(opt);
        });
    }

    function renderAdminMenu() {
        if (!adminMenuContainer) return;
        adminMenuContainer.innerHTML = '';
        const searchTerm = menuSearch ? menuSearch.value.toLowerCase() : '';

        const items = app.menu.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm);
            const matchesFilter = currentFilter === 'all' || item.category === currentFilter;
            return matchesSearch && matchesFilter;
        });

        if (items.length === 0) {
            adminMenuContainer.innerHTML = `
                <div class="premium-empty-state">
                    <i class="fa-solid fa-box-open"></i>
                    <h3>لم نجد أي أصناف</h3>
                    <p>جرب البحث بكلمة أخرى أو قم بتغيير التصنيف المختار</p>
                </div>
            `;
            return;
        }

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'premium-item-card';
            card.innerHTML = `
                <div class="item-card-image">
                    <img src="${item.image}" alt="${item.name}" loading="lazy">
                    <div class="item-card-overlay"></div>
                    <span class="item-card-badge">${app.getCatName(item.category)}</span>
                    <div class="item-card-status-pill ${item.active ? 'status-pill-active' : 'status-pill-inactive'}">
                        <i class="fa-solid ${item.active ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                        ${item.active ? 'متاح' : 'غير متاح'}
                    </div>
                </div>
                <div class="item-card-content">
                    <h4>${item.name}</h4>
                    <p>${item.desc || 'لا يوجد وصف لهذا الصنف حالياً.'}</p>
                    <div class="item-card-footer">
                        <div class="item-card-price">${item.price.toFixed(2)} د.ل</div>
                        <div class="item-card-actions">
                            <button class="item-btn-circle item-btn-toggle" onclick="toggleItemStatus(${item.id}, ${!item.active})" title="${item.active ? 'إيقاف' : 'تفعيل'}">
                                <i class="fa-solid ${item.active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                            </button>
                            <button class="item-btn-circle item-btn-edit" onclick="editItem(${item.id})" title="تعديل">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="item-btn-circle item-btn-delete" onclick="deleteItem(${item.id})" title="حذف">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
            adminMenuContainer.appendChild(card);
        });
    }

    function renderOrders() {
        const ordersGrid = document.getElementById('orders-grid');
        if (!ordersGrid) return;
        ordersGrid.innerHTML = '';
        if (app.orders.length === 0) {
            ordersGrid.innerHTML = '<div style="width:100%; text-align:center; padding:3rem; color:#aaa; grid-column: 1/-1;">لا توجد طلبات حالياً</div>';
            return;
        }
        app.orders.forEach(order => {
            const card = document.createElement('div');
            card.className = `order-card status-${order.status}-border`;
            const timeString = new Date(order.timestamp).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });

            const itemsHtml = order.items.map(i => `
                <div class="simple-item">
                    <span class="item-qty-badge">${i.qty}</span>
                    <span class="item-name">${i.name}</span>
                </div>
            `).join('');

            let actionBtn = '';
            if (order.status === 'new') {
                actionBtn = `
                    <div class="order-actions-row">
                        <button onclick="changeStatus('${order.id}', 'cooking')" class="action-btn-simple btn-accept">
                            <i class="fa-solid fa-check"></i> قبول
                        </button>
                        <button onclick="cancelOrder('${order.id}')" class="action-btn-simple btn-cancel">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>`;
            } else if (order.status === 'cooking') {
                actionBtn = `<button onclick="changeStatus('${order.id}', 'ready')" class="action-btn-simple btn-next"><i class="fa-solid fa-fire-burner"></i> تجهيز الطلب</button>`;
            } else if (order.status === 'ready') {
                actionBtn = `<button onclick="changeStatus('${order.id}', 'delivered')" class="action-btn-simple btn-next"><i class="fa-solid fa-truck-ramp-box"></i> تسليم</button>`;
            } else if (order.status === 'cancelled') {
                actionBtn = `<span style="color:#ef4444; font-size:0.8rem; font-weight:800;"><i class="fa-solid fa-circle-xmark"></i> تم الإلغاء</span>`;
            } else {
                actionBtn = `<span style="color:#2ecc71; font-size:0.8rem; font-weight:800;"><i class="fa-solid fa-circle-check"></i> مكتمل</span>`;
            }

            card.innerHTML = `
                <div class="order-top">
                    <div class="order-meta">
                        <h3>
                            <div class="order-customer-icon"><i class="fa-solid fa-user"></i></div>
                            #${order.id} - ${order.customer}
                        </h3>
                        <span><i class="fa-regular fa-clock"></i> ${timeString}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                        <span class="order-status-badge status-${order.status}">${getStatusLabel(order.status)}</span>
                        <button class="item-btn-circle" onclick="printOrder('${order.id}')" title="طباعة ريسيت" style="background:#f8fafc; color:#64748b; border:1px solid #e2e8f0; width:34px; height:34px;">
                            <i class="fa-solid fa-print"></i>
                        </button>
                    </div>
                </div>
                <div class="order-items">
                    ${itemsHtml}
                </div>
                ${order.note ? `
                    <div class="order-note-display">
                        <i class="fa-solid fa-message-dots"></i>
                        ${order.note}
                    </div>
                ` : ''}
                <div class="order-bottom">
                    <div class="order-total-wrapper">
                        <span class="total-label">الإجمالي</span>
                        <div class="order-total">${order.total.toFixed(2)} د.ل</div>
                    </div>
                    <div style="flex:1; display:flex; justify-content:flex-end;">
                        ${actionBtn}
                    </div>
                </div>
            `;
            ordersGrid.appendChild(card);
        });
    }

    window.printOrder = (id) => {
        const order = app.orders.find(o => o.id === id);
        if (!order) return;

        const printArea = document.getElementById('print-receipt-area');
        if (!printArea) return;

        const dateStr = new Date(order.timestamp).toLocaleDateString('ar-LY');
        const timeStr = new Date(order.timestamp).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });

        const itemsHtml = order.items.map(item => `
            <tr>
                <td style="text-align:right; padding:5px 0;">${item.name}</td>
                <td style="text-align:center;">${item.qty}</td>
                <td style="text-align:left;">${(item.price * item.qty).toFixed(2)}</td>
            </tr>
        `).join('');

        printArea.innerHTML = `
            <div class="receipt-container" dir="rtl">
                <div class="receipt-header">
                    <h2>${app.restaurantInfo.name || 'المطعم'}</h2>
                    <p>${app.restaurantInfo.slogan || ''}</p>
                    <div class="receipt-divider"></div>
                    <h3>فاتورة طلب #${order.id}</h3>
                    <p>التاريخ: ${dateStr} | الوقت: ${timeStr}</p>
                    <p>الزبون: ${order.customer}</p>
                </div>
                <div class="receipt-divider"></div>
                <table class="receipt-table">
                    <thead>
                        <tr>
                            <th style="text-align:right;">الصنف</th>
                            <th>الكمية</th>
                            <th style="text-align:left;">السعر</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsHtml}
                    </tbody>
                </table>
                <div class="receipt-divider"></div>
                <div class="receipt-total">
                    <span>الإجمالي:</span>
                    <span>${order.total.toFixed(2)} د.ل</span>
                </div>
                ${order.note ? `
                    <div class="receipt-divider"></div>
                    <div class="receipt-note">
                        <strong>ملاحظة:</strong>
                        <p>${order.note}</p>
                    </div>
                ` : ''}
                <div class="receipt-divider"></div>
                <div class="receipt-footer">
                    <p>شكراً لزيارتكم!</p>
                </div>
            </div>
        `;

        window.print();
    };

    function updateStats() {
        const statsOrders = document.getElementById('stats-orders');
        if (statsOrders) statsOrders.innerText = app.orders.length;
        const validOrders = app.orders.filter(o => o.status !== 'cancelled');
        const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
        const statsRevEl = document.getElementById('stats-revenue');
        if (statsRevEl) statsRevEl.innerText = totalRevenue.toFixed(2) + ' ' + app.restaurantInfo.currency;
        const pendingCount = app.orders.filter(o => o.status === 'new' || o.status === 'cooking').length;
        const statsPendingEl = document.getElementById('stats-pending');
        if (statsPendingEl) statsPendingEl.innerText = pendingCount;
        const statsMenuEl = document.getElementById('stats-menu-count');
        if (statsMenuEl) statsMenuEl.innerText = app.menu.filter(m => m.active).length;

        // --- New Item Stats ---
        const itemTotalEl = document.getElementById('stats-item-total');
        const itemActiveEl = document.getElementById('stats-item-active');
        if (itemTotalEl) itemTotalEl.innerText = app.menu.length;
        if (itemActiveEl) itemActiveEl.innerText = app.menu.filter(m => m.active).length;

        const recentTable = document.getElementById('recent-orders-table');
        if (recentTable) {
            recentTable.innerHTML = '';
            const recent = app.orders.slice(0, 5);
            if (recent.length === 0) {
                recentTable.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:1rem; color:#aaa;">لا توجد نشاطات حديثة</td></tr>';
            } else {
                recent.forEach(o => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #f9f9f9';
                    tr.innerHTML = `
                        <td style="padding:0.8rem 0.5rem;">#${o.id}</td>
                        <td style="padding:0.8rem 0.5rem;">${new Date(o.timestamp).toLocaleDateString('ar-LY')}</td>
                        <td style="padding:0.8rem 0.5rem; color:#888;">${new Date(o.timestamp).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style="padding:0.8rem 0.5rem; font-weight:700;">${o.total.toFixed(2)} د.ل</td>
                        <td style="padding:0.8rem 0.5rem;"><span class="badge-pill bg-${o.status}" style="font-size:0.75rem;">${getStatusLabel(o.status)}</span></td>
                    `;
                    recentTable.appendChild(tr);
                });
            }
        }

        const badge = document.getElementById('sidebar-order-count');
        const newCount = app.orders.filter(o => o.status === 'new').length;
        if (badge) {
            badge.style.display = newCount > 0 ? 'inline-flex' : 'none';
            badge.innerText = newCount;
        }
    }

    function getStatusLabel(status) {
        const map = { 'new': 'جديد', 'cooking': 'قيد التحضير', 'ready': 'جاهز', 'delivered': 'تم التسليم', 'cancelled': 'ملغي' };
        return map[status] || status;
    }

    function playNotificationSound() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
                return; // Might not play on the very first try but unlocks it
            }

            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(500, audioCtx.currentTime);
            oscillator.frequency.linearRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.5);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.5);
        } catch (e) {
            console.error("Sound Error", e);
        }
    }

    // Global Audio Unlocker
    document.addEventListener('click', () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }, { once: true });

    function checkForUpdates(newOrders) {
        if (JSON.stringify(app.orders) !== JSON.stringify(newOrders)) {
            const newCount = newOrders.filter(o => o.status === 'new').length;
            const currentCount = app.orders.filter(o => o.status === 'new').length;
            app.orders = newOrders;
            renderOrders();
            updateStats();
            if (newCount > currentCount && app.soundEnabled) {
                playNotificationSound();
                app.alert(`وصل طلب جديد!`, 'success');
            }
        }
    }

    // --- Window Scope Functions (Global) ---
    window.changeStatus = async (id, status) => { await app.updateOrderStatus(id, status); renderOrders(); updateStats(); };
    window.cancelOrder = (id) => {
        app.confirm('إلغاء الطلب', 'هل أنت متأكد من إلغاء هذا الطلب؟', 'danger', async () => {
            await app.updateOrderStatus(id, 'cancelled'); renderOrders(); updateStats(); app.alert('تم إلغاء الطلب بنجاح', 'success');
        });
    };

    window.toggleItemStatus = async (id, isActive) => { await app.updateMenuItem(id, { active: isActive }); renderAdminMenu(); };
    window.deleteItem = (id) => {
        app.confirm('حذف صنف', 'هل أنت متأكد من حذف هذا الصنف نهائياً؟', 'danger', async () => {
            await app.deleteMenuItem(id); renderAdminMenu(); app.alert('تم حذف الصنف بنجاح', 'success');
        });
    };

    window.closeModal = (id) => {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = 'none';
    };

    window.openCategoryModal = () => { renderCategoryList(); document.getElementById('category-modal').style.display = 'flex'; };
    window.handleAddCategory = async () => {
        const input = document.getElementById('new-cat-name');
        const name = input.value.trim();
        if (!name) return app.alert('يرجى إدخال اسم التصنيف', 'error');
        const id = name.toLowerCase().replace(/\s+/g, '-');
        if (app.categories.find(c => c.id === id)) return app.alert('هذا التصنيف موجود بالفعل', 'error');
        await app.addCategory({ id, name });
        input.value = '';
        renderCategoryList();
        renderAdminFilters();
        populateCategoryDropdown();
        app.alert('تم إضافة التصنيف بنجاح', 'success');
    };

    window.handleDeleteCategory = (id) => {
        app.confirm('حذف تصنيف', 'هل أنت متأكد من حذف هذا التصنيف؟ سيتم نقل جميع الأصناف التابعة له إلى "عام".', 'danger', async () => {
            await app.deleteCategory(id);
            renderCategoryList();
            renderAdminFilters();
            populateCategoryDropdown();
            renderAdminMenu();
            app.alert('تم حذف التصنيف بنجاح', 'success');
        });
    };

    function renderCategoryList() {
        const container = document.getElementById('category-list-container');
        const badge = document.getElementById('cat-count-badge');
        if (!container) return;

        const catsToShow = app.categories.filter(c => c.id !== 'all');
        if (badge) badge.innerText = catsToShow.length;

        container.innerHTML = '';
        catsToShow.forEach(cat => {
            const row = document.createElement('div');
            row.className = 'cat-item-row';
            row.innerHTML = `
                <span class="cat-item-info">${cat.name}</span>
                <div class="cat-item-actions">
                    <button class="btn-delete" onclick="handleDeleteCategory('${cat.id}')" title="حذف التصنيف">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(row);
        });
    }

    // --- User Management Logic ---
    function renderUsers() {
        const tableBody = document.getElementById('users-table-body');
        if (!tableBody) return;
        tableBody.innerHTML = '';

        app.users.forEach(user => {
            const tr = document.createElement('tr');
            tr.className = 'user-table-row';

            const roleBadge = user.role === 'admin'
                ? '<span class="badge-role badge-admin">مدير نظام</span>'
                : '<span class="badge-role badge-employee">موظف</span>';

            tr.innerHTML = `
                <td class="user-td">
                    <div class="user-display-info">
                        <div class="user-avatar-small">
                            <i class="fa-solid fa-user"></i>
                        </div>
                        <span class="user-name-text">${user.name}</span>
                    </div>
                </td>
                <td class="user-td user-username-text">@${user.username}</td>
                <td class="user-td">${roleBadge}</td>
                <td class="user-td">
                    <div class="user-actions-cell">
                        <button class="item-btn-circle item-btn-edit" onclick="editUser(${user.id})" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                        ${user.username !== 'admin' ? `<button class="item-btn-circle item-btn-delete" onclick="deleteUser(${user.id})" title="حذف"><i class="fa-solid fa-trash"></i></button>` : ''}
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    window.openAddUserModal = () => {
        const modal = document.getElementById('user-modal');
        const form = document.getElementById('user-form');
        form.reset();
        document.getElementById('user-id').value = '';
        modal.querySelector('h2').innerText = 'إضافة مستخدم جديد';
        modal.style.display = 'flex';
    };

    window.editUser = (id) => {
        const user = app.users.find(u => u.id === id);
        if (!user) return;
        const modal = document.getElementById('user-modal');
        document.getElementById('user-id').value = user.id;
        document.getElementById('user-display-name').value = user.name;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-password').value = user.password;
        document.getElementById('user-role').value = user.role;
        modal.querySelector('h2').innerText = 'تعديل مستخدم';
        modal.style.display = 'flex';
    };

    window.deleteUser = (id) => {
        app.confirm('حذف مستخدم', 'هل أنت متأكد من حذف هذا المستخدم؟', 'danger', () => {
            app.users = app.users.filter(u => u.id !== id);
            app.save('users', app.users);
            renderUsers();
            app.alert('تم حذف المستخدم بنجاح');
        });
    };

    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('user-id').value;
            const userData = {
                name: document.getElementById('user-display-name').value,
                username: document.getElementById('user-username').value,
                password: document.getElementById('user-password').value,
                role: document.getElementById('user-role').value
            };

            if (id) {
                const idx = app.users.findIndex(u => u.id == id);
                if (idx > -1) app.users[idx] = { ...app.users[idx], ...userData };
            } else {
                userData.id = Date.now();
                app.users.push(userData);
            }

            app.save('users', app.users);
            renderUsers();
            document.getElementById('user-modal').style.display = 'none';
            app.alert('تم حفظ بيانات المستخدم');
        });
    }

    const modal = document.getElementById('add-item-modal');
    const form = document.getElementById('add-item-form');
    const base64Input = document.getElementById('item-img-base64');
    const previewContainer = document.getElementById('img-preview-container');
    const previewImg = document.getElementById('img-preview');

    window.openAddModal = () => {
        form.reset(); document.getElementById('item-id').value = ''; base64Input.value = ''; previewContainer.style.display = 'none';
        modal.querySelector('.modal-header h2').innerText = 'إضافة صنف جديد';
        form.querySelector('button[type="submit"]').innerText = 'حفظ الصنف';
        modal.style.display = 'flex';
    };

    window.editItem = (id) => {
        const item = app.menu.find(i => i.id === id); if (!item) return;
        document.getElementById('item-id').value = item.id;
        document.getElementById('item-name').value = item.name;
        document.getElementById('item-price').value = item.price;
        document.getElementById('item-cat').value = item.category;
        document.getElementById('item-desc').value = item.description || '';
        base64Input.value = item.image;
        if (item.image) { previewImg.src = item.image; previewContainer.style.display = 'flex'; }
        else { previewContainer.style.display = 'none'; }
        modal.querySelector('.modal-header h2').innerText = 'تعديل الصنف';
        form.querySelector('button[type="submit"]').innerText = 'حفظ التعديلات';
        modal.style.display = 'flex';
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('item-id').value;
        const imgVal = base64Input.value || 'https://via.placeholder.com/400';
        const itemData = {
            name: document.getElementById('item-name').value,
            price: parseFloat(document.getElementById('item-price').value),
            category: document.getElementById('item-cat').value,
            description: document.getElementById('item-desc').value,
            image: imgVal
        };
        if (id) {
            await app.updateMenuItem(id, itemData);
        } else {
            await app.addMenuItem({ ...itemData, active: true });
        }
        renderAdminMenu();
        updateStats();
        modal.style.display = 'none';
        form.reset();
    });

    const fileInput = document.getElementById('item-img-file');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (evt) => { base64Input.value = evt.target.result; previewImg.src = evt.target.result; previewContainer.style.display = 'flex'; };
                reader.readAsDataURL(file);
            }
        });
    }

    // --- Settings Logic ---
    const restNameInput = document.getElementById('setting-rest-name');
    const restSloganInput = document.getElementById('setting-rest-slogan');
    if (restNameInput) {
        restNameInput.value = app.restaurantInfo.name || '';
        restSloganInput.value = app.restaurantInfo.slogan || '';
    }

    window.saveStoreSettings = () => {
        const name = restNameInput.value.trim();
        if (!name) return app.alert('يرجى إدخال اسم المطعم', 'error');
        app.updateRestaurantInfo({ name, slogan: restSloganInput.value.trim() });
        updateClientHeader(); app.alert('تم حفظ الإعدادات بنجاح', 'success');
    };

    window.testNotificationSound = () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        playNotificationSound(); app.alert('جاري تجربة الصوت...', 'success');
    };

    const soundToggle = document.getElementById('sound-toggle-input');
    if (soundToggle) {
        soundToggle.checked = app.soundEnabled;
        soundToggle.onchange = () => {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            app.toggleSound(); if (app.soundEnabled) playNotificationSound();
            app.alert(app.soundEnabled ? 'تم تفعيل التنبيهات' : 'تم كتم التنبيهات', 'info');
        };
    }

    // --- Initial Execution ---
    renderOrders();
    renderAdminMenu();
    updateStats();
    renderAdminFilters();
    populateCategoryDropdown();
    renderUsers();

    if (menuSearch) menuSearch.addEventListener('input', renderAdminMenu);

    // Syncing and Polling
    window.addEventListener('storage', (e) => {
        if (e.key === 'rest_app_orders') checkForUpdates(JSON.parse(e.newValue || '[]'));
        if (e.key === 'rest_app_restaurant_info') { app.restaurantInfo = JSON.parse(e.newValue || '{}'); updateClientHeader(); }
    });
    setInterval(() => {
        const freshData = new AppState();
        if (JSON.stringify(freshData.orders) !== JSON.stringify(app.orders)) checkForUpdates(freshData.orders);
    }, 2000);

    // --- Router Logic ---
    const routes = {
        'home': 'dashboard',
        'items': 'menu',
        'orders': 'orders',
        'settings': 'settings',
        'users': 'users'
    };

    function handleRouting() {
        const hash = window.location.hash.substring(1) || 'home';
        const targetId = routes[hash] || 'dashboard';

        // Update UI
        document.querySelectorAll('.admin-section').forEach(sec => sec.style.display = 'none');
        const targetSection = document.getElementById(targetId);
        if (targetSection) targetSection.style.display = 'block';

        // Update Sidebar Active State
        document.querySelectorAll('.menu-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href === '#' + hash || (hash === 'home' && href === '#home')) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('hashchange', handleRouting);


    // Initial Routing
    handleRouting();

    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.querySelector('.close-sidebar-icon');
    if (toggleBtn) toggleBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));
}

// Global initialization call is handled by DOMContentLoaded at the start of original script.js

