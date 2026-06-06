import React, { useState, useEffect } from 'react';
import Shell from './components/Shell';
import Dashboard from './components/Dashboard';
import RemovePagesTool from './components/RemovePagesTool';
import ImageToPDFTool from './components/ImageToPDFTool';
import PDFToImageTool from './components/PDFToImageTool';
import SignPDFTool from './components/SignPDFTool';
import WatermarkTool from './components/WatermarkTool';
import QRCodeTool from './components/QRCodeTool';
import BookReaderTool from './components/BookReaderTool';
import MergePDFTool from './components/MergePDFTool';
import AddPageNumbersTool from './components/AddPageNumbersTool';
import OCRPDFTool from './components/OCRPDFTool';
import LockPDFTool from './components/LockPDFTool';
import UnlockPDFTool from './components/UnlockPDFTool';
import SmartScannerTool from './components/SmartScannerTool';
import SmartPrivacyRedactorTool from './components/SmartPrivacyRedactorTool';
import MetadataPurifierTool from './components/MetadataPurifierTool';
import VisualPDFDiffTool from './components/VisualPDFDiffTool';
import FormGeneratorTool from './components/FormGeneratorTool';
import AudiobookStudioTool from './components/AudiobookStudioTool';
import WeaponWheel from './components/WeaponWheel';
import { ToolId, RecentFile } from './types';

export default function App() {
  const [activeTool, setActiveTool] = useState<ToolId>('dashboard');
  const [sessionFiles, setSessionFiles] = useState<Record<string, File>>({});
  const [activeFile, setActiveFile] = useState<File | null>(null);
  const [weaponWheelActive, setWeaponWheelActive] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement?.isContentEditable
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'z' && !e.repeat) {
        e.preventDefault();
        setWeaponWheelActive(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'z') {
        setWeaponWheelActive(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleSelectRecentFile = (recent: RecentFile) => {
    const file = sessionFiles[recent.id];
    if (file) {
      setActiveFile(file);
    } else {
      setActiveFile(null);
      // Give a soft user-facing warning if the in-memory File has collected garbage
      alert(`To continue editing "${recent.name}", please select or drop it again in the upload area.`);
    }
    setActiveTool(recent.toolId);
  };

  const handleFileLoaded = (file: File, toolId: ToolId, pageCount?: number) => {
    const id = `${file.name}-${file.size}-${toolId}`;
    setSessionFiles((prev) => ({
      ...prev,
      [id]: file,
    }));

    const recent: RecentFile = {
      id,
      name: file.name,
      size: file.size,
      toolId,
      timestamp: Date.now(),
      pageCount,
    };

    try {
      const stored = localStorage.getItem('pdf_workspace_recent_files');
      let list: RecentFile[] = [];
      if (stored) {
        list = JSON.parse(stored);
      }
      list = list.filter((item) => item.id !== id);
      list.unshift(recent);
      list = list.slice(0, 6);
      localStorage.setItem('pdf_workspace_recent_files', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }
  };

  const navigateToDashboard = () => {
    setActiveFile(null);
    setActiveTool('dashboard');
  };

  const handleSelectTool = (id: ToolId) => {
    setActiveFile(null);
    setActiveTool(id);
  };

  return (
    <>
      <WeaponWheel 
        active={weaponWheelActive} 
        onClose={() => setWeaponWheelActive(false)} 
        onSelectTool={handleSelectTool} 
      />
      <Shell activeTool={activeTool} onSelectTool={handleSelectTool}>
      {activeTool === 'dashboard' ? (
        <Dashboard onSelectTool={handleSelectTool} onSelectRecentFile={handleSelectRecentFile} />
      ) : activeTool === 'remove-pages' ? (
        <RemovePagesTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'remove-pages', pc)}
        />
      ) : activeTool === 'image-to-pdf' ? (
        <ImageToPDFTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'image-to-pdf', pc)}
        />
      ) : activeTool === 'pdf-to-image' ? (
        <PDFToImageTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'pdf-to-image', pc)}
        />
      ) : activeTool === 'sign' ? (
        <SignPDFTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'sign', pc)}
        />
      ) : activeTool === 'watermark' ? (
        <WatermarkTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'watermark', pc)}
        />
      ) : activeTool === 'qr-code' ? (
        <QRCodeTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'qr-code', pc)}
        />
      ) : activeTool === 'book-reader' ? (
        <BookReaderTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'book-reader', pc)}
        />
      ) : activeTool === 'merge-pdf' ? (
        <MergePDFTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'merge-pdf', pc)}
        />
      ) : activeTool === 'add-page-numbers' ? (
        <AddPageNumbersTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'add-page-numbers', pc)}
        />
      ) : activeTool === 'ocr-pdf' ? (
        <OCRPDFTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'ocr-pdf', pc)}
        />
      ) : activeTool === 'lock-pdf' ? (
        <LockPDFTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'lock-pdf', pc)}
        />
      ) : activeTool === 'unlock-pdf' ? (
        <UnlockPDFTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'unlock-pdf', pc)}
        />
      ) : activeTool === 'scanner' ? (
        <SmartScannerTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f, pc) => handleFileLoaded(f, 'scanner', pc)}
        />
      ) : activeTool === 'redact-pdf' ? (
        <SmartPrivacyRedactorTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f: File, pc: number) => handleFileLoaded(f, 'redact-pdf', pc)}
        />
      ) : activeTool === 'purify-metadata' ? (
        <MetadataPurifierTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f: File, pc: number) => handleFileLoaded(f, 'purify-metadata', pc)}
        />
      ) : activeTool === 'compare-pdf' ? (
        <VisualPDFDiffTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f: File, pc: number) => handleFileLoaded(f, 'compare-pdf', pc)}
        />
      ) : activeTool === 'form-generator' ? (
        <FormGeneratorTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f: File, pc: number) => handleFileLoaded(f, 'form-generator', pc)}
        />
      ) : activeTool === 'audiobook-studio' ? (
        <AudiobookStudioTool
          onBackToDashboard={navigateToDashboard}
          initialFile={activeFile}
          onFileLoaded={(f: File, pc: number) => handleFileLoaded(f, 'audiobook-studio', pc)}
        />
      ) : (
        <div id="unsupported-view-placeholder" className="text-center py-20 space-y-4 max-w-sm mx-auto">
          <div className="text-slate-400 font-bold mb-2">Upcoming Tool Module</div>
          <p className="text-xs text-slate-500 leading-normal">
            This module is scheduled for development in Phase 2 of the PDF Editor & Reader workspace.
          </p>
          <button
            onClick={() => setActiveTool('dashboard')}
            className="text-xs font-bold px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-lg hover:opacity-90"
          >
            Return to Dashboard
          </button>
        </div>
      )}
    </Shell>
    </>
  );
}
