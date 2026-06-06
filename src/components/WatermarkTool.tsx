import React, { useState, useEffect, useCallback } from 'react';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { FileUploader } from './FileUploader';
import ProcessingOverlay from './ProcessingOverlay';
import {
  ChevronLeft,
  Stamp,
  Download,
  Loader2,
  FileText,
  FileLock,
  Compass,
  Settings,
  X,
  Plus,
  Type,
  ImageIcon
} from 'lucide-react';

interface WatermarkToolProps {
  onBackToDashboard: () => void;
  initialFile?: File | null;
  onFileLoaded?: (file: File, pageCount?: number) => void;
}

export default function WatermarkTool({ 
  onBackToDashboard,
  initialFile = null,
  onFileLoaded
}: WatermarkToolProps) {
  const [file, setFile] = useState<File | null>(initialFile);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);

  // Watermark parameters state
  const [stampType, setStampType] = useState<'text' | 'image'>('text');
  const [stampText, setStampText] = useState<string>('CONFIDENTIAL');
  const [textColor, setTextColor] = useState<string>('#ef4444'); // Tailwind red-500
  const [fontSize, setFontSize] = useState<number>(48);
  const [rotation, setRotation] = useState<number>(-45); // Degrees
  const [opacity, setOpacity] = useState<number>(0.25); // 0.1 to 0.9
  const [pageRange, setPageRange] = useState<'all' | 'first'>('all');

  // Multi-image upload for image-watermark
  const [stampImageFile, setStampImageFile] = useState<File | null>(null);
  const [stampImageUrl, setStampImageUrl] = useState<string | null>(null);
  const [stampImageScale, setStampImageScale] = useState<number>(1.0);

  // States
  const [processing, setProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  // Clean memory leaks
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (stampImageUrl) URL.revokeObjectURL(stampImageUrl);
    };
  }, [fileUrl, stampImageUrl]);

  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setLoadingFile(true);
    setPageCount(0);

    try {
      const url = URL.createObjectURL(selectedFile);
      setFileUrl(url);
      setFile(selectedFile);

      const loadingTask = pdfjsLib.getDocument({ url });
      const doc = await loadingTask.promise;
      setPageCount(doc.numPages);
      onFileLoaded?.(selectedFile, doc.numPages);
    } catch (err) {
      console.error(err);
      alert('Failed to analyze document. Select a raw healthy PDF document.');
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

  const handleImageWatermarkSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const selected = files[0];
      setStampImageFile(selected);
      if (stampImageUrl) URL.revokeObjectURL(stampImageUrl);
      setStampImageUrl(URL.createObjectURL(selected));
    }
  };

  // Convert Hex string color to pdf-lib rgb fractional scale (0-1)
  const hexToRgb = (hex: string) => {
    // defaults
    let r = 239, g = 68, b = 68;
    const match = hex.replace('#', '').match(/.{1,2}/g);
    if (match && match.length === 3) {
      r = parseInt(match[0], 16);
      g = parseInt(match[1], 16);
      b = parseInt(match[2], 16);
    }
    return rgb(r / 255, g / 255, b / 255);
  };

  // Burn watermark using pdf-lib
  const compileWatermarkedPDF = async () => {
    if (!file) return;
    if (stampType === 'image' && !stampImageFile) {
      alert('Please upload a watermark image first!');
      return;
    }

    setProcessing(true);
    setProgressText('Opening document arrays...');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();

      // Determine page indexes scope selection
      const indexesToStamp: number[] = [];
      if (pageRange === 'all') {
        for (let i = 0; i < pages.length; i++) indexesToStamp.push(i);
      } else {
        indexesToStamp.push(0);
      }

      if (stampType === 'text') {
        setProgressText('Baking watermark fonts...');
        const customFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontColorRgb = hexToRgb(textColor);

        for (let i = 0; i < indexesToStamp.length; i++) {
          const pageIdx = indexesToStamp[i];
          setProgressText(`Stamping page ${pageIdx + 1} of ${pages.length}...`);
          const page = pages[pageIdx];
          const { width, height } = page.getSize();

          // Centered layout coordinates math
          // Get boundaries of our text
          const textW = customFont.widthOfTextAtSize(stampText, fontSize);
          
          // Draw watermark
          page.drawText(stampText, {
            x: (width - textW) / 2,
            y: (height - fontSize) / 2,
            size: fontSize,
            font: customFont,
            color: fontColorRgb,
            opacity: opacity,
            rotate: degrees(rotation)
          });
        }
      } else if (stampType === 'image' && stampImageFile) {
        setProgressText('Compiling watermark visual asset...');
        const imageBytes = await stampImageFile.arrayBuffer();
        
        let embeddedImg;
        if (stampImageFile.type === 'image/png') {
          embeddedImg = await pdfDoc.embedPng(imageBytes);
        } else {
          // Standard Jpg/Jpeg embedding
          embeddedImg = await pdfDoc.embedJpg(imageBytes);
        }

        for (let i = 0; i < indexesToStamp.length; i++) {
          const pageIdx = indexesToStamp[i];
          setProgressText(`Stamping page ${pageIdx + 1} of ${pages.length}...`);
          const page = pages[pageIdx];
          const { width, height } = page.getSize();

          // Width scale calculations
          const finalW = (width * 0.45) * stampImageScale; // default spans roughly 45% of width
          const finalH = (finalW / embeddedImg.width) * embeddedImg.height;

          page.drawImage(embeddedImg, {
            x: (width - finalW) / 2,
            y: (height - finalH) / 2,
            width: finalW,
            height: finalH,
            opacity: opacity,
            rotate: degrees(rotation)
          });
        }
      }

      setProgressText('Recompiling document layouts...');
      const editedBytes = await pdfDoc.save();
      const resultBlob = new Blob([editedBytes], { type: 'application/pdf' });
      const dlUrl = URL.createObjectURL(resultBlob);

      // Trigger standard save
      const link = document.createElement('a');
      link.href = dlUrl;
      const dotIndex = file.name.lastIndexOf('.');
      const baseName = dotIndex !== -1 ? file.name.substring(0, dotIndex) : file.name;
      link.download = `${baseName}_watermarked.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(dlUrl), 100);
    } catch (err) {
      console.error(err);
      alert('Failed to stamp watermark. Choose standard documents non-protected.');
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  return (
    <div id="watermark-view" className="space-y-6 max-w-5xl mx-auto py-2">
      <ProcessingOverlay isOpen={processing} progressText={progressText} />
      {/* Title block stripe */}
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
            Translucent Watermarking
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Secure, identify, or brand your document with custom text overlays or transparent logo watermarks.
          </p>
        </div>

        {file && (
          <button
            onClick={compileWatermarkedPDF}
            disabled={processing}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1.5 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          >
            {processing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Stamping PDF...
              </>
            ) : (
              <>
                <Stamp className="w-3.5 h-3.5" />
                Stamp PDF & Download
              </>
            )}
          </button>
        )}
      </div>

      {!file ? (
        /* Standard uploader integration box */
        <div className="max-w-xl mx-auto py-10">
          {loadingFile ? (
            <div className="flex flex-col items-center justify-center p-14 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                Scanning document pages...
              </p>
            </div>
          ) : (
            <FileUploader 
            onFileSelected={(files) => handleFileSelected(files[0])} 
            acceptType="pdf"
          />
          )}
        </div>
      ) : (
        /* Workspace splits */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* File details overview panel */}
          <div className="lg:col-span-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 border-b pb-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              Target Document Overview
            </h3>

            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 rounded-xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-xl">
                  <FileLock className="w-6 h-6" />
                </div>
                <div className="space-y-0.5 truncate-wrap">
                  <h4 className="text-sm font-bold text-slate-850 dark:text-slate-100 truncate pr-6" title={file.name}>
                    {file.name}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono font-bold">
                    {pageCount} Page(s) • {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>

              {/* Watermark Preview Sandbox box */}
              <div className="relative p-6 border rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-150 dark:border-slate-850/80 aspect-[4/3] flex flex-col items-center justify-center text-center overflow-hidden select-none">
                
                <div className="space-y-1.5 opacity-30 text-slate-400">
                  <FileText className="w-12 h-12 mx-auto stroke-1" />
                  <span className="text-xs font-mono font-bold">PDF Sheet Backdrop</span>
                </div>

                {/* Animated Simulated watermark overlay */}
                <div
                  id="watermark-sim-overlay"
                  style={{
                    color: textColor,
                    transform: `rotate(${rotation}deg)`,
                    opacity: opacity,
                    fontFamily: 'Helvetica, Arial, sans-serif'
                  }}
                  className="absolute inset-0 flex items-center justify-center font-black pointer-events-none text-center select-none truncate p-4"
                >
                  {stampType === 'text' ? (
                    <span style={{ fontSize: `${fontSize * 0.7}px` }} className="truncate">
                      {stampText || 'CONFIDENTIAL'}
                    </span>
                  ) : stampImageUrl ? (
                    <img
                      src={stampImageUrl}
                      style={{ transform: `scale(${stampImageScale * 0.7})` }}
                      className="max-h-[60%] max-w-[60%] object-contain"
                      alt="Watermark Simulation"
                    />
                  ) : (
                    <span className="text-slate-400 text-xs font-bold">[No Image Uploaded]</span>
                  )}
                </div>

                <div className="absolute bottom-2.5 right-2.5 bg-slate-200 dark:bg-slate-850 text-slate-600 dark:text-slate-400 text-[9px] font-mono px-2 py-0.5 rounded border border-slate-150/50">
                  Watermark Position Map
                </div>
              </div>

              <div className="text-center">
                <button
                  onClick={() => {
                    setFile(null);
                    setPageCount(0);
                    if (fileUrl) URL.revokeObjectURL(fileUrl);
                    setFileUrl(null);
                  }}
                  className="text-xs text-red-500 font-bold hover:underline"
                >
                  Change Document file
                </button>
              </div>
            </div>
          </div>

          {/* Stamping tools option panels */}
          <div className="lg:col-span-6 space-y-6">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-5 space-y-6">
              
              <h3 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-500" />
                Watermark Settings
              </h3>

              {/* Text vs Image Stamp type selection */}
              <div id="watermark-type-select" className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                  Watermark Content Type
                </span>
                <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-950 p-1 rounded-lg">
                  <button
                    onClick={() => setStampType('text')}
                    className={`py-1.5 flex items-center justify-center gap-1 text-xs font-bold rounded-md transition-all focus:outline-none ${
                      stampType === 'text'
                        ? 'bg-white dark:bg-slate-850 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />
                    Text Overlay
                  </button>
                  <button
                    onClick={() => setStampType('image')}
                    className={`py-1.5 flex items-center justify-center gap-1 text-xs font-bold rounded-md transition-all focus:outline-none ${
                      stampType === 'image'
                        ? 'bg-white dark:bg-slate-850 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    Image Logo
                  </button>
                </div>
              </div>

              {/* Conditional Inputs */}
              {stampType === 'text' ? (
                /* Text Watermarking Fields */
                <div className="space-y-4 animate-fadeIn">
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                      Stamp Text Input
                    </span>
                    <input
                      type="text"
                      maxLength={30}
                      value={stampText}
                      onChange={(e) => setStampText(e.target.value)}
                      placeholder="CONFIDENTIAL"
                      className="w-full text-xs font-sans font-extrabold px-3 py-2 border rounded-lg border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 uppercase tracking-wider focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                        Font Size
                      </span>
                      <select
                        value={fontSize}
                        onChange={(e) => setFontSize(parseInt(e.target.value))}
                        className="w-full text-xs px-3 py-2 border rounded-lg border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-bold focus:outline-none"
                      >
                        <option value={24}>Small (24pt)</option>
                        <option value={36}>Normal (36pt)</option>
                        <option value={48}>Large (48pt)</option>
                        <option value={72}>Huge (72pt)</option>
                        <option value={96}>Draft (96pt)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                        Text Color Choice
                      </span>
                      <div className="flex gap-2">
                        {[
                          { color: '#ef4444', label: 'Red' },
                          { color: '#64748b', label: 'Slate' },
                          { color: '#3b82f6', label: 'Blue' },
                          { color: '#10b981', label: 'Green' }
                        ].map((item) => (
                          <button
                            key={item.color}
                            type="button"
                            onClick={() => setTextColor(item.color)}
                            className={`w-7 h-7 rounded-full border border-white/20 transition-all focus:outline-none flex items-center justify-center ${
                              textColor === item.color ? 'ring-2 ring-emerald-500 ring-offset-1' : ''
                            }`}
                            style={{ backgroundColor: item.color }}
                            title={item.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Image Logo Watermarking Files selection */
                <div className="space-y-4 animate-fadeIn">
                  <div className="space-y-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                      Choose Watermark Logo (PNG or JPG)
                    </span>
                    <input
                      type="file"
                      accept="image/png, image/jpeg"
                      onChange={handleImageWatermarkSelected}
                      className="hidden"
                      id="image-watermark-input"
                    />
                    
                    {stampImageFile ? (
                      <div className="flex items-center justify-between p-3 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-slate-50 dark:bg-slate-950 font-medium">
                        <span className="truncate max-w-[200px] text-slate-800 dark:text-slate-200 font-bold">
                          {stampImageFile.name}
                        </span>
                        <button
                          onClick={() => {
                            setStampImageFile(null);
                            if (stampImageUrl) URL.revokeObjectURL(stampImageUrl);
                            setStampImageUrl(null);
                          }}
                          className="text-red-500 hover:text-red-600 focus:outline-none"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label
                        htmlFor="image-watermark-input"
                        className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-lg cursor-pointer hover:border-emerald-500/60 text-slate-400 hover:bg-emerald-50/5"
                      >
                        <Plus className="w-5 h-5 text-slate-500 mb-1" />
                        <span className="text-xs font-bold text-slate-755 dark:text-slate-300">
                          Select Watermark Image
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">PNG transparency is highly recommended</span>
                      </label>
                    )}
                  </div>

                  {stampImageFile && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-400">
                        <span>Watermark Image Scale</span>
                        <span className="font-mono">{stampImageScale.toFixed(1)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.4"
                        max="2.0"
                        step="0.1"
                        value={stampImageScale}
                        onChange={(e) => setStampImageScale(parseFloat(e.target.value))}
                        className="w-full accent-emerald-500 cursor-ew-resize h-1 bg-slate-100 dark:bg-slate-850 rounded"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Visual custom coordinates and opacity */}
              <div id="visual-transforms" className="space-y-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block border-t pt-4">
                  Visual Layout & Opacities
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Rotation Angle slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-650 dark:text-slate-350">
                      <span>Rotation Angle</span>
                      <span className="font-mono">{rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-90"
                      max="90"
                      step="5"
                      value={rotation}
                      onChange={(e) => setRotation(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-ew-resize h-1 bg-slate-100 dark:bg-slate-850 rounded"
                    />
                  </div>

                  {/* Opacity slider */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold text-slate-650 dark:text-slate-350">
                      <span>Opacity Level</span>
                      <span className="font-mono">{Math.round(opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.05"
                      value={opacity}
                      onChange={(e) => setOpacity(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-ew-resize h-1 bg-slate-100 dark:bg-slate-850 rounded"
                    />
                  </div>
                </div>
              </div>

              {/* Watermarking range scope toggle */}
              <div id="target-pages-select" className="space-y-2 border-t pt-4">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">
                  Target Stamp Scope
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPageRange('all')}
                    className={`py-2 px-3 border rounded-lg text-xs font-bold tracking-wider text-center focus:outline-none ${
                      pageRange === 'all'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Stamp All Pages ({pageCount} sheets)
                  </button>
                  <button
                    onClick={() => setPageRange('first')}
                    className={`py-2 px-3 border rounded-lg text-xs font-bold tracking-wider text-center focus:outline-none ${
                      pageRange === 'first'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    First Page Only
                  </button>
                </div>
              </div>

              {/* Processing bar */}
              {processing && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl space-y-2 text-center animate-pulse border border-emerald-100 dark:border-emerald-900/40">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-400">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                    <span>Active Watermarking</span>
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono leading-normal">
                    {progressText}
                  </p>
                </div>
              )}

              {/* Execution CTA */}
              <button
                onClick={compileWatermarkedPDF}
                disabled={processing}
                className="w-full flex items-center justify-center gap-1.5 py-3 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-extrabold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? (
                  'Stamping and compressing layers...'
                ) : (
                  <>
                    <Stamp className="w-4 h-4 text-emerald-400" />
                    Apply Watermark Stamp & Export
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
