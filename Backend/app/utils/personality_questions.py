import json
from datetime import datetime

from app.utils.openai_client import get_openai_client, get_openai_model


# We keep IDs stable so the frontend can submit answers reliably.
# Only the *question text* changes dynamically.
QUESTION_IDS: list[tuple[str, str]] = [
    ("attitude_1", "Attitude & Worldview"),
    ("attitude_2", "Attitude & Worldview"),
    ("attitude_3", "Attitude & Worldview"),
    ("attitude_4", "Attitude & Worldview"),
    ("attitude_5", "Attitude & Worldview"),
    ("comm_1", "Communication Style"),
    ("comm_2", "Communication Style"),
    ("comm_3", "Communication Style"),
    ("comm_4", "Communication Style"),
    ("comm_5", "Communication Style"),
    ("big5_openness", "Personality (Big Five)"),
    ("big5_conscientiousness", "Personality (Big Five)"),
    ("big5_extraversion", "Personality (Big Five)"),
    ("big5_agreeableness", "Personality (Big Five)"),
    ("big5_neuroticism", "Personality (Big Five)"),
]


TOOL_SPEC = {
    "type": "function",
    "function": {
        "name": "generate_personality_questions",
        "description": (
            "Generate 15 high-signal, open-ended questions to infer a user's personality, attitude, and communication style. "
            "Return questions grouped into the provided sections with stable IDs."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "description": "Exactly 15 questions, each with a stable question_id, a section name, and question text.",
                    "minItems": 15,
                    "maxItems": 15,
                    "items": {
                        "type": "object",
                        "properties": {
                            "question_id": {"type": "string"},
                            "part": {
                                "type": "string",
                                "enum": ["Attitude & Worldview", "Communication Style", "Personality (Big Five)"],
                            },
                            "question": {"type": "string"},
                        },
                        "required": ["question_id", "part", "question"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["questions"],
            "additionalProperties": False,
        },
    },
}


def _validate_questions(questions: list[dict]) -> list[dict]:
    if len(questions) != 15:
        raise ValueError(f"Expected 15 questions, got {len(questions)}")

    expected_ids = [qid for qid, _ in QUESTION_IDS]
    expected_parts = {qid: part for qid, part in QUESTION_IDS}

    seen: set[str] = set()
    out: list[dict] = []
    for q in questions:
        qid = (q.get("question_id") or "").strip()
        part = (q.get("part") or "").strip()
        text = (q.get("question") or "").strip()

        if not qid or qid not in expected_ids:
            raise ValueError(f"Unexpected question_id: {qid}")
        if qid in seen:
            raise ValueError(f"Duplicate question_id: {qid}")
        if part != expected_parts[qid]:
            raise ValueError(f"question_id {qid} must have part '{expected_parts[qid]}', got '{part}'")
        if not text or len(text) < 8:
            raise ValueError(f"Question text too short for {qid}")
        if text.endswith('"') and text.count('"') % 2 == 1:
            # Guard against some common JSON quoting artifacts.
            raise ValueError(f"Malformed question text for {qid}")

        seen.add(qid)
        out.append({"question_id": qid, "part": part, "question": text})

    # Ensure stable ordering for clients.
    out.sort(key=lambda x: x["question_id"])
    return out


def generate_personality_questions(*, language: str = "English") -> dict:
    """
    Calls OpenAI with function-calling to generate a structured list of 15 questions.
    Returns: {"questions": [...], "model": "...", "generated_at": "..."}.
    """
    client = get_openai_client()
    model = get_openai_model()

    id_hints = "\n".join([f"- {qid}: {part}" for qid, part in QUESTION_IDS])

    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert interviewer designing a short, high-signal personality questionnaire.\n"
                "Goal: infer personality, attitude/worldview, and communication style from free-text answers.\n\n"
                "Rules:\n"
                "- Output MUST be a tool/function call.\n"
                "- Ask open-ended questions that encourage detail (not yes/no).\n"
                "- Avoid asking for personal identifiers (address, phone, passwords) or illegal content.\n"
                "- Keep each question concise (1-2 sentences).\n"
                "- Do not mention 'Big Five' or any trait labels in the question text.\n"
                "- Ensure variety; no repeats.\n"
            ),
        },
        {
            "role": "user",
            "content": (
                f"Generate exactly 15 questions in {language} using these REQUIRED IDs and sections:\n"
                f"{id_hints}\n\n"
                "Return a JSON tool call with the array 'questions'."
            ),
        },
    ]

    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        tools=[TOOL_SPEC],
        tool_choice={"type": "function", "function": {"name": "generate_personality_questions"}},
        temperature=0.8,
    )

    msg = resp.choices[0].message
    tool_calls = getattr(msg, "tool_calls", None) or []
    if not tool_calls:
        raise RuntimeError("OpenAI returned no tool call for personality questions")

    args_text = tool_calls[0].function.arguments
    data = json.loads(args_text)
    questions = _validate_questions(data.get("questions") or [])

    return {
        "questions": questions,
        "model": model,
        "generated_at": datetime.utcnow().isoformat(),
    }


