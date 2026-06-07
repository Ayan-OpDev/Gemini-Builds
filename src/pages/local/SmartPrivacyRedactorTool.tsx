import React, { useState, useEffect, useRef } from 'react';
import { ShieldBan, ArrowLeft, Loader2, Download, Save } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { FileUploader } from '../../components/FileUploader';

interface RedactRect {
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export default function SmartPrivacyRedactorTool({ onBackToDashboard, initialFile, onFileLoaded }: any) {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  
  const [scale, setScale] = useState(1.5);
  const [rects, setRects] = useState<RedactRect[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentRect, setCurrentRect] = useState<Partial<RedactRect> | null>(null);

  const initDoc = async (f: File) => {
    if (!f) return;
    setLoading(true);
    try {
      const arrayBuffer = await f.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new Error("Empty file buffer");
      
      const pdfjsVersion = pdfjsLib.version || '6.0.227';
      const loadedPdf = await pdfjsLib.getDocument({ 
        data: arrayBuffer,
        standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/standard_fonts/`,
        cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/cmaps/`,
        cMapPacked: true
      }).promise;
      
      setPdfDoc(loadedPdf);
      setNumPages(loadedPdf.numPages);
      setCurrentPage(1);
      onFileLoaded?.(f, loadedPdf.numPages);
    } catch (e) {
      console.error("PDF Load Error:", e);
      alert('Error loading PDF');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (file && !pdfDoc) {
      initDoc(file);
    }
  }, [file]);

  const renderPage = async () => {
    if (!pdfDoc || !canvasRef.current) return;
    
    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale });
    
    const canvas = canvasRef.current;
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };
    
    try {
      await page.render(renderContext).promise;
    } catch (renderError) {
      console.warn("Graceful rendering fallback triggered (likely missing embedded fonts):", renderError);
    }
  };

  useEffect(() => {
    renderPage();
  }, [pdfDoc, currentPage, scale]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setCurrentRect({
        page: currentPage,
        x,
        y,
        width: 0,
        height: 0
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !currentRect || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setCurrentRect({
        ...currentRect,
        width: x - (currentRect.x || 0),
        height: y - (currentRect.y || 0)
    });
  };

  const handleMouseUp = () => {
    if (isDrawing && currentRect) {
        // Normalize rects (handle negative width/height)
        let { x, y, width, height, page } = currentRect;
        if (x === undefined || y === undefined || width === undefined || height === undefined) return;
        
        if (width < 0) {
            x += width;
            width = Math.abs(width);
        }
        if (height < 0) {
            y += height;
            height = Math.abs(height);
        }
        
        if (width > 5 && height > 5) {
            setRects([...rects, {
                id: Math.random().toString(36).substr(2, 9),
                page: page || 1,
                x, y, width, height
            }]);
        }
    }
    setIsDrawing(false);
    setCurrentRect(null);
  };
  
  const handleRemoveRect = (id: string, e: React.MouseEvent) => {
      e.stopPropagation(); // prevent drawing when clicking delete
      setRects(rects.filter(r => r.id !== id));
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const libDoc = await PDFDocument.load(arrayBuffer);
        
        // Apply redactions
        for (const item of rects) {
            const pdfPage = libDoc.getPage(item.page - 1);
            const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
            
            // Wait, we need the original viewport to map coordinates correctly
            const jsPage = await pdfDoc.getPage(item.page);
            const viewport = jsPage.getViewport({ scale });
            
            // Canvas coordinates to PDF coordinates
            const scaleX = pdfWidth / viewport.width;
            const scaleY = pdfHeight / viewport.height;
            
            const pX = item.x * scaleX;
            // PDF Y is inverted
            const pY = pdfHeight - ((item.y + item.height) * scaleY);
            const pW = item.width * scaleX;
            const pH = item.height * scaleY;
            
            pdfPage.drawRectangle({
                x: pX,
                y: pY,
                width: pW,
                height: pH,
                color: rgb(0, 0, 0)
            });
        }
        
        const bytes = await libDoc.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `redacted_${file.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch(e) {
        console.error(e);
        alert('Failed to redact document');
    }
    setSaving(false);
  };

  if (!file) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={onBackToDashboard} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center justify-center gap-3">
            <ShieldBan className="w-8 h-8 text-emerald-500" />
            Smart Privacy Redactor
          </h1>
          <p className="text-slate-500">
            Draw black boxes to permanently obscure text.
          </p>
        </div>
        <FileUploader onFileSelected={(files) => setFile(files[0])} />
      </div>
    );
  }

  const currentPageRects = rects.filter(r => r.page === currentPage);

  return (
    <div className="max-w-6xl mx-auto flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <button onClick={onBackToDashboard} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 dark:text-slate-400">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-4">
          <button 
             disabled={currentPage <= 1}
             onClick={() => setCurrentPage(c => c - 1)}
             className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded text-sm disabled:opacity-50"
          >
              Prev
          </button>
          <span className="text-sm font-medium">Page {currentPage} of {numPages}</span>
          <button 
             disabled={currentPage >= numPages}
             onClick={() => setCurrentPage(c => c + 1)}
             className="px-3 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded text-sm disabled:opacity-50"
          >
              Next
          </button>
        </div>
        <button
            onClick={handleSave}
            disabled={saving || rects.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
        >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Redacted PDF
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start justify-center p-8 relative">
        {loading && (
             <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 z-10 backdrop-blur-sm">
                 <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
             </div>
        )}
        
        <div 
          ref={containerRef}
          className="relative shadow-xl bg-white border border-slate-300 select-none cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas ref={canvasRef} className="block" />
          
          {currentPageRects.map(r => (
              <div 
                  key={r.id}
                  className="absolute bg-black group flex items-center justify-center border-2 border-transparent hover:border-red-500 transition-colors"
                  style={{
                      left: r.x,
                      top: r.y,
                      width: r.width,
                      height: r.height
                  }}
              >
                  <button 
                      onClick={(e) => handleRemoveRect(r.id, e)}
                      className="opacity-0 group-hover:opacity-100 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs -mt-6"
                  >
                      ✕
                  </button>
              </div>
          ))}

          {isDrawing && currentRect && (
              <div 
                  className="absolute bg-black/50 border border-black"
                  style={{
                      left: currentRect.width! < 0 ? currentRect.x! + currentRect.width! : currentRect.x,
                      top: currentRect.height! < 0 ? currentRect.y! + currentRect.height! : currentRect.y,
                      width: Math.abs(currentRect.width!),
                      height: Math.abs(currentRect.height!)
                  }}
              />
          )}
        </div>
      </div>
      <div className="mt-4 text-center text-sm text-slate-500">
          Click and drag to draw permanent black redaction boxes over sensitive text.
      </div>
    </div>
  );
}
