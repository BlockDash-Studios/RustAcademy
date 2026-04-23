"use client";

import { useEffect } from "react";

export function useFocusPreview() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const targetId = searchParams.get("focus");
    if (!targetId) {
      return;
    }

    const target = document.getElementById(targetId);
    if (!target) {
      return;
    }

    document
      .querySelectorAll<HTMLElement>("[data-force-focus-visible='true']")
      .forEach((element) =>
        element.removeAttribute("data-force-focus-visible"),
      );

    target.setAttribute("data-force-focus-visible", "true");
    target.scrollIntoView({ behavior: "auto", block: "center" });
    target.focus();

    return () => {
      target.removeAttribute("data-force-focus-visible");
    };
  }, []);
}
