"use client";
import { createElement, useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";
import { translateText } from "@/lib/ai-client";
import { interfaceText } from '@/lib/ui-kannada';

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let running = 0;
function scheduledTranslate(text: string, target: string, source: string) {
  return new Promise<string | null>((resolve, reject) => {
    const start = () => {
      running++;
      translateText(text, target, source).then(resolve, reject).finally(() => {
        running--;
        queue.shift()?.();
      });
    };
    if (running < 2) start(); else queue.push(start);
  });
}

export function useTranslation(text: string, preferred?: string) {
  const appLanguage = useAppStore(s => s.lang);
  const lang = preferred || appLanguage;
  const [state, setState] = useState({ input: text, language: lang, text, pending: false, error: '' });
  useEffect(() => {
    let alive = true;
    const update = (value: { text: string; pending: boolean; error: string }) => {
      if (alive) setState({ input: text, language: lang, ...value });
    };
    const kannadaLetters = text.match(/[\u0c80-\u0cff]/g)?.length || 0;
    const latinLetters = text.match(/[a-z]/gi)?.length || 0;
    const source = kannadaLetters > latinLetters ? 'kn' : 'en';
    const local = interfaceText(lang, text);
    if (!text.trim() || local !== text || source === lang) {
      update({ text: local, pending: false, error: '' }); return;
    }
    const key = `${lang}:${text}`;
    const cached = cache.get(key);
    if (cached) { update({ text: cached, pending: false, error: '' }); return; }
    update({ text, pending: true, error: '' });
    let request = pending.get(key);
    if (!request) {
      request = scheduledTranslate(text, lang, source).then(result => {
        // Official numeric identifiers must survive display translation.
        const identifiers = text.match(/\d{5,}|\b[A-Z]{2}\d{2}[A-Z]{1,3}\d{4}\b/g) || [];
        if (!result || identifiers.some(id => !result.includes(id)) || (lang === 'kn' && !/[\u0c80-\u0cff]/.test(result))) return null;
        cache.set(key, result);
        if (cache.size > 300) cache.delete(cache.keys().next().value!);
        return result;
      }).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    request.then(result => update({ text: result || text, pending: false, error: result ? '' : lang === 'kn' ? 'ಕನ್ನಡ ಅನುವಾದ ಈಗ ಲಭ್ಯವಿಲ್ಲ; ಮೂಲ ಉತ್ತರವನ್ನು ತೋರಿಸಲಾಗಿದೆ.' : 'Translation is unavailable; showing the original answer.' }))
      .catch(() => update({ text, pending: false, error: lang === 'kn' ? 'ಕನ್ನಡ ಅನುವಾದ ಈಗ ಲಭ್ಯವಿಲ್ಲ; ಮೂಲ ಉತ್ತರವನ್ನು ತೋರಿಸಲಾಗಿದೆ.' : 'Translation is unavailable; showing the original answer.' }));
    return () => { alive = false; };
  }, [lang, text]);
  return state.input === text && state.language === lang ? state : { text, pending: true, error: '' };
}

export function useTranslated(text: string): string { return useTranslation(text).text; }
export function Translated({ text, as = 'span', className }: { text: string; as?: keyof JSX.IntrinsicElements; className?: string }) {
  return createElement(as, className ? { className } : undefined, useTranslated(text));
}
export default Translated;
