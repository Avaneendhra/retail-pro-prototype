import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/apiClient';

// --- Icons ---
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
);
const ScanLineIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
);
const CartPlusIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0zM12 9v3m0 0v3m0-3h3m-3 0H9" /></svg>
);
const SearchIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
);
const UploadIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
);
const CameraIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
);

export default function BarcodeScanner() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { showToast } = useToast();

  const [scanning, setScanning] = useState(false);
  const [scannedProduct, setScannedProduct] = useState(null);
  const [scannedCode, setScannedCode] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');

  const scannerRef = useRef(null);
  const html5QrcodeRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        setCameras(devices);
        // Default to back camera if available, else first
        const backCam = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        setSelectedCameraId(backCam ? backCam.id : devices[0].id);
      }
    }).catch(err => {
      console.warn("Could not get cameras", err);
    });

    return () => stopScanner();
  }, []);

  const startScanner = async () => {
    setCameraError('');
    setScannedProduct(null);
    setNotFound(false);
    setScannedCode('');
    setQuantity(1);

    try {
      const html5Qrcode = new Html5Qrcode("barcode-reader");
      html5QrcodeRef.current = html5Qrcode;

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      const cameraConfig = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : { facingMode: "environment" };

      await html5Qrcode.start(
        cameraConfig,
        config,
        async (decodedText) => {
          await html5Qrcode.stop();
          html5QrcodeRef.current = null;
          setScanning(false);
          handleBarcodeResult(decodedText);
        },
        () => { /* ignore */ }
      );
      setScanning(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError('Camera access denied or device not found.');
    }
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current) {
      try { await html5QrcodeRef.current.stop(); } catch (e) {}
      html5QrcodeRef.current = null;
    }
    setScanning(false);
  };

  const handleBarcodeResult = async (code) => {
    setScannedCode(code);
    setNotFound(false);
    setScannedProduct(null);
    try {
      const res = await api.get(`/api/products/barcode/${code}`);
      setScannedProduct(res.data);
    } catch {
      setNotFound(true);
    }
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (manualCode.trim()) handleBarcodeResult(manualCode.trim());
  };

  const handleImageUpload = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsProcessingImage(true);
      const file = e.target.files[0];
      try {
        const html5QrCode = new Html5Qrcode("barcode-reader");
        const decodedText = await html5QrCode.scanFile(file, true);
        handleBarcodeResult(decodedText);
      } catch (err) {
        showToast("Could not read a valid barcode from the image. Ensure the code is clear.", "error");
      } finally {
        setIsProcessingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleAddToCart = () => {
    if (scannedProduct && quantity > 0) {
      addToCart(scannedProduct, quantity);
      showToast(`Added ${quantity}x ${scannedProduct.name}`, 'success');
      setScannedProduct(null);
      setScannedCode('');
      setQuantity(1);
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center">
      <div className="w-full max-w-lg mx-auto pt-4 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[rgba(14,165,255,0.1)] text-[var(--primary)] rounded-xl">
              <ScanLineIcon />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">POS Scanner</h1>
              <p className="text-sm text-[var(--text-muted)]">Scan to add to checkout</p>
            </div>
          </div>
          <button onClick={() => navigate(-1)} className="btn-icon"><CloseIcon /></button>
        </div>
      </div>

      <div className="w-full max-w-lg mx-auto">
        {!scannedProduct && !notFound && (
          <div className="card overflow-hidden">
            {/* Camera Viewport */}
            <div className="relative bg-black rounded-t-[1rem] overflow-hidden" style={{ minHeight: '320px' }}>
              <div id="barcode-reader" ref={scannerRef} className="w-full" />
              
              {!scanning && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[rgba(0,0,0,0.8)] backdrop-blur-sm p-6">
                  {cameras.length > 0 && (
                    <div className="w-full max-w-xs mb-4 relative z-20">
                      <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1 block text-center">Select Camera</label>
                      <select 
                        value={selectedCameraId}
                        onChange={(e) => setSelectedCameraId(e.target.value)}
                        className="form-input w-full text-sm text-center py-2 bg-[var(--surface)] text-[var(--text-primary)] border-[var(--border)]"
                      >
                        {cameras.map(c => <option key={c.id} value={c.id}>{c.label || `Camera ${c.id.substring(0,5)}`}</option>)}
                      </select>
                    </div>
                  )}
                  <button onClick={startScanner} className="btn btn-primary px-8 py-3 text-lg shadow-glow flex items-center justify-center w-full max-w-xs">
                    <CameraIcon /> Start Scanner
                  </button>
                  
                  <div className="w-full max-w-xs text-center my-1 relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border)] opacity-30"></div></div>
                    <span className="relative bg-black px-4 text-xs text-gray-500">OR</span>
                  </div>

                  <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageUpload} className="hidden" id="barcode-image-upload" />
                  <label htmlFor="barcode-image-upload" className="w-full max-w-xs btn bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] hover:border-[var(--primary)] py-3 cursor-pointer flex justify-center">
                    <UploadIcon /> Scan from Image
                  </label>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[rgba(0,0,0,0.9)] p-6 text-center">
                  <p className="text-red-300 text-sm">{cameraError}</p>
                  <button onClick={startScanner} className="btn btn-primary mt-2">Try Again</button>
                </div>
              )}

              {scanning && (
                <div className="absolute bottom-4 left-0 right-0 text-center flex justify-center px-4">
                  <div className="bg-[rgba(0,0,0,0.7)] text-[var(--success)] text-xs px-4 py-2 rounded-full font-medium animate-pulse border border-[rgba(255,255,255,0.1)] flex items-center gap-3 w-full justify-between">
                    <span>📷 Scanning...</span>
                    <button onClick={stopScanner} className="text-red-400 hover:text-red-300 bg-red-900/30 px-3 py-1 rounded-full">Stop</button>
                  </div>
                </div>
              )}

              {isProcessingImage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[rgba(0,0,0,0.8)] z-10">
                  <div className="w-10 h-10 border-4 border-t-[var(--primary)] border-transparent rounded-full animate-spin"></div>
                  <p className="text-white">Analyzing Image...</p>
                </div>
              )}
            </div>

            {/* Manual Entry */}
            <div className="p-5 border-t border-[var(--border)] bg-[var(--surface-hover)]">
              <form onSubmit={handleManualSearch} className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter barcode manually..."
                  className="form-input flex-grow bg-[var(--surface)]"
                />
                <button type="submit" className="btn btn-primary px-5"><SearchIcon /> Find</button>
              </form>
            </div>
          </div>
        )}

        {/* Product Found */}
        {scannedProduct && (
          <div className="card overflow-hidden animate-in">
            <div className="bg-[var(--success)] p-4 text-white text-center">
              <h2 className="font-bold text-lg">Product Identified</h2>
              <span className="text-green-100 text-sm font-mono opacity-90">{scannedCode}</span>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-1">{scannedProduct.name}</h3>
              <p className="text-sm text-[var(--text-muted)] font-medium mb-5">{scannedProduct.category}</p>

              <div className="flex items-center gap-3 mb-6 bg-[var(--surface-hover)] p-3 rounded-xl border border-[var(--border)]">
                <label className="text-sm font-semibold text-[var(--text-secondary)] flex-grow">Quantity</label>
                <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden shadow-sm">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-4 py-2 hover:bg-[var(--surface-hover)] font-bold">−</button>
                  <span className="px-4 py-2 text-center font-bold min-w-[3rem] border-x border-[var(--border)]">{quantity}</span>
                  <button onClick={() => setQuantity(Math.min(scannedProduct.quantity, quantity + 1))} className="px-4 py-2 hover:bg-[var(--surface-hover)] font-bold">+</button>
                </div>
              </div>

              <button onClick={handleAddToCart} className="btn w-full btn-primary py-4 text-lg shadow-glow mb-3">
                <CartPlusIcon /> Add to Cart — ₹{(scannedProduct.price * quantity).toLocaleString()}
              </button>
              <button onClick={handleScanAgain} className="btn w-full btn-secondary">Scan Another</button>
            </div>
          </div>
        )}

        {/* Not Found */}
        {notFound && (
          <div className="card overflow-hidden animate-in">
            <div className="bg-[var(--danger)] p-4 text-white text-center">
              <h2 className="font-bold text-lg">Unknown Barcode</h2>
              <span className="text-red-100 text-sm font-mono opacity-90">{scannedCode}</span>
            </div>
            <div className="p-6 text-center">
              <p className="text-[var(--text-secondary)] font-medium mb-6">No product matches this barcode.</p>
              <button onClick={handleScanAgain} className="btn btn-primary w-full py-3 shadow-glow mb-3">Try Again</button>
              <button onClick={() => navigate('/products')} className="btn btn-secondary w-full py-3">View Inventory</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
