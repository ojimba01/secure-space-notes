// Speech to text that stays on this computer.
//
// Staff may say a client's name, and a browser's ordinary speech recognition
// sends the audio to the browser maker's servers, which no HIPAA agreement
// covers. So dictation is offered only where the browser can recognise speech
// on the device itself (SpeechRecognition with processLocally, current Chrome
// and Edge); anywhere else the mic is not shown at all.
import { useCallback, useEffect, useRef, useState } from 'react';

// The on-device options are newer than TypeScript's DOM types.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Status = 'unsupported' | 'unchecked' | 'checking' | 'ready' | 'needs-download' | 'downloading' | 'listening' | 'unavailable';

const OPTIONS = { langs: ['en-US'], processLocally: true };

const Recognition = (): any =>
  typeof window === 'undefined' ? null : (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;

export function useOnDeviceDictation(onText: (text: string, final: boolean) => void) {
  const [status, setStatus] = useState<Status>('unsupported');
  const rec = useRef<any>(null);
  const textRef = useRef(onText);
  textRef.current = onText;

  // Only whether the browser has the on-device option, at first. Asking whether
  // it is ready waits for the first press of the mic: some browsers fail hard
  // on that question, and a page load must never depend on it.
  useEffect(() => {
    const SR = Recognition();
    if (SR && typeof SR.available === 'function') setStatus('unchecked');
    return () => rec.current?.abort?.();
  }, []);

  const listen = useCallback(() => {
    const SR = Recognition();
    const r = new SR();
    r.lang = 'en-US';
    r.interimResults = true;
    r.continuous = false;
    // Never fall back to the browser maker's servers.
    r.processLocally = true;
    r.onresult = (e: any) => {
      let text = '';
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      textRef.current(text, final);
    };
    r.onend = () => setStatus('ready');
    r.onerror = () => setStatus('ready');
    rec.current = r;
    setStatus('listening');
    r.start();
  }, []);

  const start = useCallback(async () => {
    const SR = Recognition();
    if (!SR) return;
    if (status === 'unchecked' || status === 'unavailable') {
      setStatus('checking');
      let a = 'unavailable';
      try {
        a = await SR.available(OPTIONS);
      } catch {
        // Treated as unavailable.
      }
      if (a === 'available') return listen();
      setStatus(a === 'downloadable' ? 'needs-download' : a === 'downloading' ? 'downloading' : 'unavailable');
      return;
    }
    if (status === 'needs-download') {
      setStatus('downloading');
      try {
        const ok = await SR.install(OPTIONS);
        setStatus(ok ? 'ready' : 'needs-download');
      } catch {
        setStatus('needs-download');
      }
      return;
    }
    if (status === 'ready') listen();
  }, [status, listen]);

  const stop = useCallback(() => {
    rec.current?.stop?.();
  }, []);

  return { status, start, stop, supported: status !== 'unsupported' };
}
