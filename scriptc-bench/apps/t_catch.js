let isRegexSafe = null;
try {
  isRegexSafe = require("safe-regex2");
  console.log("safe-regex2 loaded");
} catch (e) {
  console.log("require fenced: " + String(e).slice(0, 80));
}
console.log("past the fence, isRegexSafe=" + typeof isRegexSafe);
