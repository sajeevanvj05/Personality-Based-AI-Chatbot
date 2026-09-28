from datetime import datetime

from app.utils.db import db
from bson import ObjectId
from uuid import uuid4


COLLECTION_NAME = "personality_submissions"
PROMPTS_COLLECTION_NAME = "personality_system_prompts"
QUESTION_SETS_COLLECTION_NAME = "personality_question_sets"
PROFILES_COLLECTION_NAME = "personality_profiles"
FAMOUS_BUILDER_CHATS_COLLECTION_NAME = "personality_famous_builder_chats"


async def create_personality_submission(
    *,
    user: dict,
    answers: list[dict],
    personality_id: str | None = None,
    question_set_id: str | None = None,
) -> dict:
    """
    Persist a single personality/attitude/communication submission for a user.
    Stores the user's client_id alongside the answers.
    """
    if db.db is None:
        raise Exception("Database not connected")

    doc = {
        "client_id": user.get("client_id"),
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "personality_id": personality_id,
        "question_set_id": question_set_id,
        "created_at": datetime.utcnow(),
        "answers": answers,
    }

    result = await db.db[COLLECTION_NAME].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_latest_personality_submission(*, user: dict, personality_id: str | None = None) -> dict | None:
    """
    Fetch the most recent personality submission for the given user (by client_id).
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    query: dict = {"client_id": client_id}
    if personality_id:
        query["personality_id"] = personality_id

    doc = await db.db[COLLECTION_NAME].find_one(query, sort=[("created_at", -1)])
    if not doc:
        return None

    doc["_id"] = str(doc["_id"])
    return doc


async def get_personality_submission_by_question_set_id(*, user: dict, question_set_id: str) -> dict | None:
    """
    Find a submission tied to a specific question_set_id (scoped to the current user).
    Used to determine whether a question set has already been answered.
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    doc = await db.db[COLLECTION_NAME].find_one({"client_id": client_id, "question_set_id": question_set_id})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def create_personality_system_prompt(
    *,
    user: dict,
    source_submission_id: str,
    system_prompt: str,
    model: str | None = None,
    metadata: dict | None = None,
    personality_id: str | None = None,
) -> dict:
    """
    Persist the generated system prompt for a user, tied to the submission it came from.
    """
    if db.db is None:
        raise Exception("Database not connected")

    doc = {
        "client_id": user.get("client_id"),
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "personality_id": personality_id,
        "created_at": datetime.utcnow(),
        "source_submission_id": source_submission_id,
        "model": model,
        "system_prompt": system_prompt,
        "metadata": metadata or {},
    }
    result = await db.db[PROMPTS_COLLECTION_NAME].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_latest_personality_system_prompt(*, user: dict, personality_id: str | None = None) -> dict | None:
    """
    Fetch the latest generated system prompt for the user (by client_id).
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    query: dict = {"client_id": client_id}
    if personality_id:
        query["personality_id"] = personality_id

    doc = await db.db[PROMPTS_COLLECTION_NAME].find_one(query, sort=[("created_at", -1)])
    if not doc:
        return None

    doc["_id"] = str(doc["_id"])
    return doc


async def create_personality_question_set(
    *,
    user: dict,
    questions: list[dict],
    model: str | None = None,
    personality_id: str | None = None,
) -> dict:
    """
    Persist a generated personality question set for a user.
    """
    if db.db is None:
        raise Exception("Database not connected")

    doc = {
        "client_id": user.get("client_id"),
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "personality_id": personality_id,
        "created_at": datetime.utcnow(),
        "model": model,
        "questions": questions,
    }
    result = await db.db[QUESTION_SETS_COLLECTION_NAME].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def create_personality_profile(
    *,
    user: dict,
    display_name: str | None = None,
    personality_id: str | None = None,
) -> dict:
    """
    Create a new personality profile for the user.
    """
    if db.db is None:
        raise Exception("Database not connected")

    pid = personality_id or uuid4().hex
    doc = {
        "client_id": user.get("client_id"),
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "personality_id": pid,
        "display_name": display_name,
        "created_at": datetime.utcnow(),
    }
    result = await db.db[PROFILES_COLLECTION_NAME].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def list_personality_profiles(*, user: dict) -> list[dict]:
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return []

    cursor = db.db[PROFILES_COLLECTION_NAME].find({"client_id": client_id}).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


async def get_personality_profile(*, user: dict, personality_id: str) -> dict | None:
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    doc = await db.db[PROFILES_COLLECTION_NAME].find_one({"client_id": client_id, "personality_id": personality_id})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def update_personality_profile_name(*, user: dict, personality_id: str, display_name: str) -> dict | None:
    """
    Update a personality profile display_name. Returns updated doc or None if not found.
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    await db.db[PROFILES_COLLECTION_NAME].update_one(
        {"client_id": client_id, "personality_id": personality_id},
        {"$set": {"display_name": display_name}},
    )

    doc = await db.db[PROFILES_COLLECTION_NAME].find_one({"client_id": client_id, "personality_id": personality_id})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def create_famous_builder_chat_session(
    *,
    user: dict,
    personality_id: str,
    famous_name: str,
) -> dict:
    """
    Create a chat-building session for a personality based on a famous person.
    Stores the transcript messages for later system prompt generation.
    """
    if db.db is None:
        raise Exception("Database not connected")

    doc = {
        "client_id": user.get("client_id"),
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "personality_id": personality_id,
        "famous_name": famous_name,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "messages": [],
    }
    result = await db.db[FAMOUS_BUILDER_CHATS_COLLECTION_NAME].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_latest_famous_builder_chat_session(*, user: dict, personality_id: str) -> dict | None:
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    doc = await db.db[FAMOUS_BUILDER_CHATS_COLLECTION_NAME].find_one(
        {"client_id": client_id, "personality_id": personality_id},
        sort=[("created_at", -1)],
    )
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def append_famous_builder_chat_message(
    *,
    user: dict,
    session_id: str,
    personality_id: str,
    role: str,
    content: str,
) -> dict | None:
    """
    Append a message to the famous builder chat session.
    Returns updated session doc or None.
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    try:
        oid = ObjectId(session_id)
    except Exception:
        return None

    await db.db[FAMOUS_BUILDER_CHATS_COLLECTION_NAME].update_one(
        {"_id": oid, "client_id": client_id, "personality_id": personality_id},
        {
            "$push": {"messages": {"role": role, "content": content, "at": datetime.utcnow()}},
            "$set": {"updated_at": datetime.utcnow()},
        },
    )

    doc = await db.db[FAMOUS_BUILDER_CHATS_COLLECTION_NAME].find_one({"_id": oid, "client_id": client_id})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def list_personality_profiles_by_client_id(*, client_id: str) -> list[dict]:
    """
    List personality profiles for a client_id.
    Note: routes should enforce authorization (only owner can query their client_id).
    """
    if db.db is None:
        raise Exception("Database not connected")

    cursor = db.db[PROFILES_COLLECTION_NAME].find({"client_id": client_id}).sort("created_at", -1)
    docs = await cursor.to_list(length=200)
    for d in docs:
        d["_id"] = str(d["_id"])
    return docs


async def get_personality_question_set_by_id(*, user: dict, question_set_id: str) -> dict | None:
    """
    Fetch a question set by id, scoped to the current user (client_id).
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    try:
        oid = ObjectId(question_set_id)
    except Exception:
        return None

    doc = await db.db[QUESTION_SETS_COLLECTION_NAME].find_one({"_id": oid, "client_id": client_id})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def get_latest_personality_question_set(*, user: dict) -> dict | None:
    """
    Fetch the latest generated personality question set for the current user.
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    doc = await db.db[QUESTION_SETS_COLLECTION_NAME].find_one({"client_id": client_id}, sort=[("created_at", -1)])
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


