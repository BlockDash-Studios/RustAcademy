FROM rust:1.86-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential cmake pkg-config libssl-dev \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32-wasip1 \
    && cargo install wasmtime-cli --version 29.0.1 --locked --root /usr/local