let currentServerIdForCert = null;

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Add server
async function submitServer(e) {
    e.preventDefault();
    const data = {
        id: 'srv-' + Math.random().toString(36).substring(2, 7),
        name: document.getElementById('srv_name').value,
        host: document.getElementById('srv_host').value,
        api_port: parseInt(document.getElementById('srv_api_port').value),
        username: document.getElementById('srv_user').value,
        password: document.getElementById('srv_pass').value
    };
    try {
        const res = await fetch('/api/servers', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        if (res.ok) { window.location.reload(); }
        else { alert('خطا در ثبت سرور'); }
    } catch (err) { alert('خطا: ' + err.message); }
}

// Add country destination (to all or specific server)
async function submitDestination(e) {
    e.preventDefault();
    const targetServer = document.getElementById('dst_target_server').value;
    const data = {
        name: document.getElementById('dst_name').value.toLowerCase().trim(),
        country_label: document.getElementById('dst_label').value.trim(),
        remote_ip: document.getElementById('dst_remote_ip').value.trim(),
        tunnel_local_ip: document.getElementById('dst_local_ip').value.trim(),
        tunnel_remote_ip: document.getElementById('dst_remote_tun_ip').value.trim(),
        ovpn_port: parseInt(document.getElementById('dst_ovpn_port').value),
        ovpn_protocol: 'udp',
        client_pool_range: document.getElementById('dst_pool_range').value.trim(),
        client_gateway_ip: document.getElementById('dst_gw').value.trim(),
        client_subnet: document.getElementById('dst_subnet').value.trim(),
        enable_killswitch: true,
        bypass_iran: true
    };
    
    closeModal('addDestModal');
    
    try {
        let endpoint = '/api/fleet/destinations';
        if (targetServer !== 'all') {
            endpoint = '/api/servers/' + targetServer + '/destinations';
        }

        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        let allCmds = [];
        if (targetServer === 'all') {
            for (let srv in result) {
                if (result[srv].result && result[srv].result.generated_commands) {
                    allCmds = result[srv].result.generated_commands;
                    break;
                }
            }
            document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' به تمام سرورها اضافه شد!';
        } else {
            allCmds = result.generated_commands || [];
            document.getElementById('resultTitle').innerText = '✅ کشور ' + data.country_label + ' به سرور انتخاب‌شده اضافه شد!';
        }
        
        document.getElementById('resultCode').innerText = allCmds.join('\n');
        openModal('resultModal');
    } catch (err) { alert('خطا در اعمال مقصد: ' + err.message); }
}

// Certificate Manager Modal & Tabs
function openCertModal(serverId, serverName) {
    currentServerIdForCert = serverId;
    document.getElementById('certServerTitle').innerText = 'مدیریت سرتیفیکت: ' + serverName;
    switchCertTab('selfSigned');
    openModal('certModal');
}

function switchCertTab(tabName) {
    document.getElementById('tabSelfSigned').style.display = tabName === 'selfSigned' ? 'block' : 'none';
    document.getElementById('tabUpload').style.display = tabName === 'upload' ? 'block' : 'none';
    document.getElementById('btnTabSelfSigned').classList.toggle('active', tabName === 'selfSigned');
    document.getElementById('btnTabUpload').classList.toggle('active', tabName === 'upload');
}

// Generate Self-Signed on router
async function submitGenerateCert(e) {
    e.preventDefault();
    if (!currentServerIdForCert) return;
    const data = {
        cert_name: document.getElementById('gen_cert_name').value.trim(),
        common_name: document.getElementById('gen_common_name').value.trim(),
        days_valid: parseInt(document.getElementById('gen_days').value),
        key_size: 2048
    };
    closeModal('certModal');
    try {
        const res = await fetch('/api/servers/' + currentServerIdForCert + '/certificates/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        document.getElementById('resultTitle').innerText = '🔐 سرتیفیکت روی میکروتیک تولید شد!';
        document.getElementById('resultCode').innerText = result.commands ? result.commands.join('\n') : JSON.stringify(result);
        openModal('resultModal');
    } catch (err) { alert('خطا: ' + err.message); }
}

// Upload custom cert
async function submitUploadCert(e) {
    e.preventDefault();
    if (!currentServerIdForCert) return;
    const data = {
        cert_name: document.getElementById('up_cert_name').value.trim(),
        cert_content: document.getElementById('up_cert_content').value.trim(),
        key_content: document.getElementById('up_key_content').value.trim()
    };
    closeModal('certModal');
    try {
        const res = await fetch('/api/servers/' + currentServerIdForCert + '/certificates/upload', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        const result = await res.json();
        document.getElementById('resultTitle').innerText = '📁 سرتیفیکت اختصاصی ایمپورت شد!';
        document.getElementById('resultCode').innerText = result.commands ? result.commands.join('\n') : JSON.stringify(result);
        openModal('resultModal');
    } catch (err) { alert('خطا: ' + err.message); }
}

// Trigger Iran IPDeny Sync
async function syncIranList(serverId, serverName) {
    if (!confirm('آیا مایلید اسکریپت دریافت رنج‌های آی‌پی ایران از IPDeny روی سرور ' + serverName + ' اجرا شود؟')) return;
    try {
        const res = await fetch('/api/servers/' + serverId + '/sync-iran-ips', { method: 'POST' });
        const result = await res.json();
        alert('✅ اسکریپت IPDeny ایران با موفقیت روی روتر تنظیم و اجرا شد.');
    } catch (err) { alert('خطا: ' + err.message); }
}

// View tunnels
async function viewServerTunnels(id, name) {
    document.getElementById('tunServerTitle').innerText = 'تونل‌های سرور ' + name;
    try {
        const res = await fetch('/api/servers/' + id + '/destinations');
        const tunnels = await res.json();
        let html = '<table style="width: 100%; border-collapse: collapse; text-align: right;">';
        html += '<tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);"><th style="padding: 8px 0;">نام تونل</th><th>IP ریموت</th><th>وضعیت</th></tr>';
        tunnels.forEach(t => {
            html += '<tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">';
            html += '<td style="padding: 10px 0;"><code>' + t.name + '</code></td>';
            html += '<td>' + t.remote_address + '</td>';
            html += '<td><span class="status-badge badge-online">فعال</span></td>';
            html += '</tr>';
        });
        html += '</table>';
        document.getElementById('tunListContent').innerHTML = html;
        openModal('tunnelsModal');
    } catch (err) { alert('خطا در دریافت لیست تونل‌ها: ' + err.message); }
}

// Show command logs
async function showLogsModal() {
    try {
        const res = await fetch('/api/commands-log');
        const logs = await res.json();
        if (logs.length === 0) {
            alert('هنوز دستوری ثبت نشده است. ابتدا روی دکمه «تست افزودن کشور جدید» کلیک کنید!');
            return;
        }
        let all = logs.map(l => '# --- عملیات ' + l.destination + ' روی سرور ' + l.server + ' ---\n' + l.commands.join('\n')).join('\n\n');
        document.getElementById('resultTitle').innerText = '📜 لاگ تمام دستورات تولیدشده میکروتیک';
        document.getElementById('resultCode').innerText = all;
        openModal('resultModal');
    } catch (err) { alert('خطا در دریافت لاگ‌ها: ' + err.message); }
}

// Delete server
async function deleteServer(id) {
    if (confirm('آیا از حذف این سرور اطمینان دارید؟')) {
        await fetch('/api/servers/' + id, { method: 'DELETE' });
        window.location.reload();
    }
}


// --- SMART MULTI-SCENARIO INTERACTIVE WIZARD ---
let activeWizardScenario = 'full'; // 'full' | 'adopt' | 'services_only'
let wizCurrentStep = 1;
let wizServerId = null;
let wizServerName = 'CHR-Production-New';
let detectedTunnelsList = [];
let allExecutedWizardCommands = [];
let addedDestinationsList = [];

const PRESET_DESTINATIONS = {
    'de': { name: 'de', country_label: 'Germany', tunnel_type: 'gre', remote_ip: '91.99.129.82', tunnel_local_ip: '40.40.40.2/30', tunnel_remote_ip: '40.40.40.1', ovpn_port: 6066, ovpn_protocol: 'udp', client_pool_range: '10.18.1.2-10.18.1.200', client_gateway_ip: '10.18.1.1', client_subnet: '10.18.1.0/24' },
    'usa': { name: 'usa', country_label: 'United States', tunnel_type: 'gre', remote_ip: '69.197.190.75', tunnel_local_ip: '10.10.11.2/30', tunnel_remote_ip: '10.10.11.1', ovpn_port: 6065, ovpn_protocol: 'udp', client_pool_range: '10.17.1.2-10.17.1.200', client_gateway_ip: '10.17.1.1', client_subnet: '10.17.1.0/24' },
    'eng': { name: 'eng', country_label: 'United Kingdom', tunnel_type: 'gre', remote_ip: '51.38.66.183', tunnel_local_ip: '10.10.3.2/30', tunnel_remote_ip: '10.10.3.1', ovpn_port: 6060, ovpn_protocol: 'udp', client_pool_range: '10.16.1.2-10.16.1.200', client_gateway_ip: '10.16.1.1', client_subnet: '10.16.1.0/24' },
    'nl': { name: 'nl', country_label: 'Netherlands', tunnel_type: 'gre', remote_ip: '94.102.57.228', tunnel_local_ip: '10.10.7.2/30', tunnel_remote_ip: '10.10.7.1', ovpn_port: 6064, ovpn_protocol: 'udp', client_pool_range: '10.15.1.2-10.15.1.200', client_gateway_ip: '10.15.1.1', client_subnet: '10.15.1.0/24' },
    'pol': { name: 'pol', country_label: 'Poland', tunnel_type: 'gre', remote_ip: '51.77.38.238', tunnel_local_ip: '10.10.4.2/30', tunnel_remote_ip: '10.10.4.1', ovpn_port: 6063, ovpn_protocol: 'udp', client_pool_range: '10.13.1.2-10.13.1.200', client_gateway_ip: '10.13.1.1', client_subnet: '10.13.1.0/24' },
    'fin': { name: 'fin', country_label: 'Finland', tunnel_type: 'gre', remote_ip: '65.108.18.128', tunnel_local_ip: '10.10.2.2/30', tunnel_remote_ip: '10.10.2.1', ovpn_port: 6059, ovpn_protocol: 'udp', client_pool_range: '10.12.1.2-10.12.1.200', client_gateway_ip: '10.12.1.1', client_subnet: '10.12.1.0/24' },
    'ca': { name: 'ca', country_label: 'Canada', tunnel_type: 'gre', remote_ip: '67.55.2.40', tunnel_local_ip: '20.20.3.2/30', tunnel_remote_ip: '20.20.3.1', ovpn_port: 6067, ovpn_protocol: 'udp', client_pool_range: '10.19.1.2-10.19.1.200', client_gateway_ip: '10.19.1.1', client_subnet: '10.19.1.0/24' },
    'trk': { name: 'trk', country_label: 'Turkey', tunnel_type: 'gre', remote_ip: '188.132.174.132', tunnel_local_ip: '10.10.12.2/30', tunnel_remote_ip: '10.10.12.1', ovpn_port: 6058, ovpn_protocol: 'udp', client_pool_range: '10.11.1.2-10.11.1.200', client_gateway_ip: '10.11.1.1', client_subnet: '10.11.1.0/24' }
};

let cachedFleetServers = [];

// Launch Wizard Modal
async function openWizardModal() {
    wizCurrentStep = 1;
    wizServerId = null;
    allExecutedWizardCommands = [];
    addedDestinationsList = [];
    
    // Clear consoles
    document.querySelectorAll('.wiz-console').forEach(c => { c.style.display = 'none'; c.innerText = ''; });
    document.querySelectorAll('.wiz-next-btn').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    
    // Reset screens
    document.getElementById('wizardScenarioPicker').style.display = 'block';
    document.getElementById('wizardScenarioSteps').style.display = 'none';
    
    // Fetch registered servers for fleet dropdown
    try {
        const res = await fetch('/api/servers');
        cachedFleetServers = await res.json();
        const sel = document.getElementById('wiz_fleet_select');
        sel.innerHTML = '<option value="">+ افزودن و کانفیگ سرور جدید (دستی)</option>';
        cachedFleetServers.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.innerText = `${s.name} (${s.host}:${s.api_port})`;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error('Failed to load fleet servers', e);
    }

    openModal('wizardModal');
}

// Fleet server select onchange
function onFleetServerSelect() {
    const srvId = document.getElementById('wiz_fleet_select').value;
    if (!srvId) {
        // Defaults for new server
        document.getElementById('wiz_name').value = 'CHR-Production-New';
        document.getElementById('wiz_host').value = '95.216.100.50';
        document.getElementById('wiz_api_port').value = 8728;
        document.getElementById('wiz_winbox_port').value = 2020;
        document.getElementById('wiz_user').value = 'admin';
        document.getElementById('wiz_pass').value = 'strong_pass';
        return;
    }
    const found = cachedFleetServers.find(s => s.id === srvId);
    if (found) {
        document.getElementById('wiz_name').value = found.name;
        document.getElementById('wiz_host').value = found.host;
        document.getElementById('wiz_api_port').value = found.api_port;
        document.getElementById('wiz_winbox_port').value = found.winbox_port || 2020;
        document.getElementById('wiz_user').value = found.username || 'admin';
        document.getElementById('wiz_pass').value = found.password || '';
    }
}

// Select Scenario
function selectWizardScenario(scenario) {
    activeWizardScenario = scenario;
    document.getElementById('wizardScenarioPicker').style.display = 'none';
    document.getElementById('wizardScenarioSteps').style.display = 'block';
    
    const badge = document.getElementById('activeScenarioBadge');
    const stepInd2 = document.getElementById('stepInd2');
    const stepInd3 = document.getElementById('stepInd3');
    const stepInd4 = document.getElementById('stepInd4');
    const stepTitle4 = document.getElementById('stepTitle4');

    if (scenario === 'full') {
        badge.innerText = '🟢 سناریوی ۱: راه‌اندازی کامل روتر خام (Full Clean Setup)';
        badge.style.color = 'var(--accent)';
        badge.style.borderColor = 'var(--accent)';
        stepInd2.style.display = 'flex';
        stepInd3.style.display = 'flex';
        stepInd4.style.display = 'flex';
        stepTitle4.innerText = 'تونل‌های خروجی';
    } else if (scenario === 'adopt') {
        badge.innerText = '🔵 سناریوی ۲: همگام‌سازی تونل‌های موجود (Adopt Tunnels)';
        badge.style.color = 'var(--success)';
        badge.style.borderColor = 'var(--success)';
        stepInd2.style.display = 'none';
        stepInd3.style.display = 'none';
        stepInd4.style.display = 'flex';
        stepTitle4.innerText = 'همگام‌سازی تونل‌ها (Adopt)';
    } else if (scenario === 'services_only') {
        badge.innerText = '🟣 سناریوی ۳: فقط سرتیفیکت و فایروال (Services Only)';
        badge.style.color = 'var(--warning)';
        badge.style.borderColor = 'var(--warning)';
        stepInd2.style.display = 'flex';
        stepInd3.style.display = 'flex';
        stepInd4.style.display = 'none';
    }
    
    wizCurrentStep = 1;
    updateWizardStepperUI();
}

function resetWizardToScenarios() {
    document.getElementById('wizardScenarioPicker').style.display = 'block';
    document.getElementById('wizardScenarioSteps').style.display = 'none';
}

function updateWizardStepperUI() {
    const stepContentIds = ['wizardStep1', 'wizardStep2', 'wizardStep3', 'wizardStep4', 'wizardStepAdopt', 'wizardStep5'];
    stepContentIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('active');
    });

    if (activeWizardScenario === 'adopt' && wizCurrentStep === 4) {
        document.getElementById('wizardStepAdopt').classList.add('active');
    } else {
        const activeContent = document.getElementById('wizardStep' + wizCurrentStep);
        if (activeContent) activeContent.classList.add('active');
    }

    // Indicators
    for (let i = 1; i <= 5; i++) {
        const ind = document.getElementById('stepInd' + i);
        if (ind) {
            ind.classList.toggle('active', i === wizCurrentStep);
            ind.classList.toggle('completed', i < wizCurrentStep);
        }
    }
}

function goToWizardStep(step) {
    wizCurrentStep = step;
    updateWizardStepperUI();
    if (step === 5) {
        renderFinalSummary();
    }
}

// Certificate UI toggle
function toggleCertModeFields() {
    const mode = document.querySelector('input[name="wiz_cert_mode"]:checked').value;
    document.getElementById('wiz_existing_cert_box').style.display = mode === 'existing' ? 'block' : 'none';
    document.getElementById('wiz_cert_name_box').style.display = mode === 'existing' ? 'none' : 'block';
    document.getElementById('wiz_upload_box').style.display = mode === 'upload' ? 'block' : 'none';
}

// Tunnel UI toggle
function toggleTunnelTypeFields() {
    const isL2tp = document.getElementById('wiz_tun_type').value === 'l2tp_ether';
    document.getElementById('wiz_l2tp_specific_fields').style.display = isL2tp ? 'grid' : 'none';
}

function applyDestinationPreset(key) {
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
    
    const p = PRESET_DESTINATIONS[key];
    if (!p) return;
    
    document.getElementById('wiz_tun_name').value = p.name;
    document.getElementById('wiz_tun_label').value = p.country_label;
    document.getElementById('wiz_tun_type').value = p.tunnel_type;
    document.getElementById('wiz_tun_remote').value = p.remote_ip;
    document.getElementById('wiz_tun_local_ip').value = p.tunnel_local_ip;
    document.getElementById('wiz_tun_remote_gw').value = p.tunnel_remote_ip;
    document.getElementById('wiz_tun_ovpn_port').value = p.ovpn_port;
    document.getElementById('wiz_tun_pool').value = p.client_pool_range;
    document.getElementById('wiz_tun_subnet').value = p.client_subnet;
    toggleTunnelTypeFields();
}

// --- STEP 1: CONNECT & AUTO-SCAN ---
async function executeStep1WithScan() {
    const btn = document.getElementById('btnExecStep1');
    const consoleBox = document.getElementById('consoleStep1');
    const nextBtn = document.getElementById('btnNextStep1');
    const alertBox = document.getElementById('wiz_detected_alert');

    btn.disabled = true;
    btn.innerText = '⏳ در حال تست اتصال به میکروتیک...';
    consoleBox.style.display = 'block';
    consoleBox.innerText = '# [1/4] در حال برقراری ارتباط با پورت API روتر (8728)...
';
    alertBox.style.display = 'none';

    const selectedFleetId = document.getElementById('wiz_fleet_select').value;
    const payload = {
        server_id: selectedFleetId || undefined,
        server_name: document.getElementById('wiz_name').value.trim(),
        server_host: document.getElementById('wiz_host').value.trim(),
        api_port: parseInt(document.getElementById('wiz_api_port').value),
        username: document.getElementById('wiz_user').value.trim(),
        password: document.getElementById('wiz_pass').value,
        winbox_port: parseInt(document.getElementById('wiz_winbox_port').value)
    };

    try {
        const res = await fetch('/api/wizard/step1-connect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        wizServerId = data.server_id;
        wizServerName = data.server_name;
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.innerText += '✅ اتصال برقرار شد! اطلاعات روتر:
' + data.commands.join('
') + '

';
        consoleBox.innerText += '# [2/4] در حال اسکن خودکار سرتیفیکت‌ها و اینترفیس‌های موجود در روتر...
';

        // Auto Scan Certs
        try {
            const cRes = await fetch('/api/servers/' + wizServerId + '/certificates');
            const certs = await cRes.json();
            const select = document.getElementById('wiz_existing_cert_select');
            select.innerHTML = '';
            if (certs && certs.length > 0) {
                certs.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.name;
                    opt.innerText = `${c.name} (${c.common_name} | ${c.has_key ? 'دارای Private Key' : 'بدون کلید'})`;
                    select.appendChild(opt);
                });
                document.getElementById('wiz_found_cert_notice').style.display = 'block';
                document.getElementById('rad_cert_existing').checked = true;
                toggleCertModeFields();
                consoleBox.innerText += `✅ تعداد ${certs.length} سرتیفیکت روی روتر شناسایی شد: [${certs.map(c=>c.name).join(', ')}]
`;
            } else {
                document.getElementById('wiz_found_cert_notice').style.display = 'none';
                document.getElementById('rad_cert_self_signed').checked = true;
                toggleCertModeFields();
                consoleBox.innerText += 'ℹ️ سرتیفیکت قبلی روی روتر یافت نشد؛ حالت ساخت خودکار انتخاب شد.
';
            }
        } catch (e) {
            console.error('Cert scan err', e);
        }

        // Auto Scan Tunnels
        try {
            const tRes = await fetch('/api/servers/' + wizServerId + '/detected-tunnels');
            detectedTunnelsList = await tRes.json();
            if (detectedTunnelsList && detectedTunnelsList.length > 0) {
                consoleBox.innerText += `✅ تعداد ${detectedTunnelsList.length} تونل روی روتر کشف شد: [${detectedTunnelsList.map(t=>t.name).join(', ')}]
`;
                alertBox.style.display = 'block';
                alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
                alertBox.style.border = '1px solid rgba(16, 185, 129, 0.3)';
                alertBox.style.color = 'var(--success)';
                alertBox.innerHTML = `💡 <strong>کشف خودکار:</strong> تعداد ${detectedTunnelsList.length} تونل موجود روی روتر شناسایی شد (${detectedTunnelsList.map(t=>'<code>'+t.name+'</code>').join(', ')}).`;
            } else {
                consoleBox.innerText += 'ℹ️ هیچ اینترفیس تونل GRE یا L2TP از قبل روی روتر تعریف نشده است (روتر خام).
';
            }
        } catch (e) {
            console.error('Tunnel scan err', e);
        }

        btn.innerText = '✅ اتصال و اسکن روتر تایید شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';

    } catch (err) {
        consoleBox.innerText += '❌ خطا در اتصال به روتر: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

function proceedFromStep1() {
    if (activeWizardScenario === 'adopt') {
        goToWizardStep(4);
        renderAdoptTunnels();
    } else {
        goToWizardStep(2);
    }
}

// --- STEP 2: CERTIFICATE EXECUTE ---
async function executeStep2Cert() {
    const btn = document.getElementById('btnExecStep2');
    const consoleBox = document.getElementById('consoleStep2');
    const nextBtn = document.getElementById('btnNextStep2');

    btn.disabled = true;
    btn.innerText = '⏳ در حال اعمال تنظیمات سرتیفیکت...';
    consoleBox.style.display = 'block';

    const certMode = document.querySelector('input[name="wiz_cert_mode"]:checked').value;
    let chosenCertName = document.getElementById('wiz_cert_name').value.trim();
    if (certMode === 'existing') {
        chosenCertName = document.getElementById('wiz_existing_cert_select').value;
    }

    const payload = {
        server_id: wizServerId,
        cert_mode: certMode,
        cert_name: chosenCertName,
        cert_content: document.getElementById('wiz_cert_content').value.trim(),
        key_content: document.getElementById('wiz_key_content').value.trim()
    };

    try {
        const res = await fetch('/api/wizard/step2-cert', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.innerText = '✅ ' + data.message + '

' + data.commands.join('
');
        btn.innerText = '✅ گام ۲ انجام شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText = '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// --- STEP 3: SERVICES (RADIUS, IKEV2 & IRAN FETCH) ---
async function executeStep3Services() {
    const btn = document.getElementById('btnExecStep3');
    const consoleBox = document.getElementById('consoleStep3');
    const nextBtn = document.getElementById('btnNextStep3');

    btn.disabled = true;
    btn.innerText = '⏳ در حال اعمال RADIUS، IKEv2 و اسکریپت ایران...';
    consoleBox.style.display = 'block';

    const payload = {
        server_id: wizServerId,
        radius_ip: document.getElementById('wiz_radius_ip').value.trim(),
        radius_secret: document.getElementById('wiz_radius_secret').value.trim(),
        ikev2_pool: document.getElementById('wiz_ikev2_pool').value.trim(),
        cert_name: document.getElementById('wiz_cert_name').value.trim() || 'server-template',
        enable_iran_fetch: document.getElementById('wiz_iran_check').checked
    };

    try {
        const res = await fetch('/api/wizard/step3-services', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.innerText = '✅ ' + data.message + '

' + data.commands.join('
');
        btn.innerText = '✅ گام ۳ انجام شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText = '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

function onFinishStep3() {
    if (activeWizardScenario === 'services_only') {
        goToWizardStep(5);
    } else {
        goToWizardStep(4);
    }
}

// --- STEP 4: ADD OUTBOUND TUNNEL ---
async function executeStep4AddTunnel() {
    const btn = document.getElementById('btnExecStep4');
    const consoleBox = document.getElementById('consoleStep4');
    const nextBtn = document.getElementById('btnNextStep4');
    const addedBox = document.getElementById('wiz_added_tunnels_box');

    const tunType = document.getElementById('wiz_tun_type').value;
    const dest = {
        name: document.getElementById('wiz_tun_name').value.trim().toLowerCase(),
        country_label: document.getElementById('wiz_tun_label').value.trim(),
        tunnel_type: tunType,
        remote_ip: document.getElementById('wiz_tun_remote').value.trim(),
        tunnel_local_ip: document.getElementById('wiz_tun_local_ip').value.trim(),
        tunnel_remote_ip: document.getElementById('wiz_tun_remote_gw').value.trim(),
        ovpn_port: parseInt(document.getElementById('wiz_tun_ovpn_port').value),
        ovpn_protocol: 'udp',
        ovpn_certificate: 'server-template',
        client_pool_range: document.getElementById('wiz_tun_pool').value.trim(),
        client_gateway_ip: document.getElementById('wiz_tun_pool').value.split('-')[0].replace(/\.[0-9]+$/, '.1'),
        client_subnet: document.getElementById('wiz_tun_subnet').value.trim(),
        enable_killswitch: true,
        bypass_iran: true,
        local_tunnel_id: parseInt(document.getElementById('wiz_l2tp_ltid').value) || 33,
        remote_tunnel_id: parseInt(document.getElementById('wiz_l2tp_rtid').value) || 22,
        local_session_id: parseInt(document.getElementById('wiz_l2tp_lsid').value) || 333,
        remote_session_id: parseInt(document.getElementById('wiz_l2tp_rsid').value) || 222
    };

    btn.disabled = true;
    btn.innerText = '⏳ در حال ساخت تونل و روتینگ...';
    consoleBox.style.display = 'block';

    try {
        const res = await fetch('/api/wizard/step4-tunnel', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ server_id: wizServerId, destination: dest })
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);
        addedDestinationsList.push(dest);

        consoleBox.innerText = '✅ ' + data.message + '

' + data.commands.join('
');
        btn.disabled = false;
        btn.innerText = '⚡ ساخت یک تونل دیگر';
        
        // Render badge
        const badge = document.createElement('span');
        badge.className = 'tag-pill';
        badge.style.margin = '4px';
        badge.style.color = 'var(--success)';
        badge.innerText = `✅ ${dest.country_label} (${dest.tunnel_type.toUpperCase()} : ${dest.ovpn_port})`;
        addedBox.appendChild(badge);

        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
    } catch (err) {
        consoleBox.innerText = '❌ خطا: ' + err.message;
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

// --- SCENARIO 2: ADOPT EXISTING TUNNELS ---
function renderAdoptTunnels() {
    const container = document.getElementById('wizAdoptTunnelsContainer');
    container.innerHTML = '';
    
    if (!detectedTunnelsList || detectedTunnelsList.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); padding: 1.5rem; text-align: center;">هیچ اینترفیس تونل GRE یا L2TP روی روتر کشف نشد. پیشنهاد می‌شود سناریوی ۱ (راه‌اندازی کامل روتر خام) را انتخاب فرمایید.</div>';
        return;
    }

    detectedTunnelsList.forEach((tun, idx) => {
        const card = document.createElement('div');
        card.className = 'adopt-tunnel-card';
        
        const cleanName = tun.name.replace(/^gre-/, '').replace(/^l2tp-/, '').replace(/^to-/, '');
        const defaultPort = 6050 + idx;
        const defaultPool = `10.${20 + idx}.1.2-10.${20 + idx}.1.200`;
        const defaultGw = tun.gw_ip || `10.${20 + idx}.1.1`;
        const defaultSubnet = `10.${20 + idx}.1.0/24`;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                    <strong style="font-size: 1rem; color: #fff;">اینترفیس: <code>${tun.name}</code></strong>
                    <span class="tag-pill" style="margin-right: 8px; color: var(--accent);">${tun.type.toUpperCase()}</span>
                    <span style="font-size: 0.8rem; color: var(--text-muted);">IP ریموت: ${tun.remote_ip || 'نامشخص'} | رنج داخلی: ${tun.local_ip_30 || 'نامشخص'}</span>
                </div>
                <button type="button" class="btn btn-primary" id="btnAdopt_${idx}" onclick="adoptSingleTunnel(${idx}, '${tun.name}', '${tun.type}', '${defaultGw}')">⚡ ساخت روتینگ و OpenVPN</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; font-size: 0.85rem;">
                <div><label>کد مقصد:</label><input type="text" id="ad_code_${idx}" value="${cleanName}"></div>
                <div><label>پورت OpenVPN:</label><input type="number" id="ad_port_${idx}" value="${defaultPort}"></div>
                <div><label>استخر کلاینت:</label><input type="text" id="ad_pool_${idx}" value="${defaultPool}"></div>
                <div><label>ساب‌نت کلاینت:</label><input type="text" id="ad_sub_${idx}" value="${defaultSubnet}"></div>
            </div>
            <div class="wiz-console" id="ad_console_${idx}" style="display: none; margin-top: 8px;"></div>
        `;
        container.appendChild(card);
    });
}

async function adoptSingleTunnel(idx, tunName, tunType, defaultGw) {
    const btn = document.getElementById('btnAdopt_' + idx);
    const consoleBox = document.getElementById('ad_console_' + idx);
    btn.disabled = true;
    btn.innerText = '⏳ در حال ساخت...';
    
    const payload = {
        server_id: wizServerId,
        tunnel_name: tunName,
        tunnel_type: tunType,
        country_code: document.getElementById('ad_code_' + idx).value.trim(),
        country_label: document.getElementById('ad_code_' + idx).value.toUpperCase(),
        tunnel_remote_ip: defaultGw,
        client_pool_range: document.getElementById('ad_pool_' + idx).value.trim(),
        client_gateway_ip: document.getElementById('ad_pool_' + idx).value.split('-')[0].replace(/\.[0-9]+$/, '.1'),
        client_subnet: document.getElementById('ad_sub_' + idx).value.trim(),
        ovpn_port: parseInt(document.getElementById('ad_port_' + idx).value)
    };

    try {
        const res = await fetch('/api/wizard/adopt-tunnel', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        consoleBox.style.display = 'block';
        consoleBox.innerText = '✅ ' + data.message + '

' + data.commands.join('
');
        btn.innerText = '✅ همگام شد';
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
    } catch (err) {
        alert('خطا: ' + err.message);
        btn.disabled = false;
        btn.innerText = 'تلاش مجدد';
    }
}

async function adoptAllDetectedTunnels() {
    if (!detectedTunnelsList || detectedTunnelsList.length === 0) return;
    const btnAll = document.getElementById('btnAdoptAll');
    btnAll.disabled = true;
    btnAll.innerText = '⏳ در حال همگام‌سازی دسته جمعی...';

    const tunnelsPayload = [];
    detectedTunnelsList.forEach((tun, idx) => {
        const code = document.getElementById('ad_code_' + idx).value.trim();
        const port = parseInt(document.getElementById('ad_port_' + idx).value);
        const pool = document.getElementById('ad_pool_' + idx).value.trim();
        const sub = document.getElementById('ad_sub_' + idx).value.trim();
        const gw = tun.gw_ip || pool.split('-')[0].replace(/\.[0-9]+$/, '.1');

        tunnelsPayload.push({
            server_id: wizServerId,
            tunnel_name: tun.name,
            tunnel_type: tun.type,
            country_code: code,
            country_label: code.toUpperCase(),
            tunnel_remote_ip: gw,
            client_pool_range: pool,
            client_gateway_ip: pool.split('-')[0].replace(/\.[0-9]+$/, '.1'),
            client_subnet: sub,
            ovpn_port: port
        });
    });

    try {
        const res = await fetch('/api/wizard/adopt-all-tunnels', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ server_id: wizServerId, tunnels: tunnelsPayload })
        });
        const data = await res.json();
        allExecutedWizardCommands.push(...data.commands);

        // Turn all buttons green
        detectedTunnelsList.forEach((tun, idx) => {
            const b = document.getElementById('btnAdopt_' + idx);
            if (b) {
                b.innerText = '✅ همگام شد';
                b.style.background = 'var(--success)';
                b.style.color = '#000';
            }
        });

        btnAll.innerText = `✅ تمام ${tunnelsPayload.length} تونل همگام شدند`;
        alert(`🎉 تبریک! تعداد ${tunnelsPayload.length} تونل با موفقیت روتینگ، Killswitch و OpenVPN اختصاصی دریافت کردند.`);
    } catch (err) {
        alert('خطا: ' + err.message);
        btnAll.disabled = false;
        btnAll.innerText = 'تلاش مجدد';
    }
}

// --- STEP 5: SUMMARY & COPY ---
function renderFinalSummary() {
    const box = document.getElementById('wizardFinalSummaryBox');
    let html = '<ul style="padding-right: 20px;">';
    html += `<li><strong>نام روتر هدف:</strong> ${wizServerName} (شناسه: <code>${wizServerId}</code>)</li>`;
    html += `<li><strong>سناریوی اجراشده:</strong> ${activeWizardScenario.toUpperCase()}</li>`;
    html += `<li><strong>مجموع دستورات ارسال‌شده به میکروتیک:</strong> ${allExecutedWizardCommands.length} خط CLI</li>`;
    html += `<li><strong>وضعیت Killswitch (Blackhole):</strong> فعال (Distance 10)</li>`;
    html += `<li><strong>بای‌پس ترافیک داخل کشور:</strong> رول Mangle <code>dst-address-list=!IRAN</code> فعال</li>`;
    html += '</ul>';
    box.innerHTML = html;
}

function copyAllWizardCommands() {
    if (allExecutedWizardCommands.length === 0) {
        alert('دستوری برای کپی وجود ندارد.');
        return;
    }
    navigator.clipboard.writeText(allExecutedWizardCommands.join('\n')).then(() => {
        alert('📋 تمام دستورات اجراشده میکروتیک با موفقیت در کلیپ‌بورد کپی شد!');
    }).catch(() => {
        prompt('دستورات جهت کپی:', allExecutedWizardCommands.join('\n'));
    });
}

function finishWizardAndReload() {
    closeModal('wizardModal');
    window.location.reload();
}
