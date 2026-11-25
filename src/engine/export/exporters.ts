export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export interface VideoRecordOptions {
  durationMs: number;
  fps?: number;
  onProgress?: (ratio: number) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
}

export function recordCanvasLoop(
  canvas: HTMLCanvasElement,
  options: VideoRecordOptions
): () => void {
  const { durationMs, fps = 30, onProgress, onDone, onError } = options;

  if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
    onError?.('Video recording is not supported in this browser.');
    onDone?.();
    return () => {};
  }

  const candidates: Array<{ mime: string; ext: string }> = [
    { mime: 'video/webm;codecs=vp9', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
  ];

  const picked = candidates.find((c) => MediaRecorder.isTypeSupported(c.mime));
  if (!picked) {
    onError?.('No supported WebM or MP4 video codec found in this browser.');
    onDone?.();
    return () => {};
  }

  let recorder: MediaRecorder;
  try {
    const stream = canvas.captureStream(fps);
    recorder = new MediaRecorder(stream, {
      mimeType: picked.mime,
      videoBitsPerSecond: 7_500_000,
    });
  } catch {
    onError?.('Failed to start MediaRecorder capture stream.');
    onDone?.();
    return () => {};
  }

  const chunks: BlobPart[] = [];
  const startedAt = performance.now();
  const progressTimer = window.setInterval(() => {
    if (durationMs > 0) {
      onProgress?.(Math.min(1, (performance.now() - startedAt) / durationMs));
    }
  }, 100);

  recorder.ondataavailable = (ev) => {
    if (ev.data.size > 0) chunks.push(ev.data);
  };

  recorder.onstop = () => {
    window.clearInterval(progressTimer);
    onProgress?.(0);
    if (chunks.length > 0) {
      downloadBlob(
        new Blob(chunks, { type: picked.mime }),
        `glyphstage-${Date.now()}.${picked.ext}`
      );
    }
    onDone?.();
  };

  recorder.start(250);
  const stopTimer =
    durationMs > 0
      ? window.setTimeout(() => {
          if (recorder.state !== 'inactive') recorder.stop();
        }, durationMs)
      : null;

  return () => {
    if (stopTimer !== null) window.clearTimeout(stopTimer);
    window.clearInterval(progressTimer);
    if (recorder.state !== 'inactive') recorder.stop();
  };
}
