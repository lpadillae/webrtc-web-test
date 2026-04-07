document.addEventListener('DOMContentLoaded', () => {
  const btnStart = document.getElementById('btnStart');
  const btnExport = document.getElementById('btnExport');
  const logsContainer = document.getElementById('logsContainer');
  const tableBody = document.getElementById('candidatesTableBody');
  const statusBadge = document.getElementById('statusBadge');
  
  // New Manual Configuration Inputs
  const inputUrl = document.getElementById('inputUrl');
  const inputUser = document.getElementById('inputUser');
  const inputPass = document.getElementById('inputPass');
  const btnAddServer = document.getElementById('btnAddServer');
  const serverListContainer = document.getElementById('serverListContainer');
  
  // Policy Toggle Elements
  const policyAll = document.getElementById('policyAll');
  const policyRelay = document.getElementById('policyRelay');
  let currentPolicy = 'all';

  policyAll.onclick = () => {
    currentPolicy = 'all';
    policyAll.className = 'px-4 py-1 text-xs font-bold rounded transition-all bg-indigo-600 text-white shadow-md';
    policyRelay.className = 'px-4 py-1 text-xs font-bold rounded transition-all text-slate-400 hover:text-slate-200';
    logger.info('ICE Transport Policy changed to: ALL');
  };

  policyRelay.onclick = () => {
    currentPolicy = 'relay';
    policyRelay.className = 'px-4 py-1 text-xs font-bold rounded transition-all bg-indigo-600 text-white shadow-md';
    policyAll.className = 'px-4 py-1 text-xs font-bold rounded transition-all text-slate-400 hover:text-slate-200';
    logger.info('ICE Transport Policy changed to: RELAY ONLY');
  };

  class Logger {
    constructor() {
      this.lines = [];
    }
    log(level, message) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0,-1);
      const logMsg = `[${timestamp}] [${level}] ${message}`;
      this.lines.push(logMsg);
      const el = document.createElement('div');
      el.textContent = logMsg;
      if (level === 'INFO') el.className = 'text-blue-400';
      if (level === 'WARN') el.className = 'text-yellow-400';
      if (level === 'ERROR') el.className = 'text-red-400 font-bold';
      logsContainer.appendChild(el);
      logsContainer.scrollTop = logsContainer.scrollHeight;
    }
    info(msg) { this.log('INFO', msg); }
    warn(msg) { this.log('WARN', msg); }
    error(msg) { this.log('ERROR', msg); }
    exportTxt() {
      if (this.lines.length === 0) { alert("No logs to export yet!"); return; }
      const blob = new Blob([this.lines.join('\n')], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `webrtc_diagnostic_${new Date().toISOString().replace(/:/g,'-')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  const logger = new Logger();

  // --- Manual Server Management ---
  let customServers = [];
  try {
    const saved = localStorage.getItem('webrtc_custom_servers');
    if (saved) customServers = JSON.parse(saved);
  } catch (e) {
    console.error('Failed to load storage', e);
  }

  function renderServerList() {
    if (customServers.length === 0) {
      serverListContainer.innerHTML = '<div class="text-slate-500 text-xs italic">No manual servers added. Using system defaults if provided.</div>';
      return;
    }
    serverListContainer.innerHTML = '';
    customServers.forEach((srv, idx) => {
      const tag = document.createElement('div');
      tag.className = 'flex items-center gap-2 bg-slate-700 text-slate-200 text-xs py-1 px-3 rounded-full border border-slate-600 shadow-sm transition-all hover:border-slate-400';
      
      const type = srv.urls.startsWith('turn:') ? 'TURN' : 'STUN';
      const label = document.createElement('span');
      label.innerHTML = `<strong class="text-fuchsia-400 mr-1">${type}</strong> ${srv.urls}`;
      
      const btnRemove = document.createElement('button');
      btnRemove.className = 'text-slate-400 hover:text-red-400 transition-colors ml-1';
      btnRemove.innerHTML = '&times;';
      btnRemove.onclick = () => {
        customServers.splice(idx, 1);
        saveServers();
        renderServerList();
      };
      
      tag.appendChild(label);
      tag.appendChild(btnRemove);
      serverListContainer.appendChild(tag);
    });
  }

  function saveServers() {
    localStorage.setItem('webrtc_custom_servers', JSON.stringify(customServers));
  }

  btnAddServer.addEventListener('click', () => {
    const url = inputUrl.value.trim();
    if (!url) return;
    if (!url.startsWith('stun:') && !url.startsWith('turn:')) {
      alert('URL must start with stun: or turn:');
      return;
    }
    const srv = { urls: url };
    if (inputUser.value.trim()) srv.username = inputUser.value.trim();
    if (inputPass.value.trim()) srv.credential = inputPass.value.trim();
    
    customServers.push(srv);
    saveServers();
    renderServerList();
    
    // Clear inputs
    inputUrl.value = '';
    inputUser.value = '';
    inputPass.value = '';
    inputUrl.focus();
  });

  renderServerList();
  // --- End Manual Server Management ---

  btnExport.addEventListener('click', () => logger.exportTxt());

  const socket = io();
  socket.on('connect', () => logger.info(`Socket.io connected: ${socket.id}`));
  socket.on('connect_error', () => logger.warn('Socket.io connection failed. Testing only ICE/WebRTC.'));

  let pc = null;

  async function startDiagnostic() {
    btnStart.disabled = true;
    btnStart.classList.add('opacity-50', 'cursor-not-allowed');
    tableBody.innerHTML = '';
    statusBadge.className = 'hidden mb-4 rounded-md p-3 text-sm font-medium border';
    
    logger.info('--- Starting ICE Diagnostic (Trickle Mode) ---');

    // Use custom servers primarily (as per user request "for now ICE_SERVERS_JSON won't be used")
    let iceServers = customServers.length > 0 ? customServers : [];

    if (iceServers.length === 0) {
        logger.warn('No custom ICE servers defined. Checking backend /ice-config for fallback...');
        try {
            const resp = await fetch('/ice-config');
            if (resp.ok) {
                const data = await resp.json();
                if (data.iceServers && data.iceServers.length > 0) {
                    iceServers = data.iceServers;
                    logger.info(`Loaded ${iceServers.length} fallback servers from backend.`);
                }
            }
        } catch (e) {
            logger.warn('Backend fallback unavailable.');
        }
    } else {
        logger.info(`Using ${iceServers.length} manual servers from UI/Storage.`);
    }

    if (iceServers.length === 0) {
        logger.warn('No servers found. Gathering will be restricted to local interfaces.');
    }

    runRTC(iceServers);
  }

  function runRTC(iceServers) {
    statusBadge.className = 'block mb-4 rounded-md p-3 text-sm font-medium border bg-indigo-900 border-indigo-700 text-indigo-200';
    statusBadge.textContent = 'Gathering ICE Candidates...';

    const rtcConfig = { 
        iceServers, 
        iceCandidatePoolSize: 0,
        iceTransportPolicy: currentPolicy 
    };
    pc = new RTCPeerConnection(rtcConfig);
    
    let hasRelay = false;
    let turnWasConfigured = iceServers.some(s => {
        const urls = s.urls;
        return Array.isArray(urls) ? urls.some(u => u.startsWith('turn:')) : urls.startsWith('turn:');
    });
    let startGatherTime = Date.now();

    pc.createDataChannel('diagnostic');

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const c = event.candidate;
        const candidateTimeMs = Date.now() - startGatherTime;
        logger.info(`[${c.type.toUpperCase()}] ${c.protocol.toUpperCase()} ${c.address}:${c.port}`);
        
        if (c.type === 'relay') hasRelay = true;

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800 border-b border-slate-800 last:border-0';
        tr.innerHTML = `
          <td class="px-4 py-3 font-mono text-xs">${c.address || 'N/A'}:${c.port || 0}</td>
          <td class="px-3 py-3 font-mono text-xs"><span class="bg-slate-700 py-0.5 px-1.5 rounded">${c.protocol.toUpperCase()}</span></td>
          <td class="px-3 py-3"><span class="px-2 py-0.5 rounded text-xs font-semibold shadow-sm border ${getTypeColor(c.type)}">${c.type.toUpperCase()}</span></td>
          <td class="px-3 py-3 text-slate-400 font-mono text-xs">${c.type === 'host' ? '< 1 ms' : '~' + candidateTimeMs + ' ms'}</td>
        `;
        if (tableBody.querySelectorAll('td[colspan]').length > 0) tableBody.innerHTML = '';
        tableBody.appendChild(tr);
      } else {
        logger.info('ICE Gathering State -> COMPLETE');
        if (turnWasConfigured && !hasRelay) {
          logger.error('CRITICAL: No RELAY candidate gathered for the configured TURN server(s).');
          showError('ERR_TURN_UNREACHABLE', 'TURN server(s) did not respond or authentication failed.');
        } else {
          statusBadge.className = 'block mb-4 rounded-md p-3 text-sm font-medium border bg-emerald-900 border-emerald-700 text-emerald-200';
          statusBadge.innerHTML = '<strong>Success:</strong> Gathering finished.';
          btnStart.disabled = false;
          btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }
    };

    pc.onicecandidateerror = (e) => logger.warn(`ICE Protocol Error (${e.errorCode}): ${e.errorText} at ${e.url}`);

    pc.createOffer().then(o => pc.setLocalDescription(o)).catch(e => {
        logger.error('RTC Fail: ' + e.message);
        showError('ERR_RTC_OFFER', 'Failed to trigger local SDP.');
    });
  }

  function getTypeColor(type) {
    if (type === 'host') return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
    if (type === 'srflx') return 'bg-fuchsia-900/50 text-fuchsia-300 border-fuchsia-700/50';
    if (type === 'relay') return 'bg-orange-900/50 text-orange-300 border-orange-700/50';
    return 'bg-slate-700 text-slate-300 border-slate-600';
  }

  function showError(code, message) {
    statusBadge.className = 'block mb-4 rounded-md p-3 text-sm font-medium border bg-red-900/30 border-red-700 text-red-200 flex items-center gap-3';
    statusBadge.innerHTML = `<strong>${code}:</strong> ${message}`;
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  btnStart.addEventListener('click', () => {
    if (logsContainer.children.length === 1 && logsContainer.children[0].textContent.includes('waiting')) logsContainer.innerHTML = '';
    startDiagnostic();
  });
});
