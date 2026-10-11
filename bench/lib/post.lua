-- wrk2 script for POST cells: empty-body POST (web-frameworks POST /user).
wrk.method = "POST"
wrk.headers["Content-Type"] = "text/plain"
