import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportIssueModal } from "../ReportIssueModal";
import { SearchBar } from "../SearchBar";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

describe("accessibility-critical flows", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("labels the issue form and closes the dialog with Escape", () => {
    const onClose = vi.fn();
    render(
      <ReportIssueModal
        open
        onClose={onClose}
        errorSummary="Request failed"
        onSubmit={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Report an issue" });
    expect(screen.getByRole("textbox", { name: "Additional details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close report issue dialog" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("supports arrow-key selection and Enter in profile search", async () => {
    vi.useFakeTimers();
    render(<SearchBar />);
    const input = screen.getByRole("combobox", { name: "Search profiles" });

    fireEvent.change(input, { target: { value: "alex" } });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", "profile-result-1");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/profile/alex");
    vi.useRealTimers();
  });
});
