#include <stdint.h>

/* FNV-1a 32-bit over `len` bytes pulled one at a time from `next`.
 * `next` is a call-scoped callback installed by scriptc in a
 * binding-specific thread-local slot for the duration of this call. */
uint32_t ffi_fnv1a(uint8_t (*next)(void), uint32_t len, uint32_t seed) {
  uint32_t h = seed;
  for (uint32_t i = 0; i < len; i++) {
    h ^= (uint32_t)next();
    h *= 16777619u;
  }
  return h;
}
