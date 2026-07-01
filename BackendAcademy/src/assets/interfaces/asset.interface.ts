/**
 * Metadata describing a single stored asset (either uploaded via POST /assets
 * or located under the public static-asset directory).
 */
export interface Asset {
  /** Stable opaque identifier for the asset (UUID v4). */
  id: string;
  /**
   * Filename on disk (or relative path under the static directory).
   * This is the value used to look the file up at serve time.
   */
  filename: string;
  /** Original filename as supplied by the client at upload time. */
  originalName: string;
  /** Detected/stored MIME type of the asset (e.g. `image/png`). */
  mimeType: string;
  /** Size of the asset in bytes. */
  size: number;
  /** ISO 8601 timestamp the asset was registered. */
  uploadedAt: string;
  /**
   * Public URL where the asset content can be downloaded.
   * For uploaded assets this resolves to the REST download endpoint.
   */
  url: string;
  /** Optional human-friendly name supplied by the uploader. */
  name?: string;
  /** Optional description supplied by the uploader. */
  description?: string;
}

/**
 * Response shape for `GET /assets`.
 */
export interface AssetListResponse {
  /** Total number of assets returned. */
  total: number;
  /** List of asset metadata records. */
  assets: Asset[];
}

/**
 * Sort order for `GET /assets`.
 *  - `newest` (default): most recently uploaded first
 *  - `oldest`: oldest first
 *  - `name`: alphabetical by originalName
 */
export type AssetSortOrder = 'newest' | 'oldest' | 'name';
