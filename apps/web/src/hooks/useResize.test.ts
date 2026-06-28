import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResize } from "./useResize";

describe("useResize", () => {
  it("bord droit => opération endDate décalée du delta de jours", () => {
    const onOperation = vi.fn();
    const { result } = renderHook(() => useResize(40, onOperation, "u1"));

    act(() => result.current.onResizeStart("t1", "right", 100, "2026-06-11"));
    act(() => result.current.onResizeEnd(180)); // +80px / 40 => +2 jours

    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ field: "endDate", value: "2026-06-13", ticketId: "t1" }),
    );
  });

  it("bord gauche => opération startDate", () => {
    const onOperation = vi.fn();
    const { result } = renderHook(() => useResize(40, onOperation, "u1"));

    act(() => result.current.onResizeStart("t1", "left", 100, "2026-06-10"));
    act(() => result.current.onResizeEnd(60)); // -40px / 40 => -1 jour

    expect(onOperation).toHaveBeenCalledWith(
      expect.objectContaining({ field: "startDate", value: "2026-06-09" }),
    );
  });

  it("delta nul => pas d'opération", () => {
    const onOperation = vi.fn();
    const { result } = renderHook(() => useResize(40, onOperation, "u1"));
    act(() => result.current.onResizeStart("t1", "right", 100, "2026-06-11"));
    act(() => result.current.onResizeEnd(110)); // <0.5 jour => arrondi 0
    expect(onOperation).not.toHaveBeenCalled();
  });
});
