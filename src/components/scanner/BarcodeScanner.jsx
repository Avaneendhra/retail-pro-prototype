import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/apiClient';

// Icons
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const ScanLineIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  </svg>
);
const CartPlusIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0zM12 9v3m0 0v3m0-3h3m-3 0H9" />
  </svg>
);
const SearchIcon = () => (
  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
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

  const scannerRef = useRef(null);
  const html5QrcodeRef = useRef(null);

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
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

      await html5Qrcode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.0,
        },
        async (decodedText) => {
          // On successful scan
          await html5Qrcode.stop();
          html5QrcodeRef.current = null;
          setScanning(false);
          handleBarcodeResult(decodedText);
        },
        () => { /* ignore scan failures */ }
      );
      setScanning(true);
    } catch (err) {
      console.error("Camera error:", err);
      setCameraError(
        typeof err === 'string' ? err :
        'Camera access denied. Please allow camera permission or use manual entry below.'
      );
    }
  };

  const stopScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        await html5QrcodeRef.current.stop();
      } catch (e) { /* already stopped */ }
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
    if (manualCode.trim()) {
      handleBarcodeResult(manualCode.trim());
    }
  };

  const handleAddToCart = () => {
    if (scannedProduct && quantity > 0) {
      addToCart(scannedProduct, quantity);
      showToast(`Added ${quantity}x ${scannedProduct.name} to cart`, 'success');
      // Reset for next scan
      setScannedProduct(null);
      setScannedCode('');
      setQuantity(1);
    }
  };

  const handleScanAgain = () => {
    setScannedProduct(null);
    setNotFound(false);
    setScannedCode('');
    setQuantity(1);
    startScanner();
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-lg mx-auto px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl text-white shadow-lg">
              <ScanLineIcon />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Scan Product</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Scan barcode to add to cart</p>
            </div>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* Scanner Area */}
      <div className="w-full max-w-lg mx-auto px-4">
        {!scannedProduct && !notFound && (
          <div className="card overflow-hidden">
            {/* Camera viewport */}
            <div className="relative bg-black rounded-t-2xl overflow-hidden" style={{ minHeight: '280px' }}>
              <div id="barcode-reader" ref={scannerRef} className="w-full" />

              {!scanning && !cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-900/80">
                  <div className="p-4 rounded-full bg-blue-500/20 border-2 border-blue-500/40">
                    <ScanLineIcon />
                  </div>
                  <button
                    onClick={startScanner}
                    className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-8 py-3 rounded-xl font-semibold text-lg shadow-xl hover:shadow-2xl transition-all active:scale-95"
                  >
                    Start Camera
                  </button>
                </div>
              )}

              {cameraError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900/90 p-6 text-center">
                  <div className="p-3 rounded-full bg-red-500/20">
                    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-red-300 text-sm">{cameraError}</p>
                  <button
                    onClick={startScanner}
                    className="text-blue-400 text-sm underline mt-1"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {scanning && (
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <span className="bg-black/60 text-green-400 text-xs px-4 py-1.5 rounded-full font-medium animate-pulse">
                    📷 Scanning...  Point at a barcode
                  </span>
                </div>
              )}
            </div>

            {/* Manual barcode entry */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mb-3">
                Or enter barcode manually
              </p>
              <form onSubmit={handleManualSearch} className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="e.g. 8901234567890"
                  className="flex-grow p-3 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700
                             rounded-xl text-gray-900 dark:text-gray-200 placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
                <button
                  type="submit"
                  className="bg-gradient-to-r from-blue-600 to-cyan-500 text-white px-5 py-3 rounded-xl font-semibold
                             flex items-center shadow-lg hover:shadow-xl transition-all active:scale-95"
                >
                  <SearchIcon />
                  Find
                </button>
              </form>

              {/* Quick demo barcodes */}
              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                <span className="text-xs text-gray-400 dark:text-gray-500">Try:</span>
                {['8901234567890', '8901234567891', '8901234567892'].map(code => (
                  <button
                    key={code}
                    onClick={() => { setManualCode(code); handleBarcodeResult(code); }}
                    className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300
                               px-2.5 py-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/30
                               hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>

            {scanning && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={stopScanner}
                  className="w-full py-2.5 text-red-500 font-semibold text-sm rounded-xl
                             hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  Stop Camera
                </button>
              </div>
            )}
          </div>
        )}

        {/* Product Found */}
        {scannedProduct && (
          <div className="card overflow-hidden animate-in">
            <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-4 text-white text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-bold text-lg">Product Found!</span>
              </div>
              <span className="text-green-100 text-sm font-mono">Barcode: {scannedCode}</span>
            </div>

            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{scannedProduct.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{scannedProduct.category}</p>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Price</p>
                  <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">
                    ₹{scannedProduct.price?.toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Stock</p>
                  <p className={`text-lg font-bold ${scannedProduct.quantity < scannedProduct.reorderLevel ? 'text-red-500' : 'text-green-500'}`}>
                    {scannedProduct.quantity}
                  </p>
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Barcode</p>
                  <p className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300 truncate">{scannedProduct.barcode}</p>
                </div>
              </div>

              {/* Quantity Selector */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Qty:</label>
                <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                               text-gray-700 dark:text-gray-300 font-bold text-lg transition-colors"
                  >−</button>
                  <span className="px-5 py-2 text-center font-bold text-gray-900 dark:text-white min-w-[3rem]">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(scannedProduct.quantity, quantity + 1))}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                               text-gray-700 dark:text-gray-300 font-bold text-lg transition-colors"
                  >+</button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleAddToCart}
                  className="flex-grow bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-3 rounded-xl
                             font-semibold flex items-center justify-center shadow-lg
                             hover:shadow-xl transition-all active:scale-[0.98]"
                >
                  <CartPlusIcon />
                  Add to Cart — ₹{(scannedProduct.price * quantity).toLocaleString()}
                </button>
              </div>

              <button
                onClick={handleScanAgain}
                className="w-full mt-3 py-2.5 text-blue-500 dark:text-blue-400 font-semibold text-sm
                           rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                Scan Another Product
              </button>
            </div>
          </div>
        )}

        {/* Not Found */}
        {notFound && (
          <div className="card overflow-hidden animate-in">
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-4 text-white text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="font-bold text-lg">Product Not Found</span>
              </div>
              <span className="text-red-100 text-sm font-mono">Barcode: {scannedCode}</span>
            </div>

            <div className="p-6 text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                No product matches this barcode in our inventory.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleScanAgain}
                  className="flex-grow bg-gradient-to-r from-blue-600 to-cyan-500 text-white py-3 rounded-xl
                             font-semibold shadow-lg hover:shadow-xl transition-all active:scale-[0.98]"
                >
                  Scan Again
                </button>
                <button
                  onClick={() => navigate('/products')}
                  className="flex-grow button-secondary py-3 rounded-xl"
                >
                  Browse Products
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
