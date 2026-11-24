import { Platform } from 'react-native';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(recognitionConstructor());
}

export function isSpeechSynthesisSupported(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Ask for microphone permission explicitly. The stream is closed immediately; only text is kept. */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

export type RecognitionController = {
  start: () => void;
  stop: () => void;
  cancel: () => void;
};

export function createSpeechRecognition(options: {
  lang?: string;
  onTranscript: (text: string, final: boolean) => void;
  onListeningChange: (listening: boolean) => void;
  onError: (message: string) => void;
}): RecognitionController | null {
  const Constructor = recognitionConstructor();
  if (!Constructor) return null;

  const recognition = new Constructor();
  recognition.lang = options.lang ?? 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event: any) => {
    let finalText = '';
    let interimText = '';
    const results = event?.results;
    if (!results) return;
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      const value = result?.[0]?.transcript ?? '';
      if (result?.isFinal) finalText += value;
      else interimText += value;
    }
    const text = (finalText || interimText).trim();
    if (text) options.onTranscript(text, Boolean(finalText));
  };

  recognition.onerror = (event: any) => {
    const code = String(event?.error ?? '');
    const messages: Record<string, string> = {
      'not-allowed': 'Microphone access was blocked. Allow it in your browser settings, or type instead.',
      'service-not-allowed': 'Speech recognition is not allowed here. Type your message instead.',
      'no-speech': 'No speech was detected. Try again or type your message.',
      audio_capture: 'Your microphone could not be started. Check your device and try again.',
      network: 'Speech recognition needs a network connection. Type your message instead.',
    };
    options.onListeningChange(false);
    options.onError(messages[code] ?? 'Voice input stopped unexpectedly. You can type instead.');
  };

  recognition.onend = () => options.onListeningChange(false);

  return {
    start: () => {
      options.onListeningChange(true);
      try {
        recognition.start();
      } catch {
        options.onListeningChange(false);
        options.onError('Voice input could not start. Type your message instead.');
      }
    },
    stop: () => {
      try {
        recognition.stop();
      } catch {
        options.onListeningChange(false);
      }
    },
    cancel: () => {
      try {
        recognition.abort();
      } catch {
        options.onListeningChange(false);
      }
    },
  };
}

export type SpeechPlaybackController = {
  play: (text: string) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};

/** Text-to-speech wrapper with real play, pause, resume and stop controls. */
export function createSpeechPlayback(options: {
  onStateChange: (state: 'idle' | 'speaking' | 'paused') => void;
  onError: (message: string) => void;
}): SpeechPlaybackController | null {
  if (!isSpeechSynthesisSupported()) return null;
  const synthesis = window.speechSynthesis;
  let active: SpeechSynthesisUtterance | null = null;

  const finish = () => {
    active = null;
    options.onStateChange('idle');
  };

  return {
    play: (text: string) => {
      const value = text.trim();
      if (!value) return;
      synthesis.cancel();
      active = new SpeechSynthesisUtterance(value);
      active.lang = 'en-US';
      active.rate = 1;
      active.onstart = () => options.onStateChange('speaking');
      active.onend = finish;
      active.onerror = () => {
        finish();
        options.onError('Spoken replies could not be played. You can still read the text.');
      };
      // Set the state before speaking; some browsers do not fire onstart.
      options.onStateChange('speaking');
      try {
        synthesis.speak(active);
      } catch {
        finish();
        options.onError('Spoken replies are unavailable in this browser. You can still read the text.');
      }
    },
    pause: () => {
      if (!active) return;
      synthesis.pause();
      options.onStateChange('paused');
    },
    resume: () => {
      if (!active) return;
      synthesis.resume();
      options.onStateChange('speaking');
    },
    stop: () => {
      synthesis.cancel();
      finish();
    },
  };
}
