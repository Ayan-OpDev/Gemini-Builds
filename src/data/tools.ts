import { Tool } from '../types';

export const TOOLS: Tool[] = [
  {
    id: 'remove-pages',
    name: 'Remove Pages',
    description: 'Delete unwanted pages from your document. Visual grid selection with instant download.',
    icon: 'Scissors',
    category: 'edit',
    isReady: true
  },
  {
    id: 'image-to-pdf',
    name: 'Image to PDF',
    description: 'Convert PNG, JPG, or WEBP images into an elegant, high-quality PDF layout.',
    icon: 'Image',
    category: 'convert',
    isReady: true
  },
  {
    id: 'pdf-to-image',
    name: 'PDF to Image',
    description: 'Render PDF pages into fully-scalable PNG/JPG images, packed in a single ZIP.',
    icon: 'FileImage',
    category: 'convert',
    isReady: true
  },
  {
    id: 'sign',
    name: 'Sign PDF',
    description: 'Draw or type your signature and place it securely with inverse coordinate mapping.',
    icon: 'PenTool',
    category: 'edit',
    isReady: true
  },
  {
    id: 'watermark',
    name: 'Watermark',
    description: 'Stamp your documents with customizable, translucent text or image watermarks.',
    icon: 'Stamp',
    category: 'edit',
    isReady: true
  },
  {
    id: 'qr-code',
    name: 'QR Code PDF',
    description: 'Embed scan-ready, high-resolution QR codes directly on any page of your file.',
    icon: 'QrCode',
    category: 'edit',
    isReady: true
  },
  {
    id: 'book-reader',
    name: 'Book Reader',
    description: 'Read your documents with an immersive, full-screen 3D page-turning simulation.',
    icon: 'BookOpen',
    category: 'view',
    isReady: true
  },
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    description: 'Combine multiple PDF documents into a single file in your desired order.',
    icon: 'Combine',
    category: 'edit',
    isReady: true
  },
  {
    id: 'add-page-numbers',
    name: 'Add Page Numbers',
    description: 'Stamp customized page numbers (Page X of Y) at chosen offsets and orientations.',
    icon: 'Hash',
    category: 'edit',
    isReady: true
  },
  {
    id: 'ocr-pdf',
    name: 'OCR PDF (Extract Text)',
    description: 'Extract raw text layer natively or use state-of-the-art Deep web OCR for scans.',
    icon: 'FileSearch',
    category: 'convert',
    isReady: true
  },
  {
    id: 'lock-pdf',
    name: 'Lock PDF (Protect)',
    description: 'Encrypt documents with secure password protection for complete access control.',
    icon: 'LockKeyhole',
    category: 'edit',
    isReady: true
  },
  {
    id: 'unlock-pdf',
    name: 'Unlock PDF (Decrypt)',
    description: 'Remove password restrictions instantly for pre-authenticated secure documents.',
    icon: 'Unlock',
    category: 'edit',
    isReady: true
  },
  {
    id: 'scanner',
    name: 'Smart Scanner & Crop',
    description: 'Auto-detect boundaries, warp perspectives, and apply high-contrast scan filters.',
    icon: 'Maximize',
    category: 'edit',
    isReady: true
  }
];
