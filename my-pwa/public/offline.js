// The offline page's behaviour, in a file of its own so the page needs no
// inline script and works under a strict content security policy.
document.getElementById("retry").addEventListener("click", function () {
  location.reload();
});
window.addEventListener("online", function () {
  location.reload();
});
