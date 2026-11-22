import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen
from target_service import TargetHandler, ThreadingHTTPServer, require_safe_bind


class BindTests(unittest.TestCase):
    def test_local_only_is_allowed(self):
        self.assertEqual(require_safe_bind("127.0.0.1"), "127.0.0.1")
        self.assertEqual(require_safe_bind("192.168.56.102", True), "192.168.56.102")

    def test_unsafe_bind_rejected(self):
        for ip, confirmed in [
            ("0.0.0.0", True), ("::", True),
            ("8.8.8.8", True), ("192.0.2.11", True),
            ("169.254.15.22", True), ("192.168.56.101", False),
            ("255.255.255.255", True), ("foo", True),
        ]:
            with self.subTest(ip=ip), self.assertRaises(ValueError):
                require_safe_bind(ip, confirmed)


class TargetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), TargetHandler)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()
        cls.base = "http://127.0.0.1:{}".format(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join(timeout=3)

    def test_health_response_is_synthetic_and_contains_no_secrets(self):
        with urlopen(self.base + "/health", timeout=3) as response:
            obj = json.load(response)
            self.assertEqual(response.status, 200)
            self.assertEqual(response.headers.get("Cache-Control"), "no-store")
            self.assertEqual(obj["lab"], "blackbox-nmap-local-01")
            self.assertEqual(obj["port"], self.server.server_port)
            self.assertNotIn("password", obj)
            self.assertNotIn("token", obj)

    def test_does_not_expose_arbitrary_files(self):
        for path in ("/", "/../../etc/passwd", "/.git/config"):
            with self.subTest(path=path), self.assertRaises(HTTPError) as caught:
                urlopen(self.base + path, timeout=3)
            self.assertEqual(caught.exception.code, 404)


if __name__ == "__main__":
    unittest.main()
