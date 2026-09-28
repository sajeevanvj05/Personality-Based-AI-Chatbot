from datetime import datetime

from app.utils.db import db


VOICE_PROFILES_COLLECTION = "voice_profiles"
VOICE_GENERATIONS_COLLECTION = "voice_generations"


async def upsert_voice_profile(
    *,
    user: dict,
    language: str,
    samples: list[dict],
    speaker_wav_path: str,
    reference_sample_id: str,
    personality_id: str | None = None,
    kind: str | None = None,
) -> dict:
    """
    Store/update the user's enrolled voice samples. Tied to client_id.
    """
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        raise Exception("User has no client_id")

    now = datetime.utcnow()
    base = {
        "client_id": client_id,
        "personality_id": personality_id,
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "language": language,
        "samples": samples,
        "speaker_wav_path": speaker_wav_path,
        "reference_sample_id": reference_sample_id,
        "status": "ready",
        "kind": kind or ("famous" if personality_id else "user"),
        "updated_at": now,
    }

    query = {"client_id": client_id, "personality_id": personality_id}
    existing = await db.db[VOICE_PROFILES_COLLECTION].find_one(query)
    if existing:
        await db.db[VOICE_PROFILES_COLLECTION].update_one(
            {"_id": existing["_id"]},
            {"$set": base},
        )
        doc = await db.db[VOICE_PROFILES_COLLECTION].find_one({"_id": existing["_id"]})
    else:
        base["created_at"] = now
        result = await db.db[VOICE_PROFILES_COLLECTION].insert_one(base)
        doc = await db.db[VOICE_PROFILES_COLLECTION].find_one({"_id": result.inserted_id})

    doc["_id"] = str(doc["_id"])
    return doc


async def get_voice_profile(*, user: dict, personality_id: str | None = None) -> dict | None:
    if db.db is None:
        raise Exception("Database not connected")

    client_id = user.get("client_id")
    if not client_id:
        return None

    doc = await db.db[VOICE_PROFILES_COLLECTION].find_one({"client_id": client_id, "personality_id": personality_id})
    if not doc:
        return None
    doc["_id"] = str(doc["_id"])
    return doc


async def create_voice_generation(
    *,
    user: dict,
    text: str,
    language: str,
    output_path: str,
) -> dict:
    if db.db is None:
        raise Exception("Database not connected")

    doc = {
        "client_id": user.get("client_id"),
        "username": user.get("username"),
        "user_id": user.get("_id"),
        "created_at": datetime.utcnow(),
        "text": text,
        "language": language,
        "output_path": output_path,
    }
    result = await db.db[VOICE_GENERATIONS_COLLECTION].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


