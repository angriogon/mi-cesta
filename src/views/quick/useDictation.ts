import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechCtor = new () => SpeechRecognitionLike;

/** Dictado en español con el reconocimiento de voz del navegador (si existe). */
export function useDictation({
  onText,
  onStatus,
}: {
  onText: (text: string) => void;
  onStatus: (message: string) => void;
}) {
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => () => recognition.current?.stop(), []);

  function toggle() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const scope = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Speech = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Speech) {
      onStatus(
        "El dictado no está disponible en este navegador. Usa el micrófono del teclado y separa los productos con comas.",
      );
      return;
    }
    const instance = new Speech();
    instance.lang = "es-ES";
    instance.continuous = false;
    instance.interimResults = false;
    instance.onresult = (event) =>
      onText(
        Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" "),
      );
    instance.onend = () => setListening(false);
    instance.onerror = () => {
      setListening(false);
      onStatus("No se ha entendido el dictado. Puedes repetirlo o escribirlo.");
    };
    recognition.current = instance;
    setListening(true);
    instance.start();
  }

  return { listening, toggle };
}
