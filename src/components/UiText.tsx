"use client";
import { useAppStore } from '@/store/useAppStore';
import { interfaceText } from '@/lib/ui-kannada';
import type { ReactNode } from 'react';

/** Local dictionary rendering, without extra DOM elements or remote requests. */
export function UiText({ text }: { text: ReactNode }) {
  const lang = useAppStore(state => state.lang);
  const translate = (value: ReactNode): ReactNode => typeof value === 'string'
    ? interfaceText(lang, value) : Array.isArray(value) ? value.map(translate) : value;
  return <>{translate(text)}</>;
}

export function useUiText() {
  const lang = useAppStore(state => state.lang);
  return (text: string) => interfaceText(lang, text);
}

export function useUiLocale() {
  return useAppStore(state => state.lang === 'kn' ? 'kn-IN' : 'en-IN');
}
