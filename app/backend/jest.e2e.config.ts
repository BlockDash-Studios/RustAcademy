import base from "./jest.config";

export default {
  ...base,
  testRegex: ".*\\.e2e-spec\\.ts$",
  // Prefer .ts sources over stale .js build artifacts in src/
  moduleFileExtensions: ["ts", "js", "json"],
};
