import React, { useEffect, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import '@/lib/pdfWorker';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface PDFPreviewProps {
  fileUrl: string;
  fileName: string;
}

/**
 * Read a document, rather than page through one.
 *
 * Every page is rendered in one column and the whole thing scrolls, because
 * reading a form means running your eye down it. Paging with Previous and
 * Next made you click nine times to check whether a signature was on the last
 * page, and made searching a document with your eyes impossible.
 *
 * The page counter still says where you are — it follows the scroll rather
 * than driving it.
 */
export const PDFPreview: React.FC<PDFPreviewProps> = ({ fileUrl, fileName }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [visiblePage, setVisiblePage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setVisiblePage(1);
    pageRefs.current = new Array(numPages).fill(null);
  };

  // Whichever page covers the middle of the viewport is the one you are
  // reading, which is a truer answer than "the last one scrolled past".
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;

    const onScroll = () => {
      const middle = root.scrollTop + root.clientHeight / 2;
      let current = 1;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (el && el.offsetTop <= middle) current = i + 1;
      }
      setVisiblePage(current);
    };

    root.addEventListener('scroll', onScroll, { passive: true });
    return () => root.removeEventListener('scroll', onScroll);
  }, [numPages]);

  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 2.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-4 p-4 bg-muted rounded-lg shrink-0">
        <span className="text-sm text-muted-foreground">
          {numPages > 0 ? `Page ${visiblePage} of ${numPages}` : 'Loading'}
        </span>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={zoomOut} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm tabular-nums">{Math.round(scale * 100)}%</span>
          <Button variant="outline" size="sm" onClick={zoomIn} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-auto bg-muted/30 rounded-lg p-4"
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={<div className="text-center py-8">Loading the document.</div>}
          error={
            <div className="text-center py-8 text-destructive">
              This document could not be opened.
            </div>
          }
          className="flex flex-col items-center gap-4"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                pageRefs.current[i] = el;
              }}
              className="shadow-sm"
            >
              <Page
                pageNumber={i + 1}
                scale={scale}
                renderTextLayer
                renderAnnotationLayer
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
};
