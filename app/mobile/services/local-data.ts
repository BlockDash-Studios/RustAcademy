import AsyncStorage from "@react-native-async-storage/async-storage";

import { clearSecurityData } from "./security";
import { clearWalletSession } from "./wallet-session";

// Wipes all locally stored app data across every storage layer: general
// AsyncStorage, secure/security storage, and the wallet session. Used
// for things like "log out" or "reset app" flows where no local trace
// of the user's data/session should remain.
//
// Each step is wrapped in its own try/catch so that a failure in one
// storage layer (e.g. secure storage being unavailable) doesn't prevent
// the others from still being cleared — the function always attempts
// all three wipes rather than bailing out on the first error.
export async function clearLocalData(): Promise<void> {
  try {
    // Guard against AsyncStorage or .clear() being unavailable (e.g. in
    // certain test/mock environments) before calling it.
    if (AsyncStorage && typeof AsyncStorage.clear === "function") {
      await AsyncStorage.clear();
    }
  } catch (error) {
    console.error("Failed to clear AsyncStorage during local data wipe", error);
  }

  try {
    await clearSecurityData();
  } catch (error) {
    console.error("Failed to clear secure storage during local data wipe", error);
  }

  try {
    await clearWalletSession();
  } catch (error) {
    console.error("Failed to clear wallet session during local data wipe", error);
  }
}