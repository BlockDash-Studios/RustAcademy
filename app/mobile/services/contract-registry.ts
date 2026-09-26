import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@contract_registry';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

// Maps a contract name to its deployed id and version, as returned by
// the backend registry endpoint.
export interface ContractRegistry {
  [key: string]: { id: string; version: string };
}

// Caches the backend's contract registry locally so contract ids can be
// looked up (via getContract) without a network round-trip on every call,
// while still refreshing from the backend when possible (via sync).
export const ContractRegistryService = {
  // Fetches the latest registry from the backend and caches it locally
  // with a timestamp. If the fetch fails (e.g. offline, backend down),
  // falls back to serving whatever is cached, however stale — and only
  // throws if there's no cache at all to fall back to.
  //
  // Note: CACHE_TTL is defined but not actually used here (or anywhere
  // else in this file) to expire the cache — sync always serves the
  // cached data on failure regardless of age. If a TTL-based cutoff was
  // intended, it isn't enforced yet.
  async sync(backendUrl: string): Promise<ContractRegistry> {
    try {
      const response = await fetch(`${backendUrl}/api/contracts/registry`);
      if (!response.ok) throw new Error('Failed to fetch registry');
      
      const data = await response.json();
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data
      }));
      return data;
    } catch (error) {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Serve stale cache if offline
        return parsed.data;
      }
      throw new Error('Registry unavailable and no cache found');
    }
  },

  // Looks up a single contract's id by name, reading directly from the
  // local cache (does not trigger a network fetch — call sync() first to
  // ensure the cache is populated/fresh). Throws if there's no cache yet,
  // or if the named contract isn't present in it.
  async getContract(name: string): Promise<string> {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (!cached) throw new Error('Registry missing');
    const registry = JSON.parse(cached).data;
    if (!registry[name]) throw new Error(`Contract ${name} missing from registry`);
    return registry[name].id;
  }
};