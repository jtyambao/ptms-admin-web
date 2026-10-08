'use client';

import { Camera, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ExpandableText } from '@/components/page-layout';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// One full-size photo viewer for the whole portal (Checkpoint Scans, the
// Dashboard's rounds / OIC / reports details): Previous / Next buttons, the
// arrow keys, swipe on a phone, an "Open full size" link, and a plain
// "link expired" message with a Refresh when the short-lived signed link has
// run out. The caller owns the list and which photo is open.
export interface ViewerPhoto {
  url: string;
  title: string;
  subtitle: string;
  note?: string | null;
}

export function PhotoViewer({
  photos, index, onIndexChange, onClose, onRefresh,
}: {
  photos: ViewerPhoto[];
  index: number | null;
  onIndexChange: (next: number) => void;
  onClose: () => void;
  onRefresh?: () => void;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const current = index !== null ? photos[index] : undefined;

  function step(direction: 1 | -1) {
    if (index === null) return;
    const next = index + direction;
    if (next >= 0 && next < photos.length) { setPhotoFailed(false); onIndexChange(next); }
  }

  useEffect(() => {
    if (index === null) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') step(1);
      else if (event.key === 'ArrowLeft') step(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length]);

  return (
    <Dialog onOpenChange={(open) => { if (!open) { setPhotoFailed(false); onClose(); } }} open={index !== null && !!current}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="size-4" />{current?.title ?? 'Photo'}</DialogTitle>
          <DialogDescription>
            {current?.subtitle}
            {photos.length > 1 && index !== null ? ` · photo ${index + 1} of ${photos.length}` : ''}
          </DialogDescription>
        </DialogHeader>
        {current && (
          <div
            className="grid place-items-center overflow-hidden rounded-xl border bg-black"
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start === null) return;
              const delta = event.changedTouches[0].clientX - start;
              if (Math.abs(delta) > 50) step(delta < 0 ? 1 : -1);
            }}
            onTouchStart={(event) => { touchStartX.current = event.touches[0].clientX; }}
          >
            {photoFailed ? (
              <div className="grid gap-3 p-10 text-center text-sm text-white">
                <p>This photo link has expired.</p>
                {onRefresh && <Button onClick={() => { setPhotoFailed(false); onRefresh(); }} variant="secondary">Refresh the photo</Button>}
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={`Photo: ${current.title}`} className="max-h-[65dvh] w-auto max-w-full object-contain" onError={() => setPhotoFailed(true)} src={current.url} />
            )}
          </div>
        )}
        {current?.note && <div className="text-sm"><ExpandableText text={current.note} /></div>}
        <div className="flex items-center justify-between gap-2">
          <Button disabled={index === null || index <= 0} onClick={() => step(-1)} variant="outline"><ChevronLeft />Previous</Button>
          {current && (
            <a className="inline-flex items-center gap-1 text-sm font-bold text-[#e86405] hover:underline" href={current.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-4" />Open full size
            </a>
          )}
          <Button disabled={index === null || index >= photos.length - 1} onClick={() => step(1)} variant="outline">Next<ChevronRight /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
