import unittest
from unittest.mock import patch
from vm_inspector import InspectorError, inventory, parse_info, parse_inventory, run_readonly

UUID = "12345678-1234-1234-1234-123456789abc"


class InspectorTests(unittest.TestCase):
    def test_inventory_parser(self):
        self.assertEqual(parse_inventory(f'"Kali Linux" {{{UUID}}}\n'), [{"id": UUID, "name": "Kali Linux"}])
        self.assertEqual(parse_inventory("untrusted output"), [])

    def test_host_only(self):
        info = parse_info('VMState="running"\nnic1="hostonly"\nnic2="none"\n')
        self.assertTrue(info["isolated"])
        self.assertEqual(info["state"], "running")

    def test_bridged_or_nat_not_isolated(self):
        for mode in ("bridged", "nat", "natnetwork", "unknown"):
            with self.subTest(mode=mode):
                self.assertFalse(parse_info(f'nic1="{mode}"\n')["isolated"])

    def test_no_adapters_not_isolated(self):
        self.assertFalse(parse_info('VMState="poweroff"\n')["isolated"])

    def test_mutation_rejected(self):
        with self.assertRaises(InspectorError):
            run_readonly("VBoxManage", "startvm", UUID)
        with self.assertRaises(InspectorError):
            run_readonly("VBoxManage", "showvminfo", "evil", "--machinereadable")

    @patch("vm_inspector.run_readonly")
    def test_inventory_uses_uuid_only(self, run):
        run.side_effect = [f'"Kali Linux" {{{UUID}}}', 'VMState="running"\nnic1="intnet"\n']
        result = inventory("VBoxManage")
        self.assertTrue(result[0]["isolated"])
        self.assertEqual(run.call_args_list[1].args, ("VBoxManage", "showvminfo", UUID, "--machinereadable"))


if __name__ == "__main__":
    unittest.main()
