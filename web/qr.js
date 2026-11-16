/* Trove — connect by QR code: scan a Trove or Dawarich code, or show one for another device. MIT License. */
'use strict';

let scanStream = null, scanTimer = null, scanBusy = false;

function loadScript(src) {
  return new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = src; el.onload = res; el.onerror = () => rej(new Error('Could not load the QR reader'));
    document.head.appendChild(el);
  });
}

// What a scanned code means. Trove: {"trove":1,"server_url","token"}. Dawarich: {"server_url","api_key"}.
function handleScanText(text) {
  let d;
  try { d = JSON.parse(text); } catch { return false; }
  if (!d || typeof d.server_url !== 'string' || !/^https?:\/\//i.test(d.server_url)) return false;
  const url = d.server_url.replace(/\/+$/, '');
  if (d.trove && typeof d.token === 'string') {
    $('#srvUrl').value = url; $('#srvToken').value = d.token;
    $('#syncSave').click();
    return 'Trove server';
  }
  if (typeof d.api_key === 'string') {
    $('#dwUrl').value = url; $('#dwKey').value = d.api_key;
    $('#dwSave').click();
    return 'Dawarich';
  }
  return false;
}

function stopScan() {
  clearInterval(scanTimer); scanTimer = null;
  if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  const v = $('#scanVideo'); v.pause(); v.srcObject = null;
}

async function startScan() {
  const hint = $('#scanHint');
  hint.textContent = 'Point the camera at a Trove or Dawarich connection QR code.';
  $('#scanner').showModal();
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This device or browser has no camera access');
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const video = $('#scanVideo');
    video.srcObject = scanStream;
    await video.play();

    let detector = null;
    if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
    if (!detector && typeof jsQR === 'undefined') await loadScript('vendor/qr/jsQR.min.js');
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });

    scanTimer = setInterval(async () => {
      if (scanBusy || !video.videoWidth) return;
      scanBusy = true;
      try {
        let text = '';
        if (detector) {
          const found = await detector.detect(video);
          text = found[0] ? found[0].rawValue : '';
        } else {
          const s = Math.min(1, 800 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * s); canvas.height = Math.round(video.videoHeight * s);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(img.data, img.width, img.height);
          text = hit ? hit.data : '';
        }
        if (text) {
          const what = handleScanText(text);
          if (what) { stopScan(); closeSheet($('#scanner')); if (navigator.vibrate) navigator.vibrate(60); }
          else hint.textContent = "That QR code isn't a Trove or Dawarich connection code.";
        }
      } catch { /* keep trying */ } finally { scanBusy = false; }
    }, 200);
  } catch (err) {
    stopScan();
    hint.textContent = err.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow the camera for Trove in your phone settings, then try again.'
      : (err.message || 'Could not start the camera');
  }
}

function showConnectQr() {
  if (!settings.serverUrl || typeof qrcode === 'undefined') return;
  const q = qrcode(0, 'M');
  q.addData(JSON.stringify({ trove: 1, server_url: settings.serverUrl.replace(/\/+$/, ''), token: settings.token || '' }));
  q.make();
  $('#qrImage').innerHTML = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
  $('#qrShow').showModal();
}

(function bindQr() {
  $('#syncScan').addEventListener('click', startScan);
  $('#dwScan').addEventListener('click', startScan);
  $('#syncShowQr').addEventListener('click', showConnectQr);
  $('#scanner').addEventListener('close', stopScan);
  const refresh = () => { $('#syncShowQr').hidden = !settings.serverUrl; };
  // Runs after app.js has filled in the settings sheet.
  $('#settingsBtn').addEventListener('click', async () => {
    refresh();
    // Opened from a Trove server in a browser? Offer that server's address so only the token needs typing.
    if (!settings.serverUrl && !$('#srvUrl').value && location.protocol.startsWith('http') && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
      try { const r = await fetch('api/health'); if (r.ok && (await r.json()).app === 'trove' && !$('#srvUrl').value) $('#srvUrl').value = location.origin; } catch {}
    }
  });
  $('#syncSave').addEventListener('click', () => setTimeout(refresh, 0));
  $('#syncOff').addEventListener('click', () => setTimeout(refresh, 0));
})();
