from __future__ import annotations

import unittest

from opsspec.runtime.scheduler import schedule_ops_spec
from opsspec.specs.aggregate import AverageOp
from opsspec.specs.base import OpsMeta
from opsspec.specs.compare import DiffOp
from opsspec.specs.filter import FilterOp


class SchedulerTest(unittest.TestCase):
    def test_assigns_phase_metadata_without_split_annotations(self) -> None:
        ops_spec = {
            "ops": [
                FilterOp(op="filter", id="n1", meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1), field="Year", include=["1995", "1999"]),
                AverageOp(op="average", id="n2", meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1), field="Installed base"),
            ],
            "ops2": [
                FilterOp(op="filter", id="n3", meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=2), field="Year", include=["2010", "2013", "2017"]),
                AverageOp(op="average", id="n4", meta=OpsMeta(nodeId="n4", inputs=["n3"], sentenceIndex=2), field="Installed base"),
            ],
            "ops3": [
                DiffOp(
                    op="diff",
                    id="n5",
                    meta=OpsMeta(nodeId="n5", inputs=["n2", "n4"], sentenceIndex=3),
                    field="Installed base",
                    targetA="ref:n2",
                    targetB="ref:n4",
                )
            ],
        }

        scheduled = schedule_ops_spec(ops_spec)
        left_nodes = scheduled["ops"]
        right_nodes = scheduled["ops2"]
        join_node = scheduled["ops3"][0]

        for op in left_nodes:
            self.assertIsNotNone(op.meta.view)
            self.assertIsNone(op.meta.view.splitGroup)
            self.assertIsNone(op.meta.view.panelId)
            self.assertIsNone(op.meta.view.joinBarrier)
            self.assertIsNotNone(op.meta.view.phase)

        for op in right_nodes:
            self.assertIsNotNone(op.meta.view)
            self.assertIsNone(op.meta.view.splitGroup)
            self.assertIsNone(op.meta.view.panelId)
            self.assertIsNone(op.meta.view.joinBarrier)
            self.assertIsNotNone(op.meta.view.phase)

        self.assertIsNotNone(join_node.meta.view)
        self.assertIsNone(join_node.meta.view.joinBarrier)
        self.assertIsNone(join_node.meta.view.splitGroup)
        self.assertIsNone(join_node.meta.view.panelId)
        self.assertEqual(join_node.meta.view.phase, 3)

    def test_skips_split_when_branches_share_ancestor(self) -> None:
        ops_spec = {
            "ops": [
                FilterOp(op="filter", id="n1", meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1), field="Year", include=["1995", "1999"]),
                AverageOp(op="average", id="n2", meta=OpsMeta(nodeId="n2", inputs=["n1"], sentenceIndex=1), field="Installed base"),
                AverageOp(op="average", id="n3", meta=OpsMeta(nodeId="n3", inputs=["n1"], sentenceIndex=1), field="Installed base"),
            ],
            "ops2": [
                DiffOp(
                    op="diff",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n2", "n3"], sentenceIndex=2),
                    field="Installed base",
                    targetA="ref:n2",
                    targetB="ref:n3",
                )
            ],
        }

        scheduled = schedule_ops_spec(ops_spec)
        for op in scheduled["ops"]:
            view = op.meta.view
            if view is None:
                continue
            self.assertIsNone(view.splitGroup)
            self.assertIsNone(view.panelId)

        join_view = scheduled["ops2"][0].meta.view
        if join_view is not None:
            self.assertIsNone(join_view.joinBarrier)

    def test_skips_split_when_join_has_more_than_two_inputs(self) -> None:
        ops_spec = {
            "ops": [
                FilterOp(op="filter", id="n1", meta=OpsMeta(nodeId="n1", inputs=[], sentenceIndex=1), field="Year", include=["1995"]),
            ],
            "ops2": [
                FilterOp(op="filter", id="n2", meta=OpsMeta(nodeId="n2", inputs=[], sentenceIndex=2), field="Year", include=["1999"]),
            ],
            "ops3": [
                FilterOp(op="filter", id="n3", meta=OpsMeta(nodeId="n3", inputs=[], sentenceIndex=3), field="Year", include=["2010"]),
            ],
            "ops4": [
                DiffOp(
                    op="diff",
                    id="n4",
                    meta=OpsMeta(nodeId="n4", inputs=["n1", "n2", "n3"], sentenceIndex=4),
                    field="Installed base",
                    targetA="ref:n1",
                    targetB="ref:n2",
                )
            ],
        }

        scheduled = schedule_ops_spec(ops_spec)
        for group_name in ("ops", "ops2", "ops3"):
            view = scheduled[group_name][0].meta.view
            if view is not None:
                self.assertIsNone(view.splitGroup)
                self.assertIsNone(view.panelId)

        join_view = scheduled["ops4"][0].meta.view
        if join_view is not None:
            self.assertIsNone(join_view.joinBarrier)


if __name__ == "__main__":
    unittest.main()
