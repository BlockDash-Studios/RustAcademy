export enum ContractAdapterErrorCode {
  StreamError = "STREAM_ERROR",
  ParseError = "PARSE_ERROR",
  UnknownError = "UNKNOWN_ERROR",
}

export class ContractAdapterError extends Error {
  constructor(
    public readonly code: ContractAdapterErrorCode,
    public readonly message: string,
  ) {
    super(message);
  }
}
