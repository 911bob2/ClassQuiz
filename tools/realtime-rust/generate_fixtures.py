"""Run inside the lab API to compare real Python rules with Rust's fixtures."""

import ast
import json
import os
from pathlib import Path

from classquiz.db.models import QuizQuestion
from classquiz.socket_server.helpers import check_question_answer
from classquiz.socket_server.models import SubmitAnswerData


def main():
    root = Path("/rust-source")
    cases = [
        ("ABCD", [{"answer": "A", "right": True}, {"answer": "B", "right": False}], ["A", "B", "C", "a", 0]),
        (
            "CHECK",
            [{"answer": "a", "right": True}, {"answer": "b", "right": False}, {"answer": "c", "right": True}],
            ["02", "20", "0", "012", ""],
        ),
        (
            "RANGE",
            dict(min=-10, max=10, min_correct=-2, max_correct=2),
            ["-2.9", "2.9", "3", "-3", "0.5", "2e0", "nan", "inf", "bad"],
        ),
        (
            "TEXT",
            [{"answer": "İΣ", "case_sensitive": False}, {"answer": "Exact", "case_sensitive": True}],
            ["İΣ", "i̇ς", "Exact", "exact", "wrong"],
        ),
        ("VOTING", [{"answer": "A"}], ["A", "B"]),
        ("ORDER", [{"answer": "A"}, {"answer": "B"}], ["a"]),
    ]
    fixtures = []
    for kind, answers, values in cases:
        q = QuizQuestion(question="fixture", time="30", type=kind, answers=answers)
        orders = (
            [None]
            if kind != "ORDER"
            else [None, [{"answer": "A"}, {"answer": "B"}], [{"answer": "B"}, {"answer": "A"}], []]
        )
        for value in values:
            for order in orders:
                data = SubmitAnswerData(question_index=0, question_token="fixture", answer=value, complex_answer=order)
                data.answer = str(data.answer)
                fixture = dict(question=q.model_dump(), submission=data.model_dump(), error=False)
                try:
                    right, normalized = check_question_answer(q, data)
                    fixture["expected"] = [bool(right), normalized]
                except (ValueError, OverflowError, TypeError):
                    fixture["error"] = True
                fixtures.append(fixture)
    Path(os.getenv("RUST_FIXTURE_OUTPUT", str(root / "tests/grading.json"))).write_text(
        json.dumps(fixtures, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    source = ast.parse(Path("/app/classquiz/socket_server/answers.py").read_text())
    for name, filename in (("_commit", "commit.lua"), ("_close", "close.lua")):
        node = next(
            n
            for n in source.body
            if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in n.targets)
        )
        expected = node.value.args[0].value
        assert (root / filename).read_text().strip() == expected.strip(), f"{filename} drifted from Python"
    print(f"Generated {len(fixtures)} Python grading fixtures; both Lua scripts match production")


if __name__ == "__main__":
    main()
