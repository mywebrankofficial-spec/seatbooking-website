'use client';
/**
 * Optional real trailer: if `/media/trailer.mp4` exists (one HEAD request per
 * session), play it muted/looping on the screen. The procedural film stays
 * until the video actually plays (autoplay blocked => shader keeps running).
 */
import { useEffect } from 'react';
import { SRGBColorSpace, VideoTexture } from 'three';
import type { HallScene } from './hallScene';

/**
 * Opt-in: set NEXT_PUBLIC_TRAILER_URL (e.g. "/media/trailer.mp4") to play a real clip.
 * Without it the procedural desert film is used and no request is made (so a
 * missing file never shows up as a 404 in the console).
 */
export const TRAILER_URL = process.env.NEXT_PUBLIC_TRAILER_URL ?? '';

let probe: Promise<boolean> | null = null;

function trailerExists(): Promise<boolean> {
  if (!TRAILER_URL) return Promise.resolve(false);
  if (!probe) {
    probe = fetch(TRAILER_URL, { method: 'HEAD' })
      .then((res) => {
        const type = res.headers.get('content-type') ?? '';
        return res.ok && (type === '' || type.startsWith('video/') || type === 'application/octet-stream');
      })
      .catch(() => false);
  }
  return probe;
}

export function useTrailerVideo(hall: HallScene): void {
  useEffect(() => {
    let cancelled = false;
    let video: HTMLVideoElement | null = null;
    let texture: VideoTexture | null = null;

    const onPlaying = () => {
      if (cancelled || !video || texture) return;
      texture = new VideoTexture(video);
      texture.colorSpace = SRGBColorSpace;
      hall.setVideoTexture(texture);
    };

    void trailerExists().then((ok) => {
      if (!ok || cancelled) return;
      const v = document.createElement('video');
      v.src = TRAILER_URL;
      v.muted = true;
      v.defaultMuted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      v.preload = 'auto';
      v.crossOrigin = 'anonymous';
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.addEventListener('playing', onPlaying);
      video = v;
      v.play().catch(() => {
        /* autoplay refused: keep the procedural film */
      });
    });

    return () => {
      cancelled = true;
      if (video) {
        video.removeEventListener('playing', onPlaying);
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (texture) {
        hall.setVideoTexture(null);
        texture.dispose();
      }
    };
  }, [hall]);
}
