<<<<<<< HEAD
// Ceiling reference: C mongoose — routes 1-3 only (DESIGN.md §5).
// Build: cc -O2 -o bin/c-mongoose c-mongoose.c mongoose.c -DMG_ENABLE_LOG=0
#include "mongoose.h"
#include <string.h>

static void reply(struct mg_connection *c, int code, const char *ctype,
                  const char *body, size_t len) {
  char h[64];
  snprintf(h, sizeof(h), "Content-Type: %s\r\n", ctype);
  mg_http_reply(c, code, h, "%.*s", (int) len, body);
}

static void fn(struct mg_connection *c, int ev, void *ev_data) {
  if (ev != MG_EV_HTTP_MSG) return;
  struct mg_http_message *hm = (struct mg_http_message *) ev_data;
  const char *uri = hm->uri.buf;
  size_t ulen = hm->uri.len;
  if (mg_strcmp(hm->method, mg_str("GET")) == 0) {
    if (ulen == 5 && memcmp(uri, "/json", 5) == 0) {
      reply(c, 200, "application/json", "{\"hello\":\"world\"}", 17);
      return;
    }
    if (ulen > 6 && memcmp(uri, "/user/", 6) == 0 &&
        memchr(uri + 6, '/', ulen - 6) == NULL) {
      mg_http_reply(c, 200, "Content-Type: application/json\r\n",
                    "{\"id\":\"%.*s\"}", (int) (ulen - 6), uri + 6);
      return;
    }
  } else if (mg_strcmp(hm->method, mg_str("POST")) == 0) {
    if (ulen == 5 && memcmp(uri, "/echo", 5) == 0) {
      reply(c, 200, "text/plain", hm->body.buf, hm->body.len);
      return;
    }
  }
  reply(c, 404, "text/plain", "Not Found", 9);
}

int main(void) {
  struct mg_mgr mgr;
  mg_mgr_init(&mgr);
  mg_http_listen(&mgr, "http://0.0.0.0:3000", fn, NULL);
  fprintf(stderr, "c-mongoose listening on :3000\n");
  for (;;) mg_mgr_poll(&mgr, 1000);
  return 0;
}
||||||| empty tree
=======
// Ceiling reference: C mongoose — routes 1-3 only (DESIGN.md §5).
// Build: cc -O2 -o bin/c-mongoose c-mongoose.c mongoose.c -DMG_ENABLE_LOG=0
#include "mongoose.h"
#include <string.h>

static void reply(struct mg_connection *c, int code, const char *ctype,
                  const char *body, size_t len) {
  char h[64];
  snprintf(h, sizeof(h), "Content-Type: %s\r\n", ctype);
  mg_http_reply(c, code, h, "%.*s", (int) len, body);
}

static void fn(struct mg_connection *c, int ev, void *ev_data) {
  if (ev != MG_EV_HTTP_MSG) return;
  struct mg_http_message *hm = (struct mg_http_message *) ev_data;
  const char *uri = hm->uri.buf;
  size_t ulen = hm->uri.len;
  if (mg_strcmp(hm->method, mg_str("GET")) == 0) {
    if (ulen == 1 && uri[0] == '/') {
      reply(c, 200, "text/plain", "", 0);
      return;
    }
    if (ulen == 6 && memcmp(uri, "/hello", 6) == 0) {
      reply(c, 200, "text/plain", "Hello World!", 12);
      return;
    }
    if (ulen == 5 && memcmp(uri, "/json", 5) == 0) {
      reply(c, 200, "application/json", "{\"hello\":\"world\"}", 17);
      return;
    }
    if (ulen > 6 && memcmp(uri, "/user/", 6) == 0 &&
        memchr(uri + 6, '/', ulen - 6) == NULL) {
      mg_http_reply(c, 200, "Content-Type: application/json\r\n",
                    "{\"id\":\"%.*s\"}", (int) (ulen - 6), uri + 6);
      return;
    }
  } else if (mg_strcmp(hm->method, mg_str("POST")) == 0) {
    if (ulen == 5 && memcmp(uri, "/echo", 5) == 0) {
      reply(c, 200, "text/plain", hm->body.buf, hm->body.len);
      return;
    }
    if (ulen == 5 && memcmp(uri, "/user", 5) == 0) {
      reply(c, 200, "text/plain", "", 0);
      return;
    }
  }
  reply(c, 404, "text/plain", "Not Found", 9);
}

int main(void) {
  struct mg_mgr mgr;
  mg_mgr_init(&mgr);
  mg_http_listen(&mgr, "http://0.0.0.0:3000", fn, NULL);
  fprintf(stderr, "c-mongoose listening on :3000\n");
  for (;;) mg_mgr_poll(&mgr, 1000);
  return 0;
}
>>>>>>> origin/devin/bench-credible
