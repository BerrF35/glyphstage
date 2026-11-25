import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaKind } from '@/types/studio';

export interface MediaInputController {
  mediaLabel: string;
  webcamActive: boolean;
  hasVideo: boolean;
  videoPlaying: boolean;
  videoProgress: number;
  videoDuration: number;
  error: string | null;
  loadFile: (file: File) => void;
  toggleWebcam: () => Promise<void>;
  toggleVideoPlay: () => void;
  seekVideo: (fraction: number) => void;
  stopLiveMedia: () => void;
}

export function useMediaInput(options: {
  onImageLoaded: (img: HTMLImageElement, label: string) => void;
  onVideoLoaded: (video: HTMLVideoElement, kind: MediaKind, label: string) => void;
  onStopMedia: () => void;
}): MediaInputController {
  const { onImageLoaded, onVideoLoaded, onStopMedia } = options;
  const [mediaLabel, setMediaLabel] = useState('Oculus Dome');
  const [webcamActive, setWebcamActive] = useState(false);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupLive = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute('src');
      videoRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setWebcamActive(false);
    setHasVideo(false);
    setVideoPlaying(false);
    setVideoProgress(0);
    setVideoDuration(0);
  }, []);

  const stopLiveMedia = useCallback(() => {
    cleanupLive();
    setError(null);
    onStopMedia();
  }, [cleanupLive, onStopMedia]);

  const toggleVideoPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || webcamActive) return;
    if (v.paused) {
      v.play().then(() => setVideoPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setVideoPlaying(false);
    }
  }, [webcamActive]);

  const seekVideo = useCallback((fraction: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const clamped = Math.max(0, Math.min(1, fraction));
    v.currentTime = clamped * v.duration;
    setVideoProgress(clamped);
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      setError(null);
      if (file.type.startsWith('image/')) {
        cleanupLive();
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        const img = new Image();
        img.onload = () => {
          setMediaLabel(file.name);
          onImageLoaded(img, file.name);
        };
        img.onerror = () => setError('Could not decode image file.');
        img.src = url;
        return;
      }

      if (file.type.startsWith('video/')) {
        cleanupLive();
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        const video = document.createElement('video');
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.ontimeupdate = () => {
          if (Number.isFinite(video.duration) && video.duration > 0) {
            setVideoProgress(video.currentTime / video.duration);
          }
        };
        video.onloadeddata = () => {
          video.play().then(() => setVideoPlaying(true)).catch(() => {});
          videoRef.current = video;
          setHasVideo(true);
          setVideoDuration(Number.isFinite(video.duration) ? video.duration : 0);
          setMediaLabel(file.name);
          onVideoLoaded(video, 'video', file.name);
        };
        video.onerror = () => setError('Could not play video file.');
        return;
      }

      setError('Unsupported file type. Use PNG, JPG, WebP, MP4, or WebM.');
    },
    [cleanupLive, onImageLoaded, onVideoLoaded]
  );

  const toggleWebcam = useCallback(async () => {
    setError(null);
    if (webcamActive) {
      stopLiveMedia();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera API unavailable in this browser context.');
      return;
    }

    try {
      cleanupLive();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      streamRef.current = stream;
      videoRef.current = video;
      setWebcamActive(true);
      setMediaLabel('Live Camera');
      onVideoLoaded(video, 'webcam', 'Live Camera');
    } catch {
      setError('Camera permission denied or no camera detected.');
    }
  }, [webcamActive, cleanupLive, onVideoLoaded, stopLiveMedia]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            loadFile(new File([blob], 'Clipboard Image', { type: blob.type }));
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  useEffect(() => cleanupLive, [cleanupLive]);

  return {
    mediaLabel,
    webcamActive,
    hasVideo,
    videoPlaying,
    videoProgress,
    videoDuration,
    error,
    loadFile,
    toggleWebcam,
    toggleVideoPlay,
    seekVideo,
    stopLiveMedia,
  };
}
