import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from '@cantoo/pdf-lib';
import FileUploadArea from './FileUploadArea';
import ProcessingOverlay from './ProcessingOverlay';
import { useLoadWASM } from '../hooks/useLoadWASM';
import {
  ChevronLeft,
  Maximize,
  Sparkles,
  Download,
  Loader2,
  FileText,
  RotateCcw,
  SlidersHorizontal,
  ChevronRight,
  Check,
  ArrowRight,
  ArrowLeft,
  FileDown,
  RefreshCw,
  Crop,
  ShieldCheck,
  Compass,
  FileCheck2,
  Sparkle
} from 'lucide-react';

const pdfjsVersion = pdfjsLib.version || '6.0.227';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

interface SmartScannerToolProps {
  onBackToDashboard: () => void;
  initialFile?: File | null;
  onFileLoaded?: (file: File, pageCount?: number) => void;
}

interface Point {
  x: number; // Normalized coordinate (0.0 to 1.0)
  y: number; // Normalized coordinate (0.0 to 1.0)
}

type FilterType = 'original' | 'grayscale' | 'bw' | 'magic-color';

interface PageState {
  corners: Point[]; // Normalized coordinate handles
  croppedImage: string | null;
  filteredImage: string | null;
  croppedWidth: number;
  croppedHeight: number;
  filter: FilterType;
}

// Coordinate Sorter: TL, TR, BR, BL order
const sortPoints = (points: Point[]): Point[] => {
  if (points.length !== 4) return points;

  // Map elements with sum & difference metrics
  const withMetrics = points.map(p => ({
    p,
    sum: p.x + p.y,
    diff: p.x - p.y
  }));

  // Sort by sum to isolate Top-Left & Bottom-Right
  withMetrics.sort((a, b) => a.sum - b.sum);
  const tl = withMetrics[0].p;
  const br = withMetrics[3].p;

  // Sort remaining two by difference to isolate Bottom-Left and Top-Right
  const remaining = [withMetrics[1].p, withMetrics[2].p];
  remaining.sort((a, b) => (a.x - a.y) - (b.x - b.y));
  const bl = remaining[0];
  const tr = remaining[1];

  return [tl, tr, br, bl];
};

export default function SmartScannerTool({
  onBackToDashboard,
  initialFile = null,
  onFileLoaded
}: SmartScannerToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  // Check OpenCV state helper
  const checkOpenCVReady = useCallback((): boolean => {
    const cv = (window as any).cv;
    return !!(cv && cv.Mat && cv.cvtColor && cv.GaussianBlur && cv.Canny);
  }, []);

  // OpenCV Loader State (Async CDN via custom hook)
  const { loaded: opencvLoaded, error: opencvError } = useLoadWASM({
    src: 'https://docs.opencv.org/4.10.0/opencv.js',
    scriptId: 'opencv-cdn-script',
    checkReady: checkOpenCVReady,
  });

  const opencvLoading = !opencvLoaded && !opencvError;

  // Scan & Crop Workspace State
  const [sourceImage, setSourceImage] = useState<string | null>(null); // Original size source image DataURL
  const [originalSize, setOriginalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [corners, setCorners] = useState<Point[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const [croppedImage, setCroppedImage] = useState<string | null>(null); // Output crops
  const [croppedWidth, setCroppedWidth] = useState<number>(0);
  const [croppedHeight, setCroppedHeight] = useState<number>(0);
  
  const [filter, setFilter] = useState<FilterType>('original');
  const [filteredImage, setFilteredImage] = useState<string | null>(null); // Filter outputs

  // Master multi-page caching layer state (Tracks processed states across all documents)
  const [pagesData, setPagesData] = useState<Record<number, PageState>>({});

  const [processing, setProcessing] = useState<boolean>(false);
  const [progressText, setProgressText] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Handle Clean up URLs on unmount
  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Generate standard 10% inside boundary margins as normalized percentage coordinates
  const generateDefaultCorners = () => {
    setCorners([
      { x: 0.1, y: 0.1 }, // TL
      { x: 0.9, y: 0.1 }, // TR
      { x: 0.9, y: 0.9 }, // BR
      { x: 0.1, y: 0.9 }  // BL
    ]);
  };

  // Run auto detection pipeline
  const runAutoDetect = (canvas: HTMLCanvasElement) => {
    if (!checkOpenCVReady()) {
      generateDefaultCorners();
      return;
    }
    const cv = (window as any).cv;

    let src: any = null;
    let gray: any = null;
    let blurred: any = null;
    let edged: any = null;
    let contours: any = null;
    let hierarchy: any = null;

    try {
      src = cv.imread(canvas);
      gray = new cv.Mat();
      blurred = new cv.Mat();
      edged = new cv.Mat();

      // 1. Grayscale conversion
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

      // 2. Blur to eliminate small noise spots
      let ksize = new cv.Size(5, 5);
      cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

      // 3. Canny edge detector
      cv.Canny(blurred, edged, 50, 150, 3, false);

      // 4. Contour retrieval
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      let maxArea = 0;
      let approxPoints: Point[] = [];

      for (let i = 0; i < contours.size(); ++i) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);

        if (area > 2000) { // filter out too-small structures
          let perimeter = cv.arcLength(contour, true);
          let approx = new cv.Mat();
          try {
            cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

            if (approx.rows === 4) {
              if (area > maxArea) {
                maxArea = area;
                approxPoints = [];
                for (let j = 0; j < 4; j++) {
                  approxPoints.push({
                    x: approx.data32S[j * 2],
                    y: approx.data32S[j * 2 + 1]
                  });
                }
              }
            }
          } finally {
            // Immediately free memory of internal loop matrices
            approx.delete();
          }
        }
      }

      if (approxPoints.length === 4) {
        // Convert to percentage normalized coordinates (0.0 to 1.0)
        const sorted = sortPoints(approxPoints);
        const normalized = sorted.map(pt => ({
          x: pt.x / canvas.width,
          y: pt.y / canvas.height
        }));
        setCorners(normalized);
      } else {
        generateDefaultCorners();
      }
    } catch (err) {
      console.error('OpenCV boundary calculation failed:', err);
      generateDefaultCorners();
    } finally {
      // Direct WebAssembly explicit cleanup in finally segment to prevent leaks
      if (src) src.delete();
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (edged) edged.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    }
  };

  // Synchronize state changes to pagesData cache
  const saveCurrentPageState = (pageIdx: number, overrideFields?: Partial<PageState>) => {
    setPagesData(prev => {
      const current = prev[pageIdx] || {
        corners,
        croppedImage,
        filteredImage,
        croppedWidth,
        croppedHeight,
        filter
      };
      return {
        ...prev,
        [pageIdx]: {
          ...current,
          ...overrideFields
        }
      };
    });
  };

  // Scale interactive overlays based on displayed sizing bounds
  const updateDisplaySize = () => {
    if (imageRef.current) {
      setDisplaySize({
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight
      });
    }
  };

  useEffect(() => {
    window.addEventListener('resize', updateDisplaySize);
    return () => window.removeEventListener('resize', updateDisplaySize);
  }, []);

  // Handle PDF rendering page step
  const loadPdfPage = async (docUrl: string, pageIndex: number, forceRestoreCache = true) => {
    try {
      setProcessing(true);
      setProgressText(`Rendering PDF Page ${pageIndex + 1} at high-definition zoom...`);

      const loadingTask = pdfjsLib.getDocument({ url: docUrl });
      const doc = await loadingTask.promise;
      const page = await doc.getPage(pageIndex + 1);

      // Render at pixel-density 2x scale for sharp document parsing
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to acquire canvas rendering context.');

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport } as any).promise;

      const dataUrl = canvas.toDataURL('image/png');
      setOriginalSize({ width: canvas.width, height: canvas.height });
      setSourceImage(dataUrl);

      // Check pagesData cache
      const cached = pagesData[pageIndex];
      if (cached && forceRestoreCache) {
        setCorners(cached.corners);
        setCroppedImage(cached.croppedImage);
        setFilteredImage(cached.filteredImage);
        setCroppedWidth(cached.croppedWidth);
        setCroppedHeight(cached.croppedHeight);
        setFilter(cached.filter);
      } else {
        // Reset crop steps
        setCroppedImage(null);
        setFilteredImage(null);
        setFilter('original');

        // Perform Auto Detect asynchronously
        setTimeout(() => {
          runAutoDetect(canvas);
        }, 100);
      }

    } catch (err: any) {
      console.error(err);
      alert('Fail to load and render requested PDF page.');
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  // Convert files on receipt
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setLoadingFile(true);
    setSourceImage(null);
    setCroppedImage(null);
    setFilteredImage(null);
    setFilter('original');
    setPagesData({});
    
    try {
      const url = URL.createObjectURL(selectedFile);
      setFileUrl(url);
      setFile(selectedFile);

      if (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')) {
        const loadingTask = pdfjsLib.getDocument({ url });
        const doc = await loadingTask.promise;
        setPageCount(doc.numPages);
        setCurrentPage(0);
        onFileLoaded?.(selectedFile, doc.numPages);
        
        // Render first page immediately
        await loadPdfPage(url, 0, false);
      } else {
        // Direct image loading
        setPageCount(1);
        setCurrentPage(0);
        onFileLoaded?.(selectedFile, 1);

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight });
            setSourceImage(img.src);
            runAutoDetect(canvas);
          }
        };
        img.onerror = () => {
          alert('Failed to load image format.');
        };
        img.src = url;
      }
    } catch (err: any) {
      console.error(err);
      alert('Failed to initialize document. Make sure it is non-corrupt.');
      setFile(null);
    } finally {
      setLoadingFile(false);
    }
  }, [onFileLoaded]);

  // Load initial file automatically if forwarded
  useEffect(() => {
    if (initialFile) {
      handleFileSelected(initialFile);
    }
  }, [initialFile, handleFileSelected]);

  // Interactive coordinate handle dragging (Normalized 0.0 - 1.0 logic)
  const handleMouseDown = (index: number, e: React.MouseEvent<SVGCircleElement>) => {
    e.preventDefault();
    setDraggingIndex(index);
  };

  const handleTouchStart = (index: number, e: React.TouchEvent<SVGCircleElement>) => {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    setDraggingIndex(index);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingIndex === null || !imageRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    let pctX = (e.clientX - rect.left) / rect.width;
    let pctY = (e.clientY - rect.top) / rect.height;

    pctX = Math.max(0, Math.min(1, pctX));
    pctY = Math.max(0, Math.min(1, pctY));

    setCorners(prev => {
      const next = [...prev];
      next[draggingIndex] = { x: pctX, y: pctY };
      return next;
    });
  }, [draggingIndex]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (draggingIndex === null || !imageRef.current || !containerRef.current || e.touches.length === 0) return;
    
    // Lock viewport to prevent scrolling or rubber-banding while cropping
    if (e.cancelable) {
      e.preventDefault();
    }
    e.stopPropagation();

    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    let pctX = (touch.clientX - rect.left) / rect.width;
    let pctY = (touch.clientY - rect.top) / rect.height;

    pctX = Math.max(0, Math.min(1, pctX));
    pctY = Math.max(0, Math.min(1, pctY));

    setCorners(prev => {
      const next = [...prev];
      next[draggingIndex] = { x: pctX, y: pctY };
      return next;
    });
  }, [draggingIndex]);

  const handleMouseUp = useCallback(() => {
    if (draggingIndex !== null) {
      // Sync manual coordinate modification back into session page cache
      saveCurrentPageState(currentPage, { corners });
      setDraggingIndex(null);
    }
  }, [draggingIndex, currentPage, corners]);

  useEffect(() => {
    if (draggingIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [draggingIndex, handleMouseMove, handleTouchMove, handleMouseUp]);

  // Force automatic re-detect on demand
  const handleAutoDetectClick = () => {
    if (!sourceImage) return;
    const tempImg = new Image();
    tempImg.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = tempImg.naturalWidth;
      canvas.height = tempImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(tempImg, 0, 0);
        runAutoDetect(canvas);
      }
    };
    tempImg.src = sourceImage;
  };

  // Perform Perspective Crop Warp
  const handleApplyCrop = async () => {
    if (!checkOpenCVReady() || !sourceImage || corners.length !== 4) return;

    let src: any = null;
    let srcMat: any = null;
    let dstMat: any = null;
    let M: any = null;
    let dst: any = null;

    try {
      setProcessing(true);
      setProgressText('Recalculating 3D perspective projection and flattening canvas...');

      const tempImg = new Image();
      const loadPromise = new Promise<void>((resolve, reject) => {
        tempImg.onload = () => resolve();
        tempImg.onerror = (e) => reject(e);
        tempImg.src = sourceImage;
      });
      await loadPromise;

      const cv = (window as any).cv;
      src = cv.imread(tempImg);

      // Re-scale percentage coordinates into raw dimensions
      const [tlPct, trPct, brPct, blPct] = corners;
      const tl = { x: tlPct.x * originalSize.width, y: tlPct.y * originalSize.height };
      const tr = { x: trPct.x * originalSize.width, y: trPct.y * originalSize.height };
      const br = { x: brPct.x * originalSize.width, y: brPct.y * originalSize.height };
      const bl = { x: blPct.x * originalSize.width, y: blPct.y * originalSize.height };

      // 1. Calculate Target Sizing bounds using relative vector distance math
      const widthBottom = Math.sqrt(Math.pow(br.x - bl.x, 2) + Math.pow(br.y - bl.y, 2));
      const widthTop = Math.sqrt(Math.pow(tr.x - tl.x, 2) + Math.pow(tr.y - tl.y, 2));
      const maxWidth = Math.max(widthBottom, widthTop);

      const heightRight = Math.sqrt(Math.pow(tr.x - br.x, 2) + Math.pow(tr.y - br.y, 2));
      const heightLeft = Math.sqrt(Math.pow(tl.x - bl.x, 2) + Math.pow(tl.y - bl.y, 2));
      const maxHeight = Math.max(heightRight, heightLeft);

      const targetWidth = Math.round(maxWidth);
      const targetHeight = Math.round(maxHeight);

      // 2. Maps matrices float arrays
      let srcCoords = [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y
      ];
      srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcCoords);

      let dstCoords = [
        0, 0,
        targetWidth, 0,
        targetWidth, targetHeight,
        0, targetHeight
      ];
      dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstCoords);

      // 3. Perspective grid warp
      M = cv.getPerspectiveTransform(srcMat, dstMat);
      let dsize = new cv.Size(targetWidth, targetHeight);
      dst = new cv.Mat();
      cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

      // 4. Output back onto clean canvas
      const croppedCanvas = document.createElement('canvas');
      cv.imshow(croppedCanvas, dst);

      const outputDataUrl = croppedCanvas.toDataURL('image/png');
      setCroppedWidth(targetWidth);
      setCroppedHeight(targetHeight);
      setCroppedImage(outputDataUrl);

      // Instantly synchronize results back to pages cache
      saveCurrentPageState(currentPage, {
        croppedImage: outputDataUrl,
        croppedWidth: targetWidth,
        croppedHeight: targetHeight,
        filteredImage: outputDataUrl, // default until filter process updates
        filter: 'original'
      });

    } catch (err: any) {
      console.error(err);
      alert('Perspective distortion correction failed: ' + (err.message || err));
    } finally {
      // Clear WebAssembly allocations to guarantee no browser heap crashes
      if (src) src.delete();
      if (srcMat) srcMat.delete();
      if (dstMat) dstMat.delete();
      if (M) M.delete();
      if (dst) dst.delete();

      setProcessing(false);
      setProgressText('');
    }
  };

  // Filter Image Generation
  const processFilterData = async (sourceUrl: string, selectedFilter: FilterType) => {
    if (!checkOpenCVReady() || selectedFilter === 'original') {
      return sourceUrl;
    }
    const cv = (window as any).cv;

    let src: any = null;
    let dst: any = null;
    let gray: any = null;
    let blurred: any = null;

    try {
      const tempImg = new Image();
      tempImg.src = sourceUrl;
      await new Promise<void>((resolve) => {
        tempImg.onload = () => resolve();
      });

      src = cv.imread(tempImg);
      dst = new cv.Mat();

      if (selectedFilter === 'grayscale') {
        cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY, 0);
      } else if (selectedFilter === 'bw') {
        gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        // De-noise via quick Gaussian
        blurred = new cv.Mat();
        let ksize = new cv.Size(5, 5);
        cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

        // Adaptive thresholding converting grey or shadows directly into readable high-contrast print sheet
        cv.adaptiveThreshold(
          blurred,
          dst,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          15,
          3
        );
      } else if (selectedFilter === 'magic-color') {
        // Whitens backgrounds while saturating document elements to make printed texts signature layers pop
        // src.convertTo(dst, rtype, alpha, beta) (alpha: contrast multiplier, beta: brightness boost offset)
        src.convertTo(dst, -1, 1.35, 20);
      }

      const resCanvas = document.createElement('canvas');
      cv.imshow(resCanvas, dst);
      const resultUrl = resCanvas.toDataURL('image/png');
      return resultUrl;
    } catch (err) {
      console.error('Filter execution failed: ', err);
      return sourceUrl;
    } finally {
      if (src) src.delete();
      if (dst) dst.delete();
      if (gray) gray.delete();
      if (blurred) blurred.delete();
    }
  };

  // Sync Adaptive Filter Generation on Crop edits
  useEffect(() => {
    if (!croppedImage) {
      setFilteredImage(null);
      return;
    }

    let active = true;
    const generate = async () => {
      try {
        const filteredUrl = await processFilterData(croppedImage, filter);
        if (active) {
          setFilteredImage(filteredUrl);
          // Sync filtered data to cache state
          saveCurrentPageState(currentPage, {
            filteredImage: filteredUrl,
            filter
          });
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setFilteredImage(croppedImage);
          saveCurrentPageState(currentPage, {
            filteredImage: croppedImage,
            filter
          });
        }
      }
    };

    generate();

    return () => {
      active = false;
    };
  }, [croppedImage, filter]);

  // Navigation handlers with atomic automated caching
  const handleNextPage = async () => {
    if (currentPage < pageCount - 1 && fileUrl) {
      saveCurrentPageState(currentPage, {
        corners,
        croppedImage,
        filteredImage,
        croppedWidth,
        croppedHeight,
        filter
      });
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      await loadPdfPage(fileUrl, nextPage, true);
    }
  };

  const handlePrevPage = async () => {
    if (currentPage > 0 && fileUrl) {
      saveCurrentPageState(currentPage, {
        corners,
        croppedImage,
        filteredImage,
        croppedWidth,
        croppedHeight,
        filter
      });
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      await loadPdfPage(fileUrl, prevPage, true);
    }
  };

  // Downloader: Export active document sheets as clean PNGs
  const handleDownloadPng = () => {
    const activeImage = filteredImage || croppedImage;
    if (!activeImage || !file) return;

    const link = document.createElement('a');
    link.href = activeImage;
    const suffix = filter === 'bw' ? '_scan_bw' : filter === 'grayscale' ? '_scan_gray' : filter === 'magic-color' ? '_scan_magic' : '_scan_cropped';
    const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
    link.download = `${baseName}${suffix}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exporters: Compile ALL annotated/scanned sheets into a master PDF document
  const handleDownloadPdf = async (compileAllPages: boolean = false) => {
    const activeImage = filteredImage || croppedImage;
    if (!file) return;

    try {
      setProcessing(true);
      setProgressText(compileAllPages ? 'Compiling all pages & stitching dynamic perspective transformations...' : 'Stitching current cropped document sheet into PDF...');

      const pdfDoc = await PDFDocument.create();

      if (compileAllPages && fileUrl && pageCount > 1) {
        // Save current active screen prior to full bundle compiling
        saveCurrentPageState(currentPage, {
          corners,
          croppedImage,
          filteredImage,
          croppedWidth,
          croppedHeight,
          filter
        });

        // Initialize background compiler task
        const loadingTask = pdfjsLib.getDocument({ url: fileUrl });
        const doc = await loadingTask.promise;

        for (let i = 0; i < doc.numPages; i++) {
          setProgressText(`Compiling page ${i + 1} of ${doc.numPages}...`);

          let pageDataUrl: string | null = null;
          const cached = i === currentPage ? {
            croppedImage,
            filteredImage
          } : pagesData[i];

          if (cached && (cached.filteredImage || cached.croppedImage)) {
            pageDataUrl = cached.filteredImage || cached.croppedImage;
          } else {
            // Lazy render un-edited sheets as is to maintain document cohesion
            const page = await doc.getPage(i + 1);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              await page.render({ canvasContext: ctx, viewport } as any).promise;
              pageDataUrl = canvas.toDataURL('image/png');
            }
          }

          if (pageDataUrl) {
            const response = await fetch(pageDataUrl);
            const arrayBuffer = await response.arrayBuffer();
            const embeddedPng = await pdfDoc.embedPng(arrayBuffer);
            const { width, height } = embeddedPng.scale(1.0);

            const pdfPage = pdfDoc.addPage([width, height]);
            pdfPage.drawImage(embeddedPng, {
              x: 0,
              y: 0,
              width,
              height
            });
          }
        }
      } else {
        // Single page target compiling
        if (!activeImage) {
          alert('Please flatten and crop the current document boundary first.');
          return;
        }
        const response = await fetch(activeImage);
        const arrayBuffer = await response.arrayBuffer();

        const embeddedPng = await pdfDoc.embedPng(arrayBuffer);
        const { width, height } = embeddedPng.scale(1.0);

        const page = pdfDoc.addPage([width, height]);
        page.drawImage(embeddedPng, {
          x: 0,
          y: 0,
          width,
          height
        });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const pdfLocalUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = pdfLocalUrl;
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const targetSuffix = compileAllPages ? '_full_scanned' : '_scanned';
      link.download = `${baseName}${targetSuffix}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => URL.revokeObjectURL(pdfLocalUrl), 2000);
    } catch (err: any) {
      console.error(err);
      alert('Failed to compile PDF document: ' + (err.message || err));
    } finally {
      setProcessing(false);
      setProgressText('');
    }
  };

  // SVG coordinate multipliers for rendering percentages on dynamic elements
  const scaleX = displaySize.width || 1;
  const scaleY = displaySize.height || 1;

  // Poly points coordinate string
  const polygonPointsString = corners.map(pt => `${pt.x * scaleX},${pt.y * scaleY}`).join(' ');

  if (opencvLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs select-none">
        <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-5 text-center max-w-sm mx-4">
          <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
          <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-lg">Initializing Machine Learning Engine...</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading dynamic computer vision models for image alignment and auto-crop borders...</p>
        </div>
      </div>
    );
  }

  if (opencvError) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center text-rose-600">
          <Loader2 className="w-6 h-6 animate-pulse" />
        </div>
        <h4 className="font-extrabold text-slate-900 dark:text-white text-lg">Initialization Failed</h4>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {opencvError}
        </p>
        <button
          onClick={onBackToDashboard}
          className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          Back To Dashboard
        </button>
      </div>
    );
  }

  return (
    <div id="smart-scanner-root" className="container mx-auto max-w-6xl space-y-6 py-2">
      {/* Upper Navigation Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToDashboard}
            className="p-2 rounded-lg border border-slate-250 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title="Return to Dashboard menu"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] px-2 py-0.5 rounded font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 uppercase tracking-wider">
                Premium Engine
              </span>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
                Smart Doc Scanner & Crop
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Clean yellowing tones, correct skewing perspectives, and generate pristine high-contrast document scans.
            </p>
          </div>
        </div>

        {/* OpenCV WebAssembly state pill */}
        <div className="flex items-center">
          {opencvLoading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 text-xs text-indigo-700 dark:text-indigo-400 font-medium">
              <span className="w-3.5 h-3.5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin shrink-0"></span>
              Initializing WebAssembly OpenCV Vision Core...
            </div>
          ) : opencvError ? (
            <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-400 font-medium">
              Offline Boundary Engine Active
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              WASM Core Loaded & Active
            </div>
          )}
        </div>
      </div>

      {/* Pure CSS Spinning Ring Overlay to bypass JavaScript thread freezing */}
      {processing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 dark:bg-slate-950/80 backdrop-blur-xs select-none">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4 text-center max-w-sm">
            <div className="w-12 h-12 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
            <h4 className="font-bold text-slate-800 dark:text-slate-100">AI Vision Lab processing</h4>
            <p className="text-xs text-slate-500 transition-all">{progressText || 'Recalculating canvas lines...'}</p>
          </div>
        </div>
      )}

      {/* Main interface workspace */}
      {!file ? (
        <div className="max-w-xl mx-auto py-8">
          <FileUploadArea
            onFileSelected={handleFileSelected}
            accept={{
              'application/pdf': ['.pdf'],
              'image/png': ['.png'],
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/webp': ['.webp']
            }}
            title="Drag & drop your document shots here"
            subtitle="JPG, PNG, WEBP images or multipage PDF documents"
          />
          
          <div className="mt-8 rounded-xl bg-slate-50 dark:bg-slate-900/45 p-5 border border-slate-200 dark:border-slate-800 space-y-3.5 block select-none">
            <h3 className="text-sm font-bold text-slate-850 dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" /> Professional-grade scanner logic:
            </h3>
            <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-2.5 leading-relaxed list-decimal list-inside">
              <li>Upload photos containing tilted angles, skewing perspective, or low contrast.</li>
              <li>WASM OpenCV auto-calculates boundary points dynamically within milliseconds.</li>
              <li>Tweak corner nodes easily. Target positions are fully responsive to screen orientation and resize events.</li>
              <li>Select filters to whiten paper backgrounds and optimize printer ink consumption!</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Column */}
          <div className="lg:col-span-4 space-y-6">
            {/* Sizing & Document Details card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Target File Loaded
                </span>
                <button
                  onClick={() => {
                    setFile(null);
                    setSourceImage(null);
                    setCroppedImage(null);
                    setFilteredImage(null);
                    setPagesData({});
                  }}
                  className="text-xs text-rose-600 hover:underline font-semibold"
                >
                  Clear File
                </button>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg shrink-0">
                  <FileText className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-200 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB • {pageCount} {pageCount === 1 ? 'page' : 'pages'}
                  </p>
                </div>
              </div>

              {/* Multi Page pdf controller */}
              {pageCount > 1 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 0 || processing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 disabled:opacity-50 text-xs font-bold transition-all cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Previous
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                    Page {currentPage + 1} of {pageCount}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={currentPage === pageCount - 1 || processing}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 disabled:opacity-50 text-xs font-bold transition-all cursor-pointer"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Steps & Commands card */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
              {!croppedImage ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-150 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-xs">
                      1
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      Step 1: Frame Boundary
                    </h3>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                    Finetune the 4 draggable corner targets on the visual sheet. The boundaries scale dynamically and respond perfectly to screen size adjustments.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                    <button
                      onClick={handleAutoDetectClick}
                      disabled={!opencvLoaded}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-emerald-200 dark:border-emerald-950/40 bg-emerald-50/40 dark:bg-emerald-950/10 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-bold text-xs cursor-pointer transition-colors"
                    >
                      <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      Auto-Detect
                    </button>
                    <button
                      onClick={generateDefaultCorners}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" /> Reset
                    </button>
                  </div>

                  <button
                    onClick={handleApplyCrop}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm text-sm cursor-pointer transition-colors"
                  >
                    <Crop className="w-4 h-4" /> Flatten & Crop Perspective
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-150 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-xs">
                      2
                    </span>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                      Step 2: Clean & Filter
                    </h3>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-normal">
                    Choose styling filters to remove environmental shadow gradients and improve printer readability.
                  </p>

                  {/* Filter Select grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setFilter('original')}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border text-center cursor-pointer transition-all ${
                        filter === 'original'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Original
                    </button>
                    <button
                      onClick={() => setFilter('grayscale')}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border text-center cursor-pointer transition-all ${
                        filter === 'grayscale'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Grayscale
                    </button>
                    <button
                      onClick={() => setFilter('bw')}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border text-center cursor-pointer transition-all ${
                        filter === 'bw'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Magic B&W
                    </button>
                    <button
                      onClick={() => setFilter('magic-color')}
                      className={`px-3 py-2 text-xs font-bold rounded-lg border text-center cursor-pointer transition-all relative ${
                        filter === 'magic-color'
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <span className="absolute -top-1.5 -right-1 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Magic Color
                    </button>
                  </div>

                  <div className="rounded-lg bg-slate-55 border border-slate-100 p-2.5 dark:bg-slate-950/25 dark:border-slate-850">
                    <p className="text-[10px] text-slate-500 italic flex items-center gap-1.5 leading-snug">
                      <Sparkle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      {filter === 'bw' 
                        ? 'Adaptive Gaussian limits noise spots and renders high-definition print text.' 
                        : filter === 'magic-color' 
                        ? 'Preserves colored signatures, seals, or ink drawings while whitening standard margins.'
                        : filter === 'grayscale' 
                        ? 'Removes blue, green, and red hues into absolute black-and-grey gradients.' 
                        : 'Displays native background pixel values without enhancement.'}
                    </p>
                  </div>

                  {/* Multi-page vs single page compiling triggers */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    {pageCount > 1 && (
                      <button
                        onClick={() => handleDownloadPdf(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg shadow cursor-pointer transition-all"
                      >
                        <FileCheck2 className="w-4 h-4 animate-bounce" /> Export Full Document ({pageCount} pages)
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadPdf(false)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 dark:bg-slate-800 hover:opacity-90 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer transition-all"
                    >
                      <FileDown className="w-4 h-4 text-emerald-500" /> Export Current Page PDF
                    </button>
                    <button
                      onClick={handleDownloadPng}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-250 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-lg cursor-pointer transition-colors"
                    >
                      <Download className="w-4 h-4" /> Download as PNG
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setCroppedImage(null);
                      setFilteredImage(null);
                      setFilter('original');
                      if (sourceImage) {
                        const img = new Image();
                        img.onload = () => {
                          setOriginalSize({ width: img.naturalWidth, height: img.naturalHeight });
                          generateDefaultCorners();
                        };
                        img.src = sourceImage;
                      }
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1" /> Re-scan / Adjust corners
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Workspace Area */}
          <div className="lg:col-span-8 flex flex-col items-center justify-center bg-slate-100/50 dark:bg-slate-950/40 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 min-h-[500px]">
            {!croppedImage ? (
              <div className="space-y-4 text-center flex flex-col items-center">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-1.5 shadow-xs select-none">
                  <Maximize className="w-3.5 h-3.5 text-emerald-500" /> 
                  ALIGN COORDINATE HANDLES TO PAGES
                </span>

                {sourceImage && (
                  <div 
                    className="relative inline-block max-w-full max-h-[60vh] shadow-lg rounded-lg overflow-hidden select-none" 
                    ref={containerRef}
                  >
                    <img
                      ref={imageRef}
                      src={sourceImage}
                      onLoad={updateDisplaySize}
                      className="block max-h-[60vh] max-w-full h-auto w-auto pointer-events-none select-none"
                      alt="Source document preview"
                    />

                    {/* Draggable vector handles overlay */}
                    {displaySize.width > 0 && displaySize.height > 0 && corners.length === 4 && (
                      <svg
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                        width={displaySize.width}
                        height={displaySize.height}
                      >
                        {/* Interactive quadrilateral boundary box connecting point vectors */}
                        <polygon
                          points={polygonPointsString}
                          className="fill-emerald-500/10 stroke-emerald-500 stroke-[3] cursor-default transition-all"
                          style={{ strokeDasharray: '6 4' }}
                        />

                        {/* Interactive drag node controls */}
                        {corners.map((pt, idx) => (
                          <g key={idx}>
                            {/* Inner circle handle shadow */}
                            <circle
                              cx={pt.x * scaleX}
                              cy={pt.y * scaleY}
                              r="16"
                              className="fill-transparent hover:fill-emerald-500/20 active:fill-emerald-500/35 cursor-move transition-colors duration-150 pointer-events-auto"
                              style={{ pointerEvents: 'auto' }}
                              onMouseDown={(e) => handleMouseDown(idx, e)}
                              onTouchStart={(e) => handleTouchStart(idx, e)}
                            />
                            {/* Stylized visible point indicator */}
                            <circle
                              cx={pt.x * scaleX}
                              cy={pt.y * scaleY}
                              r="7"
                              className="fill-emerald-600 stroke-white stroke-2 shadow-md pointer-events-none"
                            />
                            {/* Visual tag overlay */}
                            <text
                              x={pt.x * scaleX}
                              y={pt.y * scaleY - 14}
                              className="text-[10px] font-extrabold fill-emerald-800 dark:fill-emerald-400 font-mono select-none pointer-events-none shadow"
                              textAnchor="middle"
                            >
                              {idx === 0 ? 'TL' : idx === 1 ? 'TR' : idx === 2 ? 'BR' : 'BL'}
                            </text>
                          </g>
                        ))}
                      </svg>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-center flex flex-col items-center select-none">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center gap-1.5 shadow-xs">
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  PERSPECTIVE CORRECTED SCAN ({croppedWidth} x {croppedHeight} px)
                </span>

                <div className="relative inline-block rounded-lg shadow-md bg-white dark:bg-slate-900 p-2 border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <img
                    src={filteredImage || croppedImage}
                    className="max-h-[60vh] max-w-full h-auto w-auto object-contain rounded"
                    alt="Flattened results"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
