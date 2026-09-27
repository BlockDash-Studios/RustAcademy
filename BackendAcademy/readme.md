# BackendAcademy

RustAcademy backend module — placeholder for future NestJS backend implementation.

## Getting Started

```bash
pnpm install
pnpm run dev
```

## Structure

- `src/` — Application source code (NestJS modules, controllers, services)
- `test/` — Test files

See `app/backend/` for the primary backend implementation and conventions.

## Rust Task Execution

Task execution uses `rustc` to compile dependency-free learner programs to
`wasm32-wasip1`, then runs the module with Wasmtime. Install the Rust target
and Wasmtime in the backend environment:

```bash
rustup target add wasm32-wasip1
```

Executables are resolved from `PATH` by default. Override them with
`RUSTC_BIN` and `WASMTIME_BIN` when needed. The `POST /api/v1/tasks/:id/execute`
endpoint accepts `{ "code": "..." }`; each configured task test case is passed
to the program as stdin and compared with the task's expected output.

Execution has a 2-second wall-clock timeout, 10-million Wasmtime fuel limit,
16 MiB guest memory limit, 64 KiB combined process-output limit, and no WASI
directory preopens. Compilation and execution artifacts are kept in a unique
temporary directory and removed after the request.
