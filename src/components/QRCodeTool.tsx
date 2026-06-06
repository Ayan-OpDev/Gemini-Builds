import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import FileUploadArea from './FileUploadArea';
import ProcessingOverlay from './ProcessingOverlay';
import {
  ChevronLeft,
  QrCode,
  Download,
  Loader2,
  Trash2,
  CheckCircle,
  Eye,
  Sliders,
  Settings,
  Link,
  SlidersHorizontal,
  Info,
  CalendarDays,
  Sparkles
} from 'lucide-react';

interface QRCodeToolProps {
  onBackToDashboard: () => void;
  initialFile?: File | null;
  onFileLoaded?: (file: File, pageCount?: number) => void;
}

interface PlacedQR {
  pageIndex: number;
  x: number; // Percent 0-100
  y: number; // Percent 0-100
  scale: number; // Size multipliers
}

export default function QRCodeTool({ 
  onBackToDashboard,
  initialFile = null,
  onFileLoaded
}: QRCodeToolProps) {
  // Parsing pdf states
  const [file, setFile] = useState<File | null>(initialFile);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);

  // QR settings
  const [qrText, setQrText] = useState<string>('https://google.com');
  const [qrDarkColor, setQrDarkColor] = useState<string>('#000000');
  const [qrLightColor, setQrLightColor] = useState<string>('#ffffff');
  
  // Placement metadata
  const [qrAssetUrl, setQrAssetUrl] = useState<string | null>(null);
  const [qrAssetBuffer, setQrAssetBuffer] = useState<ArrayBuffer | null>(null);
  const [placedQR, setPlacedQR] = useState<PlacedQR | null>(null);

  // Loaders
  const [renderingPage, setRenderingPage] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  // Viewport refs
  const renderCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Unload cleanup
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (qrAssetUrl) URL.revokeObjectURL(qrAssetUrl);
    };
  }, [fileUrl, qrAssetUrl]);

  // Read upload PDF
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setLoadingFile(true);
    setPdfDoc(null);
    setPageCount(0);
    setActivePageIndex(0);
    setPlacedQR(null);

    try {
      const url = URL.createObjectURL(selectedFile);
      setFileUrl(url);
      setFile(selectedFile);

      const loadingTask = pdfjsLib.getDocument({ url });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);
      setPageCount(doc.numPages);
      onFileLoaded?.(selectedFile, doc.numPages);
    } catch (err) {
      console.error(err);
      alert('Failed to parse file. Ensure it is a secure valid PDF document.');
      setFile(null);
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      setFileUrl(null);
    } finally {
      setLoadingFile(false);
    }
  }, [fileUrl, onFileLoaded]);

  // Handle initialization of file if provided via state
  useEffect(() => {
    if (initialFile) {
      handleFileSelected(initialFile);
    }
  }, [initialFile, handleFileSelected]);

  // Render responsive page canvas
  const renderPDFPage = useCallback(async () => {
    if (!pdfDoc || !renderCanvasRef.current) return;
    setRenderingPage(true);

    try {
      const page = await pdfDoc.getPage(activePageIndex + 1);
      const canvas = renderCanvasRef.current;
      const container = canvas.parentElement;
      if (!container) return;

      const viewport = page.getViewport({ scale: 1.0 });
      const containerWidth = Math.min(container.clientWidth || 450, 480);
      const scale = containerWidth / viewport.width;
      const responsiveViewport = page.getViewport({ scale });

      canvas.width = responsiveViewport.width;
      canvas.height = responsiveViewport.height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({
          canvasContext: ctx,
          viewport: responsiveViewport
        }).promise;
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRenderingPage(false);
    }
  }, [pdfDoc, activePageIndex]);

  // Re-draw page on view index change
  useEffect(() => {
    if (pdfDoc) {
      renderPDFPage();
    }
  }, [pdfDoc, activePageIndex, renderPDFPage]);

  // Generate QR Code as a local PNG item asset inside sandbox
  const handleGenerateQRAsset = async () => {
    if (qrText.trim().length === 0) {
      alert('QR content cannot be empty!');
      return;
    }

    try {
      // Draw onto offscreen canvas using qrcode encoder
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, qrText, {
        margin: 1,
        width: 300,
        color: {
          dark: qrDarkColor,
          light: qrLightColor
        }
      });

      canvas.toBlob(async (blob) => {
        if (!blob) return;

        const buffer = await blob.arrayBuffer();
        setQrAssetBuffer(buffer);

        if (qrAssetUrl) URL.revokeObjectURL(qrAssetUrl);
        setQrAssetUrl(URL.createObjectURL(blob));

        // Placed in standard coordinates indices initially
        setPlacedQR({
          pageIndex: activePageIndex,
          x: 40,
          y: 40,
          scale: 1.0
        });
      }, 'image/png');
    } catch (err) {
      console.error(err);
      alert('Fail to render QR Code. Use standard web-safe text inputs.');
    }
  };

  // Re-generate QR when preferences change to synchronize live changes
  useEffect(() => {
    if (qrAssetUrl) {
      handleGenerateQRAsset();
    }
  }, [qrDarkColor, qrLightColor]);

  // Click handler to re-place the QR Code on display map
  const handleCanvasOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!qrAssetUrl || !placedQR) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const percentX = (clickX / rect.width) * 100;
    const percentY = (clickY / rect.height) * 100;

    setPlacedQR((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        pageIndex: activePageIndex,
        x: Math.max(0, Math.min(percentX - (12 * prev.scale), 100)),
        y: Math.max(0, Math.min(percentY - (12 * prev.scale), 100))
      };
    });
  };

  const adjustScale = (newScale: number) => {
    setPlacedQR((prev) => (prev ? { ...prev, scale: newScale } : null));
  };

  const adjustX = (newX: number) => {
    setPlacedQR((prev) => (prev ? { ...prev, x: newX } : null));
  };

  const adjustY = (newY: number) => {
    setPlacedQR((prev) => (prev ? { ...prev, y: newY } : null));
  };

  // Burn placed vectors onto PDF coordinates using pdf-lib
  const burnAndCompilePDF = async () => {
    if (!file || !qrAssetBuffer || !placedQR) return;
    setProcessing(true);
    setProgressText('Opening document structure...');

    try {
      const fileBytes = await file.arrayBuffer();
      const pdfDocLib = await PDFDocument.load(fileBytes);
      const pages = pdfDocLib.getPages();

      const targetPage = pages[placedQR.pageIndex];
      const pageW = targetPage.getWidth();
      const pageH = targetPage.getHeight();

      setProgressText('Embedding QR code raster...');
      const qrImage = await pdfDocLib.embedPng(qrAssetBuffer);

      // Width calculation map: standard display is 90 points wide inside scaled views.
      const targetW = 92 * placedQR.scale;
      const targetH = targetW; // QR Codes are 1:1 square ratio

      // Mapping coordinate flips starting y from bottom left of page
      const pdfX = (placedQR.x / 100) * pageW;
      const pdfY = ((100 - (placedQR.y + (92 * placedQR.scale / 480 * 100))) / 100) * pageH;

      targetPage.drawImage(qrImage, {
        x: pdfX,
        y: pdfY,
        width: targetW,
        height: targetH
      });

      setProgressText('Assembling signed PDF layout...');
      const resultBytes = await pdfDocLib.save();
      const blob = new Blob([resultBytes], { type: 'application/pdf' });
      const dlUrl = URL.createObjectURL(blob);

      // Triggers download saver item
      const link = document.createElement('a');
      link.href = dlUrl;
      const dotIdx = file.name.lastIndexOf('.');
      const baseName = dotIdx !== -1 ? file.name.substring(0, dotIdx) : file.name;
      link.download = `${baseName}_qr.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(dlUrl), 100);
    } catch (err) {
      console.error(err);
      alert('Fail to write final file output. Verify integrity.');
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  return (
    <div id="qr-code-tool-view" className="space-y-6 max-w-5xl mx-auto py-2">
      <ProcessingOverlay isOpen={processing} progressText={progressText} />
      {/* Title Strip Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1.5">
          <button
            onClick={onBackToDashboard}
            className="group inline-flex items-center text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ChevronLeft className="w-4 h-4 mr-1 group-hover:-translate-x-0.5 transition-transform" />
            Back to Dashboard
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Embed QR Codes in PDF
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Generate customized, high-resolution QR codes to bridge your print outputs with digital web resources easily.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {file && qrAssetUrl && (
            <button
              onClick={burnAndCompilePDF}
              disabled={processing}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Apply QR & Export PDF
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {!file ? (
        /* PDF Upload */
        <div className="max-w-xl mx-auto py-10">
          {loadingFile ? (
            <div className="flex flex-col items-center justify-center p-14 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                Reading PDF pages dimensions...
              </p>
            </div>
          ) : (
            <FileUploadArea
              onFileSelected={handleFileSelected}
              title="Upload PDF to embed QR code"
              subtitle="Stamps QR codes dynamically into margins or grids on any sheet segment."
            />
          )}
        </div>
      ) : (
        /* Work Desk */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Page Preview view with layout click bindings */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                  Select Embed Position
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={activePageIndex === 0}
                  onClick={() => {
                    setActivePageIndex((prev) => Math.max(0, prev - 1));
                    setPlacedQR((prev) => prev ? { ...prev, pageIndex: Math.max(0, prev.pageIndex - 1) } : null);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 text-slate-700 text-xs font-bold rounded"
                >
                  Prev
                </button>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                  {activePageIndex + 1} / {pageCount}
                </span>
                <button
                  disabled={activePageIndex === pageCount - 1}
                  onClick={() => {
                    setActivePageIndex((prev) => Math.min(pageCount - 1, prev + 1));
                    setPlacedQR((prev) => prev ? { ...prev, pageIndex: Math.min(pageCount - 1, prev.pageIndex + 1) } : null);
                  }}
                  className="px-2.5 py-1 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 text-slate-700 text-xs font-bold rounded"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="relative mx-auto border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 rounded-xl flex items-center justify-center min-h-[350px] shadow-sm select-none">
              
              <div className="relative overflow-hidden">
                <canvas
                  ref={renderCanvasRef}
                  className="rounded shadow bg-white transition-opacity duration-300"
                  style={{ opacity: renderingPage ? 0.6 : 1 }}
                />

                {/* Mouse click mapping trigger panel overlay */}
                {qrAssetUrl && (
                  <div
                    onClick={handleCanvasOverlayClick}
                    className="absolute inset-0 z-10 cursor-crosshair"
                    title="Click anywhere to reposition QR code stamp"
                  >
                    {placedQR && placedQR.pageIndex === activePageIndex && (
                      <div
                        id="visible-qr-stamp"
                        style={{
                          left: `${placedQR.x}%`,
                          top: `${placedQR.y}%`,
                          width: `${90 * placedQR.scale}px`,
                          height: `${90 * placedQR.scale}px`
                        }}
                        className="absolute border border-dashed border-emerald-500 bg-white shadow-md p-0.5 rounded pointer-events-none"
                      >
                        <img
                          src={qrAssetUrl}
                          className="w-full h-full object-contain pointer-events-none"
                          alt="Placed QR"
                        />
                        <div className="absolute -top-5 left-0 bg-emerald-600 text-white text-[9px] px-1 font-bold rounded shadow uppercase">
                          QR code
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {renderingPage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/5 backdrop-blur-xs rounded">
                    <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 p-3 rounded-lg text-xs text-slate-500 leading-normal">
              <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p>
                {qrAssetUrl 
                  ? "Click on any grid coordinates of the canvas sheet preview to align, drag, or slide the QR Stamp to that precise layout box."
                  : "Type a URL, click Generate below, and stamp it anywhere on your page previews."}
              </p>
            </div>
          </div>

          {/* Configuration and settings */}
          <div className="lg:col-span-6 space-y-6">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-6">
              
              <h3 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-500" />
                QR Encoder Preferences
              </h3>

              {/* QR Data/URL inputs */}
              <div id="qr-text-input" className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                  QR Code Text Input / Link URL
                </span>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Link className="w-3.5 h-3.5" />
                  </div>
                  <input
                    type="text"
                    value={qrText}
                    onChange={(e) => setQrText(e.target.value)}
                    placeholder="https://mywebsite.com"
                    className="w-full text-xs font-medium pl-9 pr-3.5 py-2.5 border rounded-lg border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-850 dark:text-slate-100 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Style parameters (Foreground and Background selectors) */}
              <div className="grid grid-cols-2 gap-4">
                <div id="qr-dark-color" className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                    Foreground Color
                  </span>
                  <div className="flex gap-2">
                    {[
                      { code: '#000000', label: 'Black' },
                      { code: '#1e3a8a', label: 'Dark Blue' },
                      { code: '#14532d', label: 'Forest' },
                      { code: '#701a75', label: 'Plum' }
                    ].map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setQrDarkColor(c.code)}
                        className={`w-6 h-6 rounded border transition-all focus:outline-none ${
                          qrDarkColor === c.code ? 'scale-110 ring-2 ring-emerald-500' : 'opacity-85'
                        }`}
                        style={{ backgroundColor: c.code }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>

                <div id="qr-light-color" className="space-y-1.5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                    Background Color
                  </span>
                  <div className="flex gap-2">
                    {[
                      { code: '#ffffff', label: 'White' },
                      { code: '#fef08a', label: 'Pastel Yellow' },
                      { code: '#f1f5f9', label: 'Slate Back' }
                    ].map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setQrLightColor(c.code)}
                        className={`w-6 h-6 rounded border transition-all focus:outline-none ${
                          qrLightColor === c.code ? 'scale-110 ring-2 ring-emerald-500' : 'opacity-85'
                        }`}
                        style={{ backgroundColor: c.code }}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerateQRAsset}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold focus:outline-none shadow-sm transition-colors"
              >
                <QrCode className="w-4 h-4 text-emerald-250 animate-pulse" />
                Generate QR code stamp
              </button>
            </div>

            {/* Reposition Sliders when asset is active */}
            {placedQR && qrAssetUrl && (
              <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-5 animate-fadeIn">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-500" />
                  Reposition Stamp
                </h3>

                <div className="space-y-4">
                  {/* Aspect stamp scaling slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400 font-sans">
                      <span>Stamp Size (Scale)</span>
                      <span className="font-mono">{placedQR.scale.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.1"
                      value={placedQR.scale}
                      onChange={(e) => adjustScale(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-ew-resize h-1 bg-slate-100 dark:bg-slate-850 rounded"
                    />
                  </div>

                  {/* Positioning Coordinate sliders */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-500">
                        <span>Horiz. X</span>
                        <span className="font-mono">{Math.round(placedQR.x)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="90"
                        step="1"
                        value={placedQR.x}
                        onChange={(e) => adjustX(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 cursor-ew-resize h-1 bg-slate-100 dark:bg-slate-850 rounded"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-slate-500">
                        <span>Vert. Y</span>
                        <span className="font-mono">{Math.round(placedQR.y)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="90"
                        step="1"
                        value={placedQR.y}
                        onChange={(e) => adjustY(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 cursor-ew-resize h-1 bg-slate-100 dark:bg-slate-850 rounded"
                      />
                    </div>
                  </div>
                </div>

                {processing && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg text-center animate-pulse border border-emerald-100 dark:border-emerald-900/35">
                    <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto text-emerald-600 mb-1" />
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{progressText}</span>
                  </div>
                )}

                {/* Compilation burn down buttons */}
                <button
                  type="button"
                  onClick={burnAndCompilePDF}
                  disabled={processing}
                  className="w-full py-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow focus:ring-2 focus:ring-slate-500 cursor-pointer"
                >
                  {processing ? (
                    'Burning QR code and recompiling...'
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      Place QR on Page {placedQR.pageIndex + 1} & Download
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
