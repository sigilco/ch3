// Stand-in for a Vite/React CSR bundle. The ELF never executes this file.
const root = document.getElementById("root");
if (root) {
  root.textContent = "CSR mounted";
}
const btn = document.createElement("button");
btn.textContent = "clicked 0";
let n = 0;
btn.addEventListener("click", () => {
  n = n + 1;
  btn.textContent = "clicked " + n;
});
document.body.appendChild(btn);
