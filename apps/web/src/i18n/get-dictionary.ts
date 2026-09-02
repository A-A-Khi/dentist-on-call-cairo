import type { Locale } from "./config";
import en from "./dictionaries/en.json";
import ar from "./dictionaries/ar.json";

const dictionaries = {
  en,
  ar,
};

export type Dictionary = typeof en;

export function getDictionarySync(locale: string): Dictionary {
  const normalizedLocale = (locale in dictionaries ? locale : "en") as Locale;
  return dictionaries[normalizedLocale];
}

export async function getDictionary(locale: string): Promise<Dictionary> {
  return getDictionarySync(locale);
}
