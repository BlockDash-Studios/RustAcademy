import { renderHook, act } from "@testing-library/react";
import { usePersistentState } from "../usePersistentState";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("usePersistentState", () => {
  const TEST_KEY = "test_key";
  const INITIAL_VALUE = { count: 0 };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("should initialize with initial value if local storage is empty", () => {
    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE)
    );

    expect(result.current[0]).toEqual(INITIAL_VALUE);
    expect(result.current[2]).toBe(true); // isHydrated
  });

  it("should load from local storage if value exists", () => {
    localStorage.setItem(TEST_KEY, JSON.stringify({ count: 5 }));

    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE)
    );

    expect(result.current[0]).toEqual({ count: 5 });
  });

  it("should scope storage by userId if provided", () => {
    const USER_ID = "user_123";
    const scopedKey = `${TEST_KEY}_${USER_ID}`;
    
    localStorage.setItem(scopedKey, JSON.stringify({ count: 10 }));

    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE, { userId: USER_ID })
    );

    expect(result.current[0]).toEqual({ count: 10 });
    // Global key should not be used
    expect(localStorage.getItem(TEST_KEY)).toBeNull();
  });

  it("should update state and local storage", () => {
    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE)
    );

    act(() => {
      result.current[1]({ count: 2 });
    });

    expect(result.current[0]).toEqual({ count: 2 });
    expect(localStorage.getItem(TEST_KEY)).toBe(JSON.stringify({ count: 2 }));
  });

  it("should sync to backend if provided", async () => {
    const USER_ID = "user_123";
    const syncToBackend = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE, {
        userId: USER_ID,
        syncToBackend,
      })
    );

    act(() => {
      result.current[1]({ count: 3 });
    });

    expect(syncToBackend).toHaveBeenCalledWith({ count: 3 }, USER_ID);
  });

  it("should handle custom serialization and deserialization", () => {
    const serialize = (val: { count: number }) => `CUSTOM-${val.count}`;
    const deserialize = (str: string) => ({ count: parseInt(str.replace("CUSTOM-", ""), 10) });

    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE, {
        serialize,
        deserialize,
      })
    );

    act(() => {
      result.current[1]({ count: 99 });
    });

    expect(localStorage.getItem(TEST_KEY)).toBe("CUSTOM-99");
  });

  it("should update state when a storage event fires for the same key", () => {
    const { result } = renderHook(() =>
      usePersistentState(TEST_KEY, INITIAL_VALUE)
    );

    act(() => {
      // Simulate cross-tab storage event
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TEST_KEY,
          newValue: JSON.stringify({ count: 42 }),
        })
      );
    });

    expect(result.current[0]).toEqual({ count: 42 });
  });
});
