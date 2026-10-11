// Ceiling reference: go net/http + chi — routes 1-3 only (DESIGN.md §5).
package main

import (
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func main() {
	r := chi.NewRouter()
	r.Get("/", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
	})
	r.Get("/hello", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		fmt.Fprint(w, "Hello World!")
	})
	r.Post("/user", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
	})
	r.Get("/json", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprint(w, `{"hello":"world"}`)
	})
	r.Get("/user/{id}", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"id":"%s"}`, chi.URLParam(req, "id"))
	})
	r.Post("/echo", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		io.Copy(w, req.Body)
	})
	fmt.Println("go-chi listening on :3000")
	http.ListenAndServe(":3000", r)
}
