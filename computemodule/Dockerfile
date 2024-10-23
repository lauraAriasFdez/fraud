FROM --platform=linux/amd64 rust:bullseye as builder


# needed on work laptop for some reason
COPY ./cert.crt /usr/local/share/ca-certificates/root_cert.crt
RUN update-ca-certificates

RUN cargo new --bin app
WORKDIR /app
COPY ./Cargo.toml ./Cargo.lock ./
COPY ./src ./src
RUN cargo build --release

FROM --platform=linux/amd64 debian:bullseye-slim
USER 5000

COPY --from=builder /app/target/release/rust-cm-demo /usr/local/bin/app
CMD ["app"]

