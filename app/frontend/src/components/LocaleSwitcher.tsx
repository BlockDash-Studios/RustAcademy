'use client';

import "@/lib/i18n";
import { useTranslation } from "react-i18next";

export function LocaleSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      aria-label={t("changeLanguage")}
      value={i18n.language}
      onChange={(event) => i18n.changeLanguage(event.target.value)}
      className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-1 text-sm text-white"
    >
      <option value="en">English</option>
      <option value="es">Español</option>
      <option value="fr">Français</option>
    </select>
  );
}
