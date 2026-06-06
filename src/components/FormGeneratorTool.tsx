import React, { useState, useEffect, useRef } from 'react';
import { FormInput, ArrowLeft, Loader2, Save, Download, PlusCircle } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';
import { FileUploader } from './FileUploader';

interface FormField {
    id: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    name: string;
}

export default function FormGeneratorTool({ onBackToDashboard, initialFile, onFileLoaded }: any) {
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  
  const [scale, setScale] = useState(1.5);
  const [fields, setFields] = useState<FormField[]>([]);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const initDoc = async (f: File) => {
    if (!f) return;
    setLoading(true);
    try {
      const arrayBuffer = await f.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new Error("Empty file buffer");
      const loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
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
    
    await page.render(renderContext).promise;
  };

  useEffect(() => {
    renderPage();
  }, [pdfDoc, currentPage, scale]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
      // Don't add if we clicked on an existing field or button
      if ((e.target as HTMLElement).tagName !== 'CANVAS') return;
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setFields([
          ...fields,
          {
              id: Math.random().toString(36).substr(2, 9),
              page: currentPage,
              x,
              y,
              width: 150,
              height: 30,
              name: `Field_${fields.length + 1}`
          }
      ]);
  };
  
  const updateField = (id: string, updates: Partial<FormField>) => {
      setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };
  
  const removeField = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setFields(fields.filter(f => f.id !== id));
  };

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
        const arrayBuffer = await file.arrayBuffer();
        const libDoc = await PDFDocument.load(arrayBuffer);
        
        const form = libDoc.getForm();
        
        for (const field of fields) {
            const pdfPage = libDoc.getPage(field.page - 1);
            const { width: pdfWidth, height: pdfHeight } = pdfPage.getSize();
            
            const jsPage = await pdfDoc.getPage(field.page);
            const viewport = jsPage.getViewport({ scale });
            
            const scaleX = pdfWidth / viewport.width;
            const scaleY = pdfHeight / viewport.height;
            
            const pX = field.x * scaleX;
            const pY = pdfHeight - ((field.y + field.height) * scaleY);
            const pW = field.width * scaleX;
            const pH = field.height * scaleY;
            
            try {
                const textField = form.createTextField(field.name || Math.random().toString());
                textField.addToPage(pdfPage, {
                    x: pX,
                    y: pY,
                    width: pW,
                    height: pH,
                    borderWidth: 1,
                    borderColor: rgb(0,0,0),
                    backgroundColor: rgb(0.95, 0.95, 0.95)
                });
            } catch (err) {
               console.warn("Field name collision or error", err);
               // Simple fallback if name already exists
               const textField = form.createTextField(field.name + '_' + Math.random().toString());
               textField.addToPage(pdfPage, {
                    x: pX, y: pY, width: pW, height: pH, borderWidth: 1
               });
            }
        }
        
        const bytes = await libDoc.save();
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `form_${file.name}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch(e) {
        console.error(e);
        alert('Failed to generate form');
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
            <FormInput className="w-8 h-8 text-emerald-500" />
            Interactive Form Generator
          </h1>
          <p className="text-slate-500">
            Convert standard PDFs into fillable forms by clicking to add text fields.
          </p>
        </div>
        <FileUploader onFileSelected={(files) => setFile(files[0])} />
      </div>
    );
  }

  const currentPageFields = fields.filter(f => f.page === currentPage);

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
            disabled={saving || fields.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium disabled:opacity-50 transition-colors"
        >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Fillable PDF
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
          className="relative shadow-xl bg-white border border-slate-300 select-none cursor-crosshair group"
          onClick={handleContainerClick}
        >
          <canvas ref={canvasRef} className="block" />
          
          {currentPageFields.map(f => (
              <div 
                  key={f.id}
                  className="absolute bg-emerald-100/80 border border-emerald-500 rounded p-1 flex items-center shadow-sm hover:ring-2 hover:ring-emerald-400"
                  style={{
                      left: f.x,
                      top: f.y,
                      width: f.width,
                      height: f.height
                  }}
                  onClick={(e) => e.stopPropagation()}
              >
                  <input 
                      type="text" 
                      value={f.name}
                      onChange={(e) => updateField(f.id, { name: e.target.value })}
                      placeholder="Field Name"
                      className="w-full h-full bg-transparent text-xs font-mono text-emerald-900 placeholder:text-emerald-700 focus:outline-none"
                  />
                  <div 
                      className="absolute right-0 bottom-0 w-3 h-3 bg-emerald-500 cursor-se-resize rounded-tl shadow cursor-move"
                      onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const startX = e.clientX;
                          const startY = e.clientY;
                          const startW = f.width;
                          const startH = f.height;
                          
                          const onMouseMove = (moveE: MouseEvent) => {
                              const newW = Math.max(50, startW + (moveE.clientX - startX));
                              const newH = Math.max(20, startH + (moveE.clientY - startY));
                              updateField(f.id, { width: newW, height: newH });
                          };
                          
                          const onMouseUp = () => {
                              document.removeEventListener('mousemove', onMouseMove);
                              document.removeEventListener('mouseup', onMouseUp);
                          };
                          
                          document.addEventListener('mousemove', onMouseMove);
                          document.addEventListener('mouseup', onMouseUp);
                      }}
                  />
                  
                  <button 
                      onClick={(e) => removeField(f.id, e)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                      ✕
                  </button>
              </div>
          ))}
        </div>
      </div>
      <div className="mt-4 text-center text-sm text-slate-500">
          Click anywhere on the document to add a text input field. Drag bottom right corner to resize.
      </div>
    </div>
  );
}
