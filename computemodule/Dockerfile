FROM rust:bullseye as builder

RUN cargo new --bin app
WORKDIR /app
COPY ./Cargo.toml ./Cargo.lock ./
COPY ./src ./src
RUN cargo build --release

FROM debian:bullseye-slim
USER 5000

COPY --from=builder /app/target/release/computemodule /usr/local/bin/app
CMD ["app"]

