import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileWarning, Eye } from 'lucide-react';

interface FileUploadAreaProps {
  onFileSelected: (file: File) => void;
  accept?: Record<string, string[]>;
  maxSize?: number; // In bytes
  title?: string;
  subtitle?: string;
}

export default function FileUploadArea({
  onFileSelected,
  accept = { 'application/pdf': ['.pdf'] },
  maxSize = 30 * 1024 * 1024, // 30MB default
  title = "Drag & drop your PDF here",
  subtitle = "or click to select file from your computer"
}: FileUploadAreaProps) {
  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (acceptedFiles.length > 0) {
      onFileSelected(acceptedFiles[0]);
    } else if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      const error = rejection.errors[0];
      if (error?.code === 'file-too-large') {
        alert(`File is too large. Maximum size allowed is ${(maxSize / (1024 * 1024)).toFixed(0)}MB.`);
      } else if (error?.code === 'file-invalid-type') {
        alert("Invalid file type. Only PDFs are accepted for this operation.");
      } else {
        alert(`Failed to load file: ${error?.message || 'Unknown error'}`);
      }
    }
  }, [onFileSelected, maxSize]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false
  } as any);

  return (
    <div
      id="file-dropzone-container"
      {...getRootProps()}
      className={`relative group border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-200 text-center flex flex-col items-center justify-center min-h-[220px] ${
        isDragActive
          ? 'border-emerald-500 bg-emerald-50/40Dark:bg-emerald-950/10'
          : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-white dark:bg-slate-900/50'
      }`}
    >
      <input id="file-dropzone-input" {...getInputProps()} />
      
      <div className={`p-4 rounded-full mb-4 transition-transform duration-200 group-hover:scale-110 ${
        isDragActive ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
      }`}>
        <Upload className="w-8 h-8" />
      </div>

      <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
        {isDragActive ? "Drop the PDF here!" : title}
      </p>
      
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 px-6">
        {subtitle}
      </p>

      <span className="text-[10px] text-slate-400 mt-4 px-3 py-1 bg-slate-50 dark:bg-slate-800/60 rounded border border-slate-100 dark:border-slate-800 font-mono">
        Max file size: {(maxSize / (1024 * 1024)).toFixed(0)}MB
      </span>
    </div>
  );
}
