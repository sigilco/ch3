// Ceiling reference: rust axum — routes 1-3 only (DESIGN.md §5).
use axum::{
    extract::Path,
    http::header,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(|| async { "" }))
        .route("/hello", get(|| async { "Hello World!" }))
        .route("/user", post(|| async { "" }))
        .route("/json", get(|| async { Json(json!({"hello": "world"})) }))
        .route("/user/{id}", get(|Path(id): Path<String>| async move {
            Json(json!({"id": id}))
        }))
        .route("/echo", post(|body: String| async move {
            ([(header::CONTENT_TYPE, "text/plain")], body).into_response()
        }));

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("rust-axum listening on :3000");
    axum::serve(listener, app).await.unwrap();
}
