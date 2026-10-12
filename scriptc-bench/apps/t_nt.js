function F() { if (!new.target) { return new F(); } this.x = 1; return this; }
const f = F();
console.log("newtarget-ok " + f.x);
