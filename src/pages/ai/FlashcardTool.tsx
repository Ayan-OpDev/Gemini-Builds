import React, { useState, useEffect, useRef } from 'react';
import MarkdownRenderer from '../../components/MarkdownRenderer';
import { useFileContext } from '../../hooks/useFileContext';
import { useAuth } from '../../hooks/useAuth';
import { 
  Sparkles, 
  FileText, 
  AlertCircle, 
  Loader2, 
  PlayCircle, 
  ChevronLeft, 
  ChevronRight, 
  HelpCircle, 
  CheckCircle2, 
  RotateCw,
  Award,
  BookOpen,
  Trash2
} from 'lucide-react';
import { extractTextFromPDF, calculateAICost } from '../../utils/pdfExtractor';
import PDFCanvasViewer from '../../components/PDFCanvasViewer';

interface Flashcard {
  question: string;
  answer: string;
  status?: 'unstudied' | 'review' | 'mastered';
}

export default function FlashcardTool() {
  const { flashcardsFile, setFlashcardsFile } = useFileContext();
  const { deductCredits, addCredits, profile } = useAuth();

  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdPlaying, setIsAdPlaying] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [pendingCostDetails, setPendingCostDetails] = useState<{ wordCount: number; cost: number; extractedText: string } | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Split panel drag-resizing state
  const [leftWidth, setLeftWidth] = useState<number>(50); // 50/50 starting split percentage
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowWidth, setWindowWidth] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  const handleDeleteChat = () => {
    if (flashcardsFile) {
      sessionStorage.removeItem(`flashcards_${flashcardsFile.name}`);
    }
    setFlashcardsFile(null);
    setFlashcards([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setError(null);
    setShowDeleteConfirm(false);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      
      const clamped = Math.max(40, Math.min(70, percentage));
      setLeftWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Load from sessionStorage when file changes
  useEffect(() => {
    if (flashcardsFile) {
      const url = URL.createObjectURL(flashcardsFile);
      setPdfUrl(url);

      const cached = sessionStorage.getItem(`flashcards_${flashcardsFile.name}`);
      if (cached) {
        try {
          setFlashcards(JSON.parse(cached));
          setCurrentIndex(0);
          setIsFlipped(false);
          setError(null);
        } catch {
          setFlashcards([]);
        }
      } else {
        setFlashcards([]);
      }

      return () => {
        URL.revokeObjectURL(url);
        setPdfUrl(null);
      };
    } else {
      setPdfUrl(null);
      setFlashcards([]);
      setError(null);
    }
  }, [flashcardsFile]);

  const handleWatchAd = async () => {
    setIsAdPlaying(true);
    setError(null);
    setTimeout(async () => {
      await addCredits(5);
      setIsAdPlaying(false);
    }, 3000);
  };

  const handlePrepareGeneration = async () => {
    if (!flashcardsFile) return;

    setIsGenerating(true);
    setError(null);

    try {
      const extractedText = await extractTextFromPDF(flashcardsFile);
      const { wordCount, cost } = calculateAICost(extractedText);
      
      // Store details to show custom confirmation dialog
      setPendingCostDetails({ wordCount, cost: Math.max(2, Math.min(10, cost)), extractedText });
      setIsGenerating(false);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "An error occurred during PDF text extraction.");
      setIsGenerating(false);
    }
  };

  const executeGeneration = async () => {
    if (!pendingCostDetails || !flashcardsFile) return;
    const { cost, extractedText } = pendingCostDetails;

    setPendingCostDetails(null);
    setIsGenerating(true);
    setError(null);

    try {
      const currentBalance = profile?.credits || 0;
      if (currentBalance < cost) {
        setError(`Insufficient credits. You need ${cost} but have ${currentBalance}.`);
        setIsGenerating(false);
        return;
      }

      const response = await fetch('/api/ai/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: extractedText })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to generate study flashcards.');
      }

      const data = await response.json();

      const success = await deductCredits(cost);
      if (!success) {
        throw new Error("Failed to sync credit deduction with the database.");
      }

      const cards: Flashcard[] = data.flashcards.map((c: any) => ({
        question: c.question,
        answer: c.answer,
        status: 'unstudied'
      }));

      setFlashcards(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      sessionStorage.setItem(`flashcards_${flashcardsFile.name}`, JSON.stringify(cards));

    } catch (e: any) {
      console.error(e);
      setError(e.message || "An error occurred during flashcard generation.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFlashcardsFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFlashcardsFile(e.target.files[0]);
    }
  };

  const handleNext = () => {
    if (flashcards.length === 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % flashcards.length);
    }, 150);
  };

  const handlePrev = () => {
    if (flashcards.length === 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }, 150);
  };

  const handleUpdateStatus = (status: 'review' | 'mastered') => {
    const updated = [...flashcards];
    updated[currentIndex] = {
      ...updated[currentIndex],
      status: updated[currentIndex].status === status ? 'unstudied' : status
    };
    setFlashcards(updated);
    if (flashcardsFile) {
      sessionStorage.setItem(`flashcards_${flashcardsFile.name}`, JSON.stringify(updated));
    }
  };

  const masteredCount = flashcards.filter(c => c.status === 'mastered').length;
  const reviewCount = flashcards.filter(c => c.status === 'review').length;
  const progressPercent = flashcards.length > 0 ? Math.round(((masteredCount) / flashcards.length) * 100) : 0;

  return (
    <div 
      ref={containerRef}
      className="flex flex-col md:flex-row h-[calc(100vh-64px)] w-full antialiased overflow-hidden bg-slate-50 dark:bg-slate-900 relative"
    >
      {/* LEFT PANEL: PDF Viewer */}
      <div 
        style={{ 
          width: isMobile ? '100%' : `${leftWidth}%`,
          height: isMobile ? 'auto' : '100%',
          pointerEvents: isResizing ? 'none' : 'auto'
        }}
        className="border-b md:border-b-0 border-r-0 md:border-r border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 overflow-hidden relative flex flex-col shrink-0"
      >
        {isMobile ? (
          /* Mobile view: No PDFCanvasViewer at all, only functional PDF management */
          <div className="w-full flex flex-col">
            {!flashcardsFile ? (
              <div className="flex flex-col items-center justify-center p-4 text-center w-full bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-row items-center gap-3 w-full max-w-md justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950 rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5 text-indigo-500" />
                    </div>
                    <div className="text-left">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Upload PDF</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Select a file to begin</p>
                    </div>
                  </div>
                  <label 
                    htmlFor="file-upload-mobile"
                    className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-md shadow-indigo-600/15 transition-all active:scale-95 whitespace-nowrap"
                  >
                    Select File
                  </label>
                  <input 
                    type="file" 
                    id="file-upload-mobile" 
                    className="hidden" 
                    accept="application/pdf" 
                    onChange={handleFileSelect} 
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-4 text-center w-full bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
                <div className="flex flex-row items-center gap-3 w-full max-w-md justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
                    </div>
                    <div className="text-left min-w-0">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate max-w-[140px] sm:max-w-[200px]" title={flashcardsFile.name}>
                        {flashcardsFile.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Active Document</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/35 text-rose-600 dark:text-rose-400 rounded-xl font-bold text-xs transition-all active:scale-95 border border-rose-100 dark:border-rose-900/40 shrink-0 whitespace-nowrap"
                  >
                    Delete Current PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Desktop view: Standard layout showing PDF renderer or large drag-and-drop area */
          <>
            {!flashcardsFile ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center h-full w-full bg-slate-50 dark:bg-slate-950">
                <div 
                  className={`border-2 border-dashed rounded-3xl p-8 md:p-12 max-w-lg w-full flex flex-col items-center justify-center transition-all ${
                    isDragging 
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                      : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                  onDrop={handleFileDrop}
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-white dark:bg-slate-800 shadow-sm rounded-2xl flex items-center justify-center mb-6">
                    <FileText className="w-8 h-8 md:w-10 md:h-10 text-indigo-500" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-3">Upload a Document</h2>
                  <p className="text-slate-500 dark:text-slate-400 max-w-xs mb-8 leading-relaxed text-sm md:text-base">
                    Drag and drop your PDF study guide or notes, and let AI generate study flashcards.
                  </p>
                  
                  <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    accept="application/pdf" 
                    onChange={handleFileSelect} 
                  />
                  <label 
                    htmlFor="file-upload"
                    className="cursor-pointer px-6 md:px-8 py-3 md:py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
                  >
                    Select File
                  </label>
                </div>
              </div>
            ) : flashcardsFile && pdfUrl ? (
              <PDFCanvasViewer url={pdfUrl} />
            ) : null}
          </>
        )}
      </div>

      {/* Resizer strip */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          setIsResizing(true);
        }}
        className={`hidden md:block w-1 bg-slate-200 dark:bg-slate-800 hover:bg-indigo-500 dark:hover:bg-indigo-400 cursor-col-resize h-full transition-colors relative z-20 shrink-0 ${
          isResizing ? '!bg-indigo-600 w-1.5' : ''
        }`}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex flex-col justify-center gap-1.5 pointer-events-none opacity-40">
          <div className="w-1 h-1 bg-slate-400 dark:bg-slate-500 rounded-full" />
          <div className="w-1 h-1 bg-slate-400 dark:bg-slate-500 rounded-full" />
          <div className="w-1 h-1 bg-slate-400 dark:bg-slate-500 rounded-full" />
        </div>
      </div>

      {isResizing && (
        <div className="fixed inset-0 z-40 cursor-col-resize" style={{ pointerEvents: 'auto' }} />
      )}

      {/* RIGHT PANEL: Study Companion */}
      <div 
        style={{ 
          width: isMobile ? '100%' : `${100 - leftWidth}%`,
          height: isMobile ? 'auto' : '100%'
        }}
        className={`bg-white dark:bg-slate-950 flex flex-col overflow-hidden relative shrink-0 ${
          isMobile ? 'flex-1' : ''
        }`}
      >
        {/* Header bar */}
        <div className="h-14 border-b border-slate-200 dark:border-slate-800 flex flex-row items-center justify-between px-6 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <div className="flex flex-row items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 tracking-tight">AI Flashcard Studio</h3>
          </div>
          {flashcardsFile && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete study cards and document"
                className="p-1 px-1.5 hover:bg-rose-50 dark:hover:bg-red-950/30 text-rose-600 dark:text-rose-400 rounded-lg transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-red-150 dark:hover:border-red-900/25 hover:scale-105 active:scale-95"
              >
                <Trash2 className="w-4 h-4 text-red-500 animate-pulse" />
              </button>
              <div className="text-xs font-semibold text-slate-500 bg-slate-200 dark:bg-slate-800 px-3 py-1 rounded-full truncate max-w-[200px]" title={flashcardsFile.name}>
                {flashcardsFile.name}
              </div>
            </div>
          )}
        </div>

        {/* Action/Progress panel */}
        {flashcards.length > 0 && (
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-650 dark:text-slate-405 mb-1.5">
                <span>Overall Study Progress</span>
                <span>{progressPercent}% Complete</span>
              </div>
              <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300 rounded-full" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-[10px] text-slate-400 mt-1 font-mono">
                <span>Total: {flashcards.length} cards</span>
                <span>•</span>
                <span className="text-emerald-500 font-bold">Mastered: {masteredCount}</span>
                <span>•</span>
                <span className="text-amber-500 font-bold">Review: {reviewCount}</span>
              </div>
            </div>
            {flashcardsFile && (
              <button 
                onClick={handlePrepareGeneration}
                disabled={isGenerating || isAdPlaying}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-705 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all text-xs cursor-pointer select-none shrink-0"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Regenerate AI Cards
              </button>
            )}
          </div>
        )}

        {/* Body content workspace */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar bg-white dark:bg-slate-950 flex flex-col justify-between">
          <div className="w-full">
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 flex flex-col items-start gap-3 border border-red-200 dark:border-red-800/50">
                <div className="flex items-start gap-3 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium">{error}</p>
                </div>
                {error.includes("Insufficient credits") && (
                  <button 
                    onClick={handleWatchAd}
                    disabled={isAdPlaying}
                    className="mt-2 text-xs flex items-center gap-2 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:hover:bg-indigo-800/50 text-indigo-707 dark:text-indigo-300 px-3 py-1.5 rounded-lg font-bold transition-colors disabled:opacity-50"
                  >
                    {isAdPlaying ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                    {isAdPlaying ? "Watching Ad..." : "Watch Ad to earn +5 Credits"}
                  </button>
                )}
              </div>
            )}

            {isAdPlaying && !error && (
              <div className="flex flex-col items-center justify-center p-12 text-center h-full">
                 <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
                 <p className="text-slate-500 dark:text-slate-400 font-medium pb-2">Playing video ad...</p>
                 <p className="text-xs text-slate-400 dark:text-slate-505">Your free credits will load in a brief moment.</p>
              </div>
            )}

            {/* Flashcard Render Workspace */}
            {flashcards.length === 0 && !isGenerating && !isAdPlaying ? (
              <div className="flex flex-col items-center justify-center h-full max-w-sm mx-auto text-center py-10 mt-12 pb-24">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mb-6 border border-indigo-100 dark:border-indigo-800/50 shadow-inner">
                  <BookOpen className="w-8 h-8 text-indigo-500 animate-pulse" />
                </div>
                <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                  {flashcardsFile ? "Generate Study Cards" : "Waiting for Document"}
                </h4>
                <p className="text-slate-505 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                  {flashcardsFile 
                    ? "Let AI analyze your document text to extract and build 8 highly technical, study-ready interactive flashcards." 
                    : "Upload a PDF study guide in the left panel to trigger the AI-driven study companion."
                  }
                </p>
                {flashcardsFile && (
                  <button 
                    onClick={handlePrepareGeneration}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-705 text-white rounded-xl font-bold transition-all shadow-md shadow-indigo-600/20 max-w-xs hover:scale-[1.01]"
                  >
                    <Sparkles className="w-4 h-4" />
                    Build Flashcards (AI)
                  </button>
                )}
              </div>
            ) : isGenerating ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 mt-12">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-6" />
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Generating Flashcards...</h4>
                <p className="text-sm text-slate-505 dark:text-slate-400">Synthesizing core technical elements into Question/Answer vectors</p>
              </div>
            ) : flashcards.length > 0 ? (
              <div className="space-y-6 w-full max-w-xl mx-auto py-4">
                {/* Visual Card Stage */}
                <div 
                  onClick={() => setIsFlipped(!isFlipped)}
                  className={`relative w-full min-h-[300px] rounded-3xl cursor-pointer transition-all duration-300 border focus:outline-none select-none group flex flex-col justify-between overflow-hidden shadow-sm ${
                    isFlipped 
                      ? 'bg-amber-50/20 dark:bg-amber-950/20 border-amber-205 dark:border-amber-900/40 hover:shadow-md' 
                      : 'bg-indigo-50/15 dark:bg-indigo-950/10 border-indigo-100 dark:border-indigo-900/30 hover:border-indigo-200 dark:hover:border-indigo-800'
                  }`}
                >
                  {/* Banner tag */}
                  <div className="px-5 py-3 border-b flex items-center justify-between text-xs font-semibold tracking-wide uppercase font-mono ${
                    isFlipped 
                      ? 'border-amber-100/60 text-amber-600 dark:text-amber-400' 
                      : 'border-indigo-100/50 text-indigo-600 dark:text-indigo-400'
                  }">
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {isFlipped ? "Answer Side" : "Question Side"}
                    </span>
                    <span className="text-[10px] bg-white/80 dark:bg-slate-900 px-2 py-0.5 rounded-full border">
                      {currentIndex + 1} / {flashcards.length}
                    </span>
                  </div>

                  {/* Question or Answer Core text rendered via MarkdownRenderer */}
                  <div className="p-6 md:p-8 flex-1 flex flex-col justify-center text-slate-800 dark:text-slate-100">
                    <MarkdownRenderer content={isFlipped ? flashcards[currentIndex].answer : flashcards[currentIndex].question} />
                  </div>

                  {/* Flipping Prompt Indicator */}
                  <div className="px-5 py-3 bg-slate-50/50 dark:bg-slate-900/30 border-t border-slate-100 dark:border-slate-800/60 text-[10px] font-bold tracking-wider text-slate-400 uppercase text-center group-hover:text-slate-500 transition-colors">
                    Click card to flip and verify
                  </div>
                </div>

                {/* Question grading actions */}
                <div className="flex items-center justify-center gap-4 py-2">
                  <button
                    onClick={() => handleUpdateStatus('review')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      flashcards[currentIndex].status === 'review'
                        ? 'bg-amber-100/50 border-amber-300 text-amber-705 dark:bg-amber-950/30'
                        : 'border-slate-205 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    Needs Review
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('mastered')}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                      flashcards[currentIndex].status === 'mastered'
                        ? 'bg-emerald-100/50 border-emerald-300 text-emerald-705 dark:bg-emerald-955/30'
                        : 'border-slate-205 dark:border-slate-800 text-slate-505 hover:bg-slate-50 dark:hover:bg-slate-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-505" />
                    Mastered
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Bottom Card Navigation */}
          {flashcards.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-150 dark:border-slate-800/80 pt-6 px-4 mt-6 shrink-0">
              <button
                onClick={handlePrev}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all select-none active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              
              <div className="flex items-center gap-1.5">
                {flashcards.map((card, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentIndex(idx);
                    }}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      idx === currentIndex
                        ? 'w-6 bg-indigo-500'
                        : card.status === 'mastered'
                        ? 'w-2.5 bg-emerald-500'
                        : card.status === 'review'
                        ? 'w-2.5 bg-amber-500'
                        : 'w-2.5 bg-slate-300 dark:bg-slate-700'
                    }`}
                    title={`Go to Card ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-all select-none active:scale-95"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {pendingCostDetails && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full shadow-2xl p-6 transform transition-all duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mb-4 border border-indigo-100 dark:border-indigo-800/50">
                <Sparkles className="w-6 h-6 text-indigo-500" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Confirm AI Study Guide
              </h3>
              
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                Your file has <strong className="font-semibold text-slate-800 dark:text-slate-200">{pendingCostDetails.wordCount} words</strong> and needs <strong className="font-semibold text-indigo-600 dark:text-indigo-400">{pendingCostDetails.cost} study credits</strong> to compile 8 premium study notes cards. Do you want to begin study?
              </p>
              
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setPendingCostDetails(null)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeGeneration}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-indigo-600/25 transition-colors cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full shadow-2xl p-6 transform transition-all duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-50 dark:bg-red-900/40 rounded-full flex items-center justify-center mb-4 border border-red-100 dark:border-red-800/50">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
                Do you want to delete this chat ?
              </h3>
              
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                This will permanently delete the AI flashcards history and remove the uploaded document.
              </p>
              
              <div className="flex items-center gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteChat}
                  className="flex-1 px-4 py-2.5 bg-red-650 text-white font-semibold text-sm rounded-xl shadow-md shadow-red-600/25 transition-colors cursor-pointer bg-red-600 hover:bg-red-700 font-bold"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
