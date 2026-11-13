import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import Tesseract from 'tesseract.js';
import { useInventory } from '../../context/InventoryContext';
import { useToast } from '../../context/ToastContext';

/* ── helpers ── */
const extractPrice = (text) => {
  // Match patterns: MRP ₹120, Rs. 45, Rs 99.50, MRP: 150, ₹ 200
  const patterns = [
    /MRP\s*[:\s]*[₹Rs.]*\s*(\d+(?:\.\d{1,2})?)/i,
    /[₹]\s*(\d+(?:\.\d{1,2})?)/,
    /Rs\.?\s*(\d+(?:\.\d{1,2})?)/i,
    /Price\s*[:\s]*(\d+(?:\.\d{1,2})?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return Number(m[1]);
  }
  return 0;
};

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
  // Pick the longest line in the first 5 as most likely the product name
  const top = lines.slice(0, 5);
  if (!top.length) return '';
  return top.reduce((a, b) => (a.length >= b.length ? a : b));
};

const generateId = () => 'P' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();

export default function AddStock() {
  const { addProduct, findByBarcode } = useInventory();
  const { showToast } = useToast();

  const [mode, setMode] = useState('ai');          // 'ai' | 'barcode'
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState('');
  const [processing, setProcessing] = useState(false);
  const [recentAdds, setRecentAdds] = useState([]);
  const [lastExtracted, setLastExtracted] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', category: '', price: 0, quantity: 1 });

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

  /* ── AI Camera (video stream) ── */
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
      showToast('Camera access denied. Please allow camera permission.', 'error');
    }
  };

  const stopAICamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  const captureAndExtract = useCallback(async () => {
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
      const price = extractPrice(text);

      if (!name) {
        showToast('Could not read product name. Try a clearer angle.', 'error');
        setProcessing(false);
        return;
      }

      const product = {
        barcode: generateId(),
        name,
        category: '',
        price,
        quantity: 1,
        reorderLevel: 10,
      };

      const res = addProduct(product);
      showToast(`✅ Added "${name}" (₹${price}) to inventory!`, 'success');
      setRecentAdds(prev => [{ name, price, qty: 1, action: res.action, time: Date.now() }, ...prev.slice(0, 14)]);
      setLastExtracted({ name, price, rawText: text });
    } catch {
      showToast('AI extraction failed. Try again with better lighting.', 'error');
    }
    setProcessing(false);
  }, [addProduct, showToast]);

  /* ── Barcode mode ── */
  const startBarcodeScanner = async () => {
    try {
      const html5Qrcode = new Html5Qrcode('add-stock-reader');
      html5QrcodeRef.current = html5Qrcode;
      const camConfig = selectedCam ? { deviceId: { exact: selectedCam } } : { facingMode: 'environment' };
      await html5Qrcode.start(camConfig, {
        fps: 10, qrbox: { width: 250, height: 250 },
        experimentalFeatures: { useBarCodeDetectorIfSupported: true }
      }, async (decodedText) => {
        html5Qrcode.stop();
        html5QrcodeRef.current = null;
        setScanning(false);

        const existing = findByBarcode(decodedText);
        if (existing) {
          addProduct({ ...existing, quantity: 1 });
          showToast(`✅ +1 "${existing.name}" added to stock!`, 'success');
          setRecentAdds(prev => [{ name: existing.name, price: existing.price, qty: 1, action: 'updated', time: Date.now() }, ...prev.slice(0, 14)]);
        } else {
          // Try Open Food Facts
          try {
            const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${decodedText}.json`);
            const data = await res.json();
            if (data?.status === 1 && data.product) {
              const name = data.product.product_name || data.product.generic_name || `Product ${decodedText}`;
              const cat = data.product.categories ? data.product.categories.split(',')[0] : '';
              const product = { barcode: decodedText, name, category: cat, price: 0, quantity: 1, reorderLevel: 10 };
              addProduct(product);
              showToast(`✅ Added "${name}" from global database! Set price in Inventory.`, 'success');
              setRecentAdds(prev => [{ name, price: 0, qty: 1, action: 'added', time: Date.now() }, ...prev.slice(0, 14)]);
            } else {
              const product = { barcode: decodedText, name: `Product ${decodedText.slice(-6)}`, category: '', price: 0, quantity: 1, reorderLevel: 10 };
              addProduct(product);
              showToast(`Added unknown barcode ${decodedText}. Edit details in Inventory page.`, 'success');
              setRecentAdds(prev => [{ name: product.name, price: 0, qty: 1, action: 'added', time: Date.now() }, ...prev.slice(0, 14)]);
            }
          } catch {
            const product = { barcode: decodedText, name: `Product ${decodedText.slice(-6)}`, category: '', price: 0, quantity: 1, reorderLevel: 10 };
            addProduct(product);
            showToast(`Added barcode ${decodedText}. Edit in Inventory.`, 'success');
            setRecentAdds(prev => [{ name: product.name, price: 0, qty: 1, action: 'added', time: Date.now() }, ...prev.slice(0, 14)]);
          }
        }
      }, () => {});
      setScanning(true);
    } catch {
      showToast('Camera access denied or not found.', 'error');
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

  const handleEditSave = () => {
    if (!editForm.name.trim()) { showToast('Name is required', 'error'); return; }
    const product = { barcode: generateId(), name: editForm.name, category: editForm.category, price: Number(editForm.price), quantity: Number(editForm.quantity), reorderLevel: 10 };
    const res = addProduct(product);
    showToast(`✅ Added "${editForm.name}" (₹${editForm.price}) ×${editForm.quantity}`, 'success');
    setRecentAdds(prev => [{ name: editForm.name, price: editForm.price, qty: editForm.quantity, action: res.action, time: Date.now() }, ...prev.slice(0, 14)]);
    setEditMode(false);
    setEditForm({ name: '', category: '', price: 0, quantity: 1 });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="page-header">
        <h1 className="page-title flex items-center gap-3">
          <span className="stat-icon blue"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></span>
          Add Stock to Inventory
        </h1>
        <p className="page-subtitle">Point your camera at a product — AI will read the label and instantly add it</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => { stopEverything(); setMode('ai'); }} className={`btn flex-1 py-3 text-sm font-bold transition-all ${mode === 'ai' ? 'btn-primary shadow-glow' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          ✨ AI Smart Scan
        </button>
        <button onClick={() => { stopEverything(); setMode('barcode'); }} className={`btn flex-1 py-3 text-sm font-bold transition-all ${mode === 'barcode' ? 'btn-primary shadow-glow' : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]'}`}>
          📊 Barcode Scan
        </button>
        <button onClick={() => { stopEverything(); setEditMode(true); }} className="btn bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] py-3 text-sm font-bold">
          ✏️ Manual
        </button>
      </div>

      {/* AI Smart Scan Mode */}
      {mode === 'ai' && (
        <div className="card p-0 overflow-hidden mb-6">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="text-purple-400">✨</span> AI Smart Scan
            </h2>
            <span className="text-xs text-[var(--text-muted)]">Point at product label → Tap Capture</span>
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
                <button onClick={startAICamera} className="btn bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-4 text-lg shadow-glow w-full max-w-xs border-0">
                  ✨ Start AI Camera
                </button>
                <p className="text-gray-500 text-xs text-center max-w-xs">Point camera at the product packaging where the name and price are visible</p>
              </div>
            )}

            {scanning && (
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-between gap-3">
                <button onClick={stopAICamera} className="btn bg-red-600/80 text-white text-sm px-4 py-3 rounded-xl">✕ Stop</button>
                <button onClick={captureAndExtract} disabled={processing} className="btn bg-gradient-to-r from-green-500 to-emerald-600 text-white text-lg px-8 py-3 rounded-xl shadow-glow flex-1 border-0 disabled:opacity-50">
                  {processing ? (
                    <span className="flex items-center justify-center gap-2"><span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Reading...</span>
                  ) : '📸 Capture & Add'}
                </button>
              </div>
            )}

            {processing && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-purple-300 font-bold">AI is reading the product...</p>
                </div>
              </div>
            )}
          </div>

          {lastExtracted && (
            <div className="p-4 bg-[var(--surface)] border-t border-[var(--border)]">
              <p className="text-xs text-[var(--text-muted)] mb-1">Last extracted:</p>
              <p className="font-bold text-[var(--text-primary)]">{lastExtracted.name} — <span className="text-[var(--success)]">₹{lastExtracted.price}</span></p>
            </div>
          )}
        </div>
      )}

      {/* Barcode Mode */}
      {mode === 'barcode' && (
        <div className="card p-0 overflow-hidden mb-6">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)]">
            <h2 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <span className="text-blue-400">📊</span> Barcode Scanner
            </h2>
          </div>
          <div className="relative bg-black" style={{ minHeight: '300px' }}>
            <div id="add-stock-reader" className="w-full" />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[rgba(0,0,0,0.85)] p-6">
                {cameras.length > 1 && (
                  <select value={selectedCam} onChange={e => setSelectedCam(e.target.value)} className="form-input w-full max-w-xs text-sm py-2 bg-[var(--surface)] text-center">
                    {cameras.map(c => <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.substring(0,8)}`}</option>)}
                  </select>
                )}
                <button onClick={startBarcodeScanner} className="btn btn-primary px-8 py-3 text-lg shadow-glow w-full max-w-xs">
                  📊 Start Barcode Scanner
                </button>
              </div>
            )}
            {scanning && (
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center">
                <span className="bg-black/70 text-green-400 text-xs px-3 py-2 rounded-full animate-pulse">📊 Scanning...</span>
                <button onClick={stopEverything} className="bg-red-600/80 text-white text-xs px-4 py-2 rounded-full">Stop</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {editMode && (
        <div className="card p-6 mb-6 border-2 border-[var(--primary)]">
          <h2 className="font-bold text-[var(--text-primary)] mb-4 flex items-center gap-2">✏️ Manual Entry</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Product Name *</label>
              <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Maggi Noodles" className="form-input-no-icon" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Category</label>
                <input value={editForm.category} onChange={e => setEditForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Grocery" className="form-input-no-icon" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Price (₹)</label>
                <input type="number" min="0" step="0.01" value={editForm.price} onChange={e => setEditForm(p => ({ ...p, price: e.target.value }))} className="form-input-no-icon font-bold" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Quantity</label>
              <input type="number" min="1" value={editForm.quantity} onChange={e => setEditForm(p => ({ ...p, quantity: e.target.value }))} className="form-input-no-icon text-lg font-bold text-center" />
            </div>
            <div className="flex gap-3">
              <button onClick={handleEditSave} className="btn btn-primary flex-1 py-3 text-lg shadow-glow">➕ Add to Inventory</button>
              <button onClick={() => setEditMode(false)} className="btn bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] px-6 py-3">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Recently Added Feed */}
      {recentAdds.length > 0 && (
        <div className="card p-5">
          <h3 className="font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
            <span className="text-green-400">✓</span> Recently Added ({recentAdds.length})
          </h3>
          <div className="space-y-2">
            {recentAdds.map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`badge ${item.action === 'added' ? 'badge-success' : 'badge-info'}`}>{item.action === 'added' ? 'New' : '+Stock'}</span>
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">{item.name}</span>
                    {item.price > 0 && <span className="text-xs text-[var(--text-muted)] ml-2">₹{item.price}</span>}
                  </div>
                </div>
                <span className="font-bold text-[var(--success)]">+{item.qty}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
