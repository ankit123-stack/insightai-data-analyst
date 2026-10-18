import unittest

import numpy as np
import pandas as pd
from fastapi import HTTPException

from main import (
    DATASETS,
    apply_cleaning,
    clean_dataframe,
    data_quality_summary,
    preview_cleaning,
    reset_cleaning,
)


class CleaningTests(unittest.TestCase):
    def tearDown(self):
        DATASETS.pop("cleaning-test", None)

    def test_preview_transforms_a_copy_and_reports_quality(self):
        source = pd.DataFrame({
            "amount": [1.0, 2.0, np.nan, 100.0],
            "region": [" North", "north", None, "South"],
        })

        cleaned, changes = clean_dataframe(
            source,
            {
                "fill_missing": {
                    "amount": {"strategy": "median"},
                    "region": {"strategy": "mode"},
                },
                "outliers": {"amount": "cap"},
            },
        )

        self.assertEqual(len(source), 4)
        self.assertTrue(pd.isna(source.loc[2, "amount"]))
        self.assertEqual(changes["rows_removed"], 0)
        self.assertFalse(cleaned["amount"].isna().any())
        self.assertLess(cleaned["amount"].max(), 100)
        self.assertEqual(
            data_quality_summary(source)["inconsistent_categories"]["count"],
            1,
        )

    def test_deduplicates_and_drops_selected_columns(self):
        source = pd.DataFrame({
            "value": [1, 1, 2],
            "unused": ["a", "a", "b"],
        })

        cleaned, changes = clean_dataframe(
            source,
            {
                "remove_duplicates": True,
                "drop_columns": ["unused"],
            },
        )

        self.assertEqual(list(cleaned.columns), ["value"])
        self.assertEqual(len(cleaned), 2)
        self.assertEqual(changes["rows_removed"], 1)
        self.assertIn("unused", source.columns)

    def test_rejects_invalid_type_conversion(self):
        source = pd.DataFrame({"value": ["10", "not-a-number"]})

        with self.assertRaises(HTTPException):
            clean_dataframe(
                source,
                {"convert_types": {"value": "numeric"}},
            )

    def test_rejects_dropping_every_column(self):
        source = pd.DataFrame({"value": [1, 2]})

        with self.assertRaises(HTTPException):
            clean_dataframe(source, {"drop_columns": ["value"]})

    def test_preview_does_not_apply_and_reset_restores_original(self):
        original = pd.DataFrame({
            "value": [1, 1, 2],
            "label": ["a", "a", "b"],
        })
        DATASETS["cleaning-test"] = {
            "df": original.copy(deep=True),
            "original_df": original.copy(deep=True),
            "filename": "sample.csv",
        }
        options = {
            "operations": {
                "remove_duplicates": True,
                "convert_types": {"label": "category"},
            }
        }

        preview = preview_cleaning("cleaning-test", options)
        self.assertEqual(preview["changes"]["rows_after"], 2)
        self.assertEqual(len(DATASETS["cleaning-test"]["df"]), 3)

        applied = apply_cleaning("cleaning-test", options)
        self.assertEqual(applied["profile"]["rows"], 2)
        self.assertEqual(len(DATASETS["cleaning-test"]["df"]), 2)

        restored = reset_cleaning("cleaning-test")
        self.assertEqual(restored["profile"]["rows"], 3)
        self.assertEqual(
            list(DATASETS["cleaning-test"]["df"]["label"]),
            ["a", "a", "b"],
        )


if __name__ == "__main__":
    unittest.main()
