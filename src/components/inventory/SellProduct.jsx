import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Tesseract from 'tesseract.js';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';

const extractName = (text) => {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l =>
      l.length > 2 &&
      !/^\d+$/.test(l) &&
      !/^(mrp|price|rs|net|wt|weight|mfg|exp|batch|ingr|best|stor|contains|packed|fssai|lic)/i.test(l) &&
      !/^\W+$/.test(l)
    );
  const top = lines.slice(0, 5);
  if (!top.length) return '';
  return top.reduce((a, b) => (a.length >= b.length ? a : b));
};

export default function SellProduct() {
  const { products, sellProduct, findByBarcode } = useInventory();
  const { showToast } = useToast();

  const [mode, setMode] = useState('ai');
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState('');
  const [processing, setProcessing] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [sessionTotal, setSessionTotal] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const html5QrcodeRef = useRef(null);

  useEffect(() => {
    Html5Qrcode.getCameras().then(devices => {
      if (devices?.length) {
        setCameras(devices);
        const back = devices.find(d => /back|environment|rear/i.test(d.label));
        setSelectedCam(back ? back.id : devices[0].id);
      }
    }).catch(() => {});
    return () => stopEverything();
  }, []);

  /* ── AI Camera ── */
  const startAICamera = async () => {
    try {
      const constraints = selectedCam
        ? { video: { deviceId: { exact: selectedCam }, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);
    } catch {
      showToast('Camera access denied.', 'error');
    }
  };

  const stopAICamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const findBestMatch = (extractedName) => {
    if (!extractedName || !products.length) return null;
    const lower = extractedName.toLowerCase();
    // Exact substring match first
    let match = products.find(p => lower.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(lower));
    if (match) return match;
    // Fuzzy: find highest word overlap
    const words = lower.split(/\s+/).filter(w => w.length > 2);
    let bestScore = 0;
    let bestProduct = null;
    for (const p of products) {
      const pWords = p.name.toLowerCase().split(/\s+/);
      let score = 0;
      for (const w of words) {
        if (pWords.some(pw => pw.includes(w) || w.includes(pw))) score++;
      }
      if (score > bestScore) { bestScore = score; bestProduct = p; }
    }
    return bestScore >= 1 ? bestProduct : null;
  };

  const captureAndSell = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setProcessing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/png');

    try {
      const result = await Tesseract.recognize(dataUrl, 'eng');
      const text = result.data.text;
      const name = extractName(text);

      if (!name) {
        showToast('Could not read product. Try a clearer angle.', 'error');
        setProcessing(false);
        return;
      }

      const matched = findBestMatch(name);
      if (!matched) {
        showToast(`"${name}" not found in your inventory!`, 'error');
        setProcessing(false);
        return;
      }

      if (matched.quantity <= 0) {
        showToast(`"${matched.name}" is out of stock!`, 'error');
        setProcessing(false);
        return;
      }

      sellProduct(matched.id, 1);
      setSessionTotal(prev => prev + matched.price);
      setRecentSales(prev => [{ name: matched.name, price: matched.price, qty: 1, time: Date.now() }, ...prev.slice(0, 19)]);
      showToast(`✅ Sold 1× "${matched.name}" — ₹${matched.price}`, 'success');
    } catch {
      showToast('AI scan failed. Try again.', 'error');
    }
    setProcessing(false);
  }, [products, sellProduct, showToast]);

  /* ── Barcode mode ── */
  const startBarcodeScanner = async () => {
    try {
      const html5Qrcode = new Html5Qrcode('sell-reader');
      html5QrcodeRef.current = html5Qrcode;
      const camConfig = selectedCam ? { deviceId: { exact: selectedCam } } : { facingMode: 'environment' };
      await html5Qrcode.start(camConfig, {
        fps: 10, qrbox: { width: 250, height: 250 },
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      }, (decodedText) => {
        const found = findByBarcode(decodedText);
        if (found) {
          if (found.quantity <= 0) {
            showToast(`"${found.name}" is out of stock!`, 'error');
            return;
          }
          sellProduct(found.id, 1);
          setSessionTotal(prev => prev + found.price);
          setRecentSales(prev => [{ name: found.name, price: found.price, qty: 1, time: Date.now() }, ...prev.slice(0, 19)]);
          showToast(`✅ Sold 1× "${found.name}" — ₹${found.price}`, 'success');
        } else {
          showToast(`Barcode ${decodedText} not found in inventory.`, 'error');
        }
      }, () => {});
      setScanning(true);
    } catch {
      showToast('Camera access denied.', 'error');
    }
  };

  const stopEverything = async () => {
    stopAICamera();
    if (html5QrcodeRef.current) {
      try { await html5QrcodeRef.current.stop(); } catch {}
      html5QrcodeRef.current = null;
    }
    setScanning(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-3">
          <span className="stat-icon green"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg></span>
          Sell / Checkout
        </h1>
        <p className="page-subtitle">Point camera at a product to instantly sell and deduct from inventory</p>
      </div>

      {/* Session Total */}
      <div className="card p-4 mb-6 bg-gradient-to-r from-[var(--surface)] to-[var(--bg)] border-2 border-[var(--success)]/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--text-muted)] font-semibold uppercase">Session Total</p>
            <p className="text-3xl font-bold text-[var(--success)]">₹{sessionTotal.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-muted)]">{recentSales.length} items sold</p>
            {recentSales.length > 0 && (
              <button onClick={() => { setRecentSales([]); setSessionTotal(0); }} className="text-xs text-red-400 hover:text-red-300 mt-1">Clear Session</button>
            )}
          </div>
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => { stopEverything(); setMode('ai'); }} className={`btn flex-1 py-3 text-sm font-bold transition-all ${mode === 'ai' ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-glow border-0' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          ✨ AI Scan & Sell
        </button>
        <button onClick={() => { stopEverything(); setMode('barcode'); }} className={`btn flex-1 py-3 text-sm font-bold transition-all ${mode === 'barcode' ? 'btn-primary shadow-glow' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          📊 Barcode Scan
        </button>
      </div>

      {/* AI Scan Mode */}
      {mode === 'ai' && (
        <div className="card p-0 overflow-hidden mb-6">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="text-green-400">✨</span> AI Scan & Sell
            </h2>
            <span className="text-xs text-[var(--text-muted)]">Point at product → Tap Sell</span>
          </div>
          <div className="relative bg-black" style={{ minHeight: '320px' }}>
            <video ref={videoRef} className="w-full" style={{ display: scanning ? 'block' : 'none' }} playsInline muted />
            <canvas ref={canvasRef} className="hidden" />

            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[rgba(0,0,0,0.85)] p-6">
                {cameras.length > 1 && (
                  <select value={selectedCam} onChange={e => setSelectedCam(e.target.value)} className="form-input w-full max-w-xs text-sm py-2 bg-[var(--surface)] text-center">
                    {cameras.map(c => <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.substring(0,8)}`}</option>)}
                  </select>
                )}
                <button onClick={startAICamera} className="btn bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 text-lg shadow-glow w-full max-w-xs border-0">
                  ✨ Start AI Camera
                </button>
              </div>
            )}

            {scanning && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between gap-3">
                <button onClick={stopAICamera} className="btn bg-red-600/80 text-white text-sm px-4 py-3 rounded-xl">✕ Stop</button>
                <button onClick={captureAndSell} disabled={processing} className="btn bg-gradient-to-r from-orange-500 to-red-600 text-white text-lg px-8 py-3 rounded-xl shadow-glow flex-1 border-0 disabled:opacity-50">
                  {processing ? (
                    <span className="flex items-center justify-center gap-2"><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Reading...</span>
                  ) : '📸 Capture & Sell'}
                </button>
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-green-300 font-bold">Identifying product...</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barcode Mode */}
      {mode === 'barcode' && (
        <div className="card p-0 overflow-hidden mb-6">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">📊 Barcode Scanner</h2>
          </div>
          <div className="relative bg-black" style={{ minHeight: '300px' }}>
            <div id="sell-reader" className="w-full" />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[rgba(0,0,0,0.85)] p-6">
                {cameras.length > 1 && (
                  <select value={selectedCam} onChange={e => setSelectedCam(e.target.value)} className="form-input w-full max-w-xs text-sm py-2 bg-[var(--surface)] text-center">
                    {cameras.map(c => <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.substring(0,8)}`}</option>)}
                  </select>
                )}
                <button onClick={startBarcodeScanner} className="btn btn-primary px-8 py-3 text-lg shadow-glow w-full max-w-xs">📊 Start Scanner</button>
              </div>
            )}
            {scanning && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                <span className="bg-black/70 text-green-400 text-xs px-3 py-2 rounded-full animate-pulse">Scanning...</span>
                <button onClick={stopEverything} className="bg-red-600/80 text-white text-xs px-4 py-2 rounded-full">Stop</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Feed */}
      {recentSales.length > 0 && (
        <div className="card p-5">
          <h3 className="font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            🧾 Sales This Session ({recentSales.length})
          </h3>
          <div className="space-y-2">
            {recentSales.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)]">
                <div className="flex items-center gap-3">
                  <span className="badge badge-success">Sold</span>
                  <span className="font-medium text-[var(--text-primary)]">{item.name}</span>
                </div>
                <span className="font-bold text-[var(--primary)]">₹{item.price}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
