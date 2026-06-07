import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { FileUploader } from '../../components/FileUploader';
import {
  ChevronLeft,
  BookOpen,
  Eye,
  Loader2,
  ChevronRight,
  Sun,
  Moon,
  Coffee,
  Bookmark,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Columns
} from 'lucide-react';

interface BookReaderToolProps {
  onBackToDashboard: () => void;
  initialFile?: File | null;
  onFileLoaded?: (file: File, pageCount?: number) => void;
}

interface UserBookmark {
  pdfName: string;
  pageIndex: number;
  addedAt: string;
}

export default function BookReaderTool({ 
  onBackToDashboard,
  initialFile = null,
  onFileLoaded
}: BookReaderToolProps) {
  // Parsing states
  const [file, setFile] = useState<File | null>(initialFile);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  
  // Navigation: left page index (normally odd) and right page index (even)
  // For standard books, Page 1 is standard Cover (alone on right), then Page 2-3 are spreads side-by-side.
  const [currentCoverIndex, setCurrentCoverIndex] = useState<number>(0); // 0-based page index. 0 = cover page alone.
  const [viewMode, setViewMode] = useState<'double' | 'single'>('double');
  const [theme, setTheme] = useState<'sepia' | 'day' | 'night'>('sepia');
  
  // Bookmarks persistence
  const [bookmarks, setBookmarks] = useState<UserBookmark[]>([]);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);

  // Loaders
  const [loadingFile, setLoadingFile] = useState<boolean>(false);
  const [renderingPages, setRenderingPages] = useState<boolean>(false);

  // View canvases refs
  const leftCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const singleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Revoke URLs on unmount
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Read upload PDF
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setLoadingFile(true);
    setPdfDoc(null);
    setPageCount(0);
    setCurrentCoverIndex(0);

    // Sync saved bookmarks
    const saved = localStorage.getItem('pdf_reader_bookmarks');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UserBookmark[];
        setBookmarks(parsed.filter((b) => b.pdfName === selectedFile.name));
      } catch (e) {
        console.error(e);
      }
    }

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
      alert('Failed to process PDF. Try another non-secured PDF.');
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

  // Side-by-side pages viewport rendering logic
  const renderBookSpreads = useCallback(async () => {
    if (!pdfDoc) return;
    setRenderingPages(true);

    try {
      if (viewMode === 'double') {
        const isCover = currentCoverIndex === 0;

        // Render Cover alone on right, empty/wooden panel on left
        if (isCover) {
          // Clean left canvas
          const leftCanvas = leftCanvasRef.current;
          if (leftCanvas) {
            const ctx = leftCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, leftCanvas.width, leftCanvas.height);
          }

          // Render Page 1 (Cover) on Right Canvas
          const rightCanvas = rightCanvasRef.current;
          if (rightCanvas) {
            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });
            const desiredHeight = 460;
            const scale = desiredHeight / viewport.height;
            const responsiveViewport = page.getViewport({ scale });

            rightCanvas.height = responsiveViewport.height;
            rightCanvas.width = responsiveViewport.width;

            const ctx = rightCanvas.getContext('2d');
            if (ctx) {
              await page.render({
                canvasContext: ctx,
                viewport: responsiveViewport
              } as any).promise;
            }
          }
        } else {
          // Render Left Page (even index, e.g., currentCoverIndex)
          const leftCanvas = leftCanvasRef.current;
          if (leftCanvas && currentCoverIndex < pageCount) {
            const page = await pdfDoc.getPage(currentCoverIndex + 1);
            const viewport = page.getViewport({ scale: 1.0 });
            const desiredHeight = 460;
            const scale = desiredHeight / viewport.height;
            const responsiveViewport = page.getViewport({ scale });

            leftCanvas.height = responsiveViewport.height;
            leftCanvas.width = responsiveViewport.width;

            const ctx = leftCanvas.getContext('2d');
            if (ctx) {
              await page.render({
                canvasContext: ctx,
                viewport: responsiveViewport
              } as any).promise;
            }
          }

          // Render Right Page (odd index, e.g., currentCoverIndex + 1)
          const rightCanvas = rightCanvasRef.current;
          if (rightCanvas) {
            const nextIdx = currentCoverIndex + 1;
            if (nextIdx < pageCount) {
              const page = await pdfDoc.getPage(nextIdx + 1);
              const viewport = page.getViewport({ scale: 1.0 });
              const desiredHeight = 460;
              const scale = desiredHeight / viewport.height;
              const responsiveViewport = page.getViewport({ scale });

              rightCanvas.height = responsiveViewport.height;
              rightCanvas.width = responsiveViewport.width;

              const ctx = rightCanvas.getContext('2d');
              if (ctx) {
                await page.render({
                  canvasContext: ctx,
                  viewport: responsiveViewport
                } as any).promise;
              }
            } else {
              // Empty final back cover
              const ctx = rightCanvas.getContext('2d');
              if (ctx) ctx.clearRect(0, 0, rightCanvas.width, rightCanvas.height);
            }
          }
        }
      } else {
        // Single view mode
        const canvas = singleCanvasRef.current;
        if (canvas) {
          const page = await pdfDoc.getPage(currentCoverIndex + 1);
          const viewport = page.getViewport({ scale: 1.0 });
          const desiredHeight = 480;
          const scale = desiredHeight / viewport.height;
          const responsiveViewport = page.getViewport({ scale });

          canvas.height = responsiveViewport.height;
          canvas.width = responsiveViewport.width;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({
              canvasContext: ctx,
              viewport: responsiveViewport
            } as any).promise;
          }
        }
      }
    } catch (err) {
      console.error('Error rendering spread:', err);
    } finally {
      setRenderingPages(false);
    }
  }, [pdfDoc, currentCoverIndex, viewMode, pageCount]);

  useEffect(() => {
    if (pdfDoc) {
      renderBookSpreads();

      // Check if current view is already bookmarked
      const match = bookmarks.some((b) => b.pageIndex === currentCoverIndex);
      setIsBookmarked(match);
    }
  }, [pdfDoc, currentCoverIndex, viewMode, renderBookSpreads, bookmarks]);

  // Turn page events (odd indices covers spreads)
  const nextPage = () => {
    if (viewMode === 'double') {
      if (currentCoverIndex === 0) {
        // From cover page 1 (Index 0), move to index 1 (which renders pages 2 and 3)
        setCurrentCoverIndex(1);
      } else if (currentCoverIndex + 2 < pageCount) {
        setCurrentCoverIndex((prev) => prev + 2);
      }
    } else {
      if (currentCoverIndex + 1 < pageCount) {
        setCurrentCoverIndex((prev) => prev + 1);
      }
    }
  };

  const prevPage = () => {
    if (viewMode === 'double') {
      if (currentCoverIndex === 1) {
        setCurrentCoverIndex(0);
      } else if (currentCoverIndex - 2 >= 1) {
        setCurrentCoverIndex((prev) => prev - 2);
      }
    } else {
      if (currentCoverIndex - 1 >= 0) {
        setCurrentCoverIndex((prev) => prev - 1);
      }
    }
  };

  // Turn to specific bookmarks index
  const jumpToPage = (index: number) => {
    setCurrentCoverIndex(index);
  };

  // Add/Remove local storage bookmarks
  const toggleBookmark = () => {
    if (!file) return;

    let updated: UserBookmark[] = [];
    const allSaved = localStorage.getItem('pdf_reader_bookmarks');
    let parsedAll: UserBookmark[] = [];
    if (allSaved) {
      try { parsedAll = JSON.parse(allSaved); } catch (e) { console.error(e); }
    }

    if (isBookmarked) {
      // Remove
      updated = parsedAll.filter((b) => !(b.pdfName === file.name && b.pageIndex === currentCoverIndex));
      setBookmarks((prev) => prev.filter((b) => b.pageIndex !== currentCoverIndex));
      setIsBookmarked(false);
    } else {
      // Add
      const b: UserBookmark = {
        pdfName: file.name,
        pageIndex: currentCoverIndex,
        addedAt: new Date().toLocaleDateString()
      };
      updated = [...parsedAll, b];
      setBookmarks((prev) => [...prev, b]);
      setIsBookmarked(true);
    }

    localStorage.setItem('pdf_reader_bookmarks', JSON.stringify(updated));
  };

  // Theme class matcher
  const themeClass = 
    theme === 'sepia' 
      ? 'bg-[#f4efe2] text-[#433422] border-[#e4dcbf]'
      : theme === 'day'
      ? 'bg-white text-slate-905 border-slate-200'
      : 'bg-[#121214] text-slate-300 border-[#262629]';

  return (
    <div id="book-reader-view" className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Upper strips header */}
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
            Immersive Book Reader
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Read your document sheets bundled together inside an elegant multi-themed book style with bookmarks support.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {file && (
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border border-slate-200/50 dark:border-slate-800 text-xs">
              <button
                onClick={() => setViewMode('double')}
                className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-center focus:outline-none ${
                  viewMode === 'double'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                Book Spread
              </button>
              <button
                onClick={() => setViewMode('single')}
                className={`px-3 py-1.5 rounded-md font-bold flex items-center gap-1.5 transition-all text-center focus:outline-none ${
                  viewMode === 'single'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Single Page
              </button>
            </div>
          )}
        </div>
      </div>

      {!file ? (
        /* Document upload dropzone */
        <div className="max-w-xl mx-auto py-10">
          {loadingFile ? (
            <div className="flex flex-col items-center justify-center p-14 border rounded-2xl bg-white dark:bg-slate-900 shadow-sm space-y-4">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                Formatting paper page layout ratios...
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
        /* Immersive Book reading sandbox container */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main book spreads table container */}
          <div className="lg:col-span-8 space-y-4">
            
            {/* Upper floating toolbar controls */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl flex items-center justify-between gap-4 select-none">
              
              {/* Lighting themes widgets */}
              <div className="flex gap-1.5">
                {[
                  { name: 'day', icon: Sun, label: 'Daylight', bg: 'bg-white text-slate-900 border-slate-200' },
                  { name: 'sepia', icon: Coffee, label: 'Comfort Sepia', bg: 'bg-[#fcf8f2] text-[#433422] border-[#ebdcb9]' },
                  { name: 'night', icon: Moon, label: 'Night Owl', bg: 'bg-[#000000] text-slate-400 border-neutral-900' }
                ].map((th) => {
                  const Icon = th.icon;
                  return (
                    <button
                      key={th.name}
                      onClick={() => setTheme(th.name as any)}
                      title={th.label}
                      className={`p-2 rounded-lg border flex items-center gap-1 text-[11px] font-bold focus:outline-none transition-all ${
                        theme === th.name
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 font-extrabold ring-1 ring-emerald-500'
                          : 'border-slate-100 hover:bg-slate-50 text-slate-550 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">{th.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Page Bookmark checkbox action */}
              <button
                onClick={toggleBookmark}
                title={isBookmarked ? 'Remove Bookmark' : 'Bookmark this spread'}
                className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 focus:outline-none transition-all ${
                  isBookmarked
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 text-slate-650'
                }`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-white' : ''}`} />
                {isBookmarked ? 'Marked' : 'Bookmark Page'}
              </button>
            </div>

            {/* Immersive Book Spreads desk board */}
            <div
              id="immersive-desk-board"
              className={`p-4 sm:p-8 rounded-2xl border transition-all shadow-md relative min-h-[480px] flex items-center justify-center select-none overflow-hidden ${themeClass}`}
            >
              
              {renderingPages ? (
                /* Full scale blocking screen spinner loader */
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/10 backdrop-blur-xs z-10 space-y-2">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500 font-mono">Flipping Document Pages...</span>
                </div>
              ) : null}

              {/* Pages stacks spreads wrapper */}
              <div className="flex w-full max-w-full justify-center items-stretch gap-1">
                
                {viewMode === 'double' ? (
                  /* Double layout book mockup */
                  <>
                    {/* Left Spine Book sheet */}
                    <div className="flex-1 flex justify-end bg-white/70 shadow-xs border-r border-[#ece0cd] overflow-hidden rounded-l relative">
                      {currentCoverIndex === 0 ? (
                        /* Empty wooden desk panel on side 1 cover list */
                        <div className="w-full flex items-center justify-center text-center p-12 text-[11px] font-bold text-slate-400/70 border-r border-dashed">
                          Closed Book Desk Side
                        </div>
                      ) : (
                        <canvas ref={leftCanvasRef} className="max-w-full object-contain bg-white shrink rounded-l" />
                      )}
                    </div>

                    {/* Rigid central dividing book seam wire */}
                    <div className="w-2.5 bg-neutral-800/40 border-r border-l border-neutral-900/10 shadow-inner shrink-0 self-stretch relative z-10 flex flex-col justify-between py-2">
                      <div className="h-4 w-1 bg-neutral-900/30 mx-auto rounded" />
                      <div className="h-4 w-1 bg-neutral-900/30 mx-auto rounded" />
                      <div className="h-4 w-1 bg-neutral-900/30 mx-auto rounded" />
                    </div>

                    {/* Right Page spread */}
                    <div className="flex-1 flex justify-start bg-white/70 shadow-xs rounded-r overflow-hidden relative">
                      <canvas ref={rightCanvasRef} className="max-w-full object-contain bg-white shrink rounded-r" />
                    </div>
                  </>
                ) : (
                  /* Single Page Spread sheet */
                  <div className="flex items-center justify-center bg-white/90 shadow rounded-lg p-2 max-w-full overflow-hidden">
                    <canvas ref={singleCanvasRef} className="max-w-full object-contain bg-white" />
                  </div>
                )}
              </div>

              {/* Absolute side float page flipping next/previous triggers */}
              <button
                disabled={currentCoverIndex === 0}
                onClick={prevPage}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 hover:scale-105 transition-transform bg-slate-900/75 hover:bg-slate-950 text-white rounded-full z-20 focus:outline-none disabled:opacity-20 shadow-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <button
                disabled={
                  viewMode === 'double'
                    ? (currentCoverIndex === 0 ? pageCount <= 1 : currentCoverIndex + 2 >= pageCount)
                    : currentCoverIndex + 1 >= pageCount
                }
                onClick={nextPage}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:scale-105 transition-transform bg-slate-900/75 hover:bg-slate-950 text-white rounded-full z-20 focus:outline-none disabled:opacity-20 shadow-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Lower controls bar progress strip */}
            <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
              <span>Book file: <span className="font-bold text-slate-700 dark:text-slate-300">{file.name}</span></span>
              
              {viewMode === 'double' ? (
                <span>
                  {currentCoverIndex === 0 ? (
                    "Page 1 (Cover spread)"
                  ) : (
                    `Page ${currentCoverIndex + 1} - ${Math.min(currentCoverIndex + 2, pageCount)} of ${pageCount}`
                  )}
                </span>
              ) : (
                <span>Page {currentCoverIndex + 1} of {pageCount}</span>
              )}
            </div>
          </div>

          {/* Bookmarks, chapters side outline panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 rounded-xl space-y-5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5">
                <Bookmark className="w-4 h-4 text-emerald-500" />
                Table of Bookmarks
              </h3>

              {bookmarks.length === 0 ? (
                <div className="py-6 text-center space-y-1">
                  <Bookmark className="w-6 h-6 mx-auto stroke-1 text-slate-400" />
                  <span className="text-xs font-bold text-slate-400 block">No Active Bookmarks</span>
                  <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto leading-normal">
                    Click the Bookmark Page tool inside the spreads desk to cache page markers locally.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[220px] overflow-y-auto scrollbar pr-1">
                  {bookmarks.map((b) => (
                    <button
                      key={b.pageIndex}
                      onClick={() => jumpToPage(b.pageIndex)}
                      className="w-full flex items-center justify-between text-left p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-950 text-xs text-slate-650 hover:text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <span className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
                        Page {b.pageIndex === 0 ? "1 (Cover)" : `${b.pageIndex + 1} - Spot`}
                      </span>
                      <span className="text-[9px] font-mono font-bold text-slate-400">Jump ({b.addedAt})</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                <button
                  onClick={() => {
                    setFile(null);
                    setPdfDoc(null);
                    setPageCount(0);
                    if (fileUrl) URL.revokeObjectURL(fileUrl);
                    setFileUrl(null);
                  }}
                  className="text-xs text-red-500 font-bold hover:underline"
                >
                  Close Book & Select file
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
