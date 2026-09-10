#!/usr/bin/env python3
"""Tiny protocol-v2 mock judge used by acceptance tests."""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        request = json.loads(self.rfile.read(length))
        assert request.get("protocol") == "hackathon-run.judge.v2"
        assert len(request.get("rubric", {}).get("dimensions", [])) == 7
        dimensions = [
            {
                "name": item["name"],
                "score": (index % 5),
                "rationale": f"Mock rationale for {item['name']}.",
                "confidence": 0.85,
                "evidence": [{"kind": "test", "value": "acceptance mock evidence"}],
                "judge_questions": ["Mock question one?", "Mock question two?"],
                "improvements": ["Mock improvement."],
            }
            for index, item in enumerate(request["rubric"]["dimensions"])
        ]
        response = {
            "protocol": "hackathon-run.judge.v2",
            "request_id": request.get("request_id"),
            "model": "acceptance-mock-judge",
            "generated_at": "2026-01-01T00:00:00Z",
            "dimensions": dimensions,
            "overall": sum(item["score"] for item in dimensions) / len(dimensions),
        }
        body = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return


def main():
    port_file = sys.argv[1]
    server = HTTPServer(("127.0.0.1", 0), Handler)
    with open(port_file, "w", encoding="utf-8") as handle:
        handle.write(str(server.server_port))
    server.serve_forever()


if __name__ == "__main__":
    main()
