document.addEventListener('DOMContentLoaded', () => {
  const btnStart = document.getElementById('btnStart');
  const btnExport = document.getElementById('btnExport');
  const logsContainer = document.getElementById('logsContainer');
  const tableBody = document.getElementById('candidatesTableBody');
  const statusBadge = document.getElementById('statusBadge');

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
      if (this.lines.length === 0) {
        alert("No logs to export yet!");
        return;
      }
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

  btnExport.addEventListener('click', () => {
    logger.exportTxt();
  });

  // Socket setup for signaling validation
  const socket = io();
  let basePing = 0;
  
  socket.on('connect', () => {
    logger.info(`Socket.io connected: ${socket.id}`);
    const start = Date.now();
    socket.emit('ping_test', {}, () => {
      basePing = (Date.now() - start) / 2;
      logger.info(`Backend handshake estimated RTT step: ${basePing} ms`);
    });
  });

  socket.on('connect_error', (error) => {
    logger.warn('Socket.io connection disabled or failed. Proceeding solely with WebRTC APIs.');
  });

  let pc = null;

  async function startDiagnostic() {
    btnStart.disabled = true;
    btnStart.classList.add('opacity-50', 'cursor-not-allowed');
    tableBody.innerHTML = '';
    statusBadge.className = 'hidden mb-4 rounded-md p-3 text-sm font-medium border';
    
    logger.info('--- Starting Cloud-Native WebRTC Diagnostic ---');

    try {
      logger.info('Fetching GET /ice-config...');
      statusBadge.textContent = 'Fetching ICE Configuration...';
      statusBadge.classList.replace('hidden', 'block');
      statusBadge.classList.add('bg-blue-900', 'text-blue-200', 'border-blue-700');

      const response = await fetch('/ice-config');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const configData = await response.json();
      const iceServers = configData.iceServers;
      
      if (!iceServers || iceServers.length === 0) {
        logger.warn('No ICE servers loaded from environment. Gathering will only rely on local OS interfaces.');
      } else {
        logger.info(`Successfully parsed ${iceServers.length} ICE server blocks from secure endpoint.`);
      }

      runRTC(iceServers);

    } catch (error) {
      logger.error('Failed to resolve /ice-config: ' + error.message);
      showError('ERR_FETCH_CONFIG', 'Backend configuration endpoint unreachable or malformed.');
    }
  }

  function runRTC(iceServers) {
    statusBadge.className = 'block mb-4 rounded-md p-3 text-sm font-medium border bg-indigo-900 text-indigo-200 border-indigo-700';
    statusBadge.textContent = 'Initializing RTCPeerConnection and Dispatching ICE DataChannels...';

    const rtcConfig = { iceServers, iceCandidatePoolSize: 0 };
    pc = new RTCPeerConnection(rtcConfig);
    
    let hasRelay = false;
    let turnWasConfigured = iceServers.some(s => s.urls && (typeof s.urls === 'string' ? s.urls.startsWith('turn:') : s.urls.some(u => u.startsWith('turn:'))));
    let startGatherTime = Date.now();

    // Data channel is necessary to force the browser to gather candidates
    pc.createDataChannel('diagnostic-stream');

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const c = event.candidate;
        const candidateTimeMs = Date.now() - startGatherTime;
        
        // Log locally
        if (c.address && c.type !== 'host' && c.address.includes('.local')) {
            logger.info(`Gathered mDNS hidden candidate: ${c.protocol} ${c.address}`);
        } else {
            logger.info(`Discovered [${c.type}] interface -> ${c.protocol.toUpperCase()} ${c.address}:${c.port}`);
        }
        
        if (c.type === 'relay') hasRelay = true;

        let estimatedLatency = '-';
        if (c.type === 'relay') {
            estimatedLatency = '~' + candidateTimeMs + ' ms';
        } else if (c.type === 'srflx') {
            estimatedLatency = '~' + candidateTimeMs + ' ms'; 
        } else {
            // Local interfaces typically have 0-1ms latency
            estimatedLatency = '< 1 ms (LAN/VPN)';
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-800 transition-colors cursor-default border-b border-slate-800 last:border-0';
        tr.innerHTML = `
          <td class="px-4 py-3 font-mono text-xs">${c.address}:${c.port}</td>
          <td class="px-3 py-3 font-mono text-xs">
             <span class="bg-slate-700 text-slate-300 py-0.5 px-1.5 rounded">${c.protocol.toUpperCase()}</span>
          </td>
          <td class="px-3 py-3">
             <span class="px-2 py-0.5 rounded text-xs font-semibold shadow-sm border ${getTypeColor(c.type)}">${c.type.toUpperCase()}</span>
          </td>
          <td class="px-3 py-3 text-slate-400 font-mono text-xs">${estimatedLatency}</td>
        `;
        // Clear placeholder text if it's the first actual candidate inserted
        if (tableBody.querySelectorAll('td[colspan]').length > 0) {
           tableBody.innerHTML = '';
        }
        tableBody.appendChild(tr);
      } else {
        logger.info('ICE Gathering State Engine -> COMPLETE');
        
        if (turnWasConfigured && !hasRelay) {
          logger.error('CRITICAL: TURN server specified but no RELAY candidate was gathered!');
          showError('ERR_TURN_UNREACHABLE', 'TURN server did not respond or WebRTC authentication failed. Check credentials, DNS, or firewall configs.');
        } else {
          statusBadge.className = 'block mb-4 rounded-md p-3 text-sm font-medium border bg-emerald-900 border-emerald-700 text-emerald-200';
          if(turnWasConfigured) {
             statusBadge.innerHTML = '<strong>Success:</strong> System gathered host, reflexive, and relay candidates properly.';
          } else {
             statusBadge.innerHTML = '<strong>Success:</strong> Local candidates gathered (No TURN validation required).';
          }
          btnStart.disabled = false;
          btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }
    };

    pc.onicecandidateerror = (event) => {
      logger.warn(`ICE Core Protocol Error (Code ${event.errorCode}): ${event.errorText} at URL ${event.url}`);
    };

    pc.createOffer()
      .then(offer => {
         logger.info('Generated local diagnostic description (SDP)');
         return pc.setLocalDescription(offer);
      })
      .then(() => logger.info('Set LocalDescription. ICE Engine triggered...'))
      .catch(e => {
        logger.error('Failed negotiating local WebRTC layer: ' + e.message);
        showError('ERR_RTC_OFFER', 'Failed to instantiate local SDP format.');
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
    statusBadge.innerHTML = `
      <svg class="w-6 h-6 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
      <div><strong class="block text-red-400">${code}</strong>${message}</div>
    `;
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  // Hide the initial waiting text when any action occurs
  btnStart.addEventListener('click', () => {
    if (logsContainer.children.length === 1 && logsContainer.children[0].textContent.includes('waiting')) {
       logsContainer.innerHTML = '';
    }
    startDiagnostic();
  });
});
