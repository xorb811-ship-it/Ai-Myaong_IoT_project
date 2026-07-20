from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from statistics import mean
from typing import Any

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database.daily_activity_summaries import DailyActivitySummary
from database.feed_logs import FeedLog
from database.pets import Pet
from database.settings import Settings
from database.time_utils import today_kst
from database.water_logs import WaterLog


TREND_RATIO_THRESHOLD = 0.1
ACTIVE_POSES = {"walking", "running", "playing", "standing", "moving"}


def _date_to_iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _age_months(birth_date: date | None, today: date) -> int | None:
    if not birth_date:
        return None
    months = (today.year - birth_date.year) * 12 + (today.month - birth_date.month)
    if today.day < birth_date.day:
        months -= 1
    return months if months >= 0 else None


def _life_stage(species: str | None, age_months: int | None) -> str | None:
    if age_months is None:
        return None
    normalized_species = (species or "").upper()
    if normalized_species == "CAT":
        if age_months < 12:
            return "kitten"
        if age_months >= 132:
            return "senior"
        return "adult"
    if normalized_species == "DOG":
        if age_months < 12:
            return "puppy"
        if age_months >= 96:
            return "senior"
        return "adult"
    return "adult" if age_months >= 12 else "young"


def _breed_context(species: str | None, breed: str | None) -> dict:
    normalized_species = (species or "").upper()
    normalized_breed = (breed or "").lower()
    if normalized_species == "CAT" and (
        "norwegian" in normalized_breed
        or "forest" in normalized_breed
        or "놀숲" in normalized_breed
        or "노르웨이" in normalized_breed
    ):
        return {
            "breed_size_profile": "large_cat_breed",
            "analysis_note": "대형묘 계열일 수 있어 체중, 급식량, 활동량 해석 시 개체의 체격 차이를 함께 참고해야 합니다.",
        }
    return {
        "breed_size_profile": None,
        "analysis_note": None,
    }


def _to_float(value: Any) -> float | None:
    return float(value) if value is not None else None


def _round_or_none(value: float | None, digits: int = 1) -> float | None:
    return round(value, digits) if value is not None else None


def _date_range(start: date, days: int) -> list[date]:
    return [start + timedelta(days=offset) for offset in range(days)]


def _avg_or_none(values: list[float | None]) -> float | None:
    filtered = [value for value in values if value is not None]
    if not filtered:
        return None
    return mean(filtered)


def _change_percent(first_avg: float | None, last_avg: float | None) -> float | None:
    if first_avg is None or last_avg is None or abs(first_avg) < 1e-9:
        return None
    return ((last_avg - first_avg) / first_avg) * 100


def _trend_from_change(change_percent: float | None) -> str:
    if change_percent is None:
        return "insufficient_data"
    if change_percent >= TREND_RATIO_THRESHOLD * 100:
        return "increasing"
    if change_percent <= -TREND_RATIO_THRESHOLD * 100:
        return "decreasing"
    return "stable"


def _most_common_pose(poses: list[str | None]) -> str | None:
    filtered = [pose for pose in poses if pose]
    if not filtered:
        return None
    return Counter(filtered).most_common(1)[0][0]


def _activity_entries(
    summaries: list[DailyActivitySummary],
) -> tuple[dict[date, list[tuple[float, int]]], dict[date, list[str | None]], list[str]]:
    activity_by_date: dict[date, list[tuple[float, int]]] = defaultdict(list)
    poses_by_date: dict[date, list[str | None]] = defaultdict(list)
    valid_poses = []

    for summary in summaries:
        if summary.avg_activity_level is not None:
            minutes = summary.detected_minutes or 1
            activity_by_date[summary.summary_date].append((float(summary.avg_activity_level), minutes))

    return activity_by_date, poses_by_date, valid_poses


def _weighted_activity(values: list[tuple[float, int]]) -> float | None:
    if not values:
        return None
    total_minutes = sum(minutes for _, minutes in values)
    if total_minutes <= 0:
        return None
    return sum(score * minutes for score, minutes in values) / total_minutes


def _pose_distribution(poses: list[str]) -> dict[str, float]:
    if not poses:
        return {}
    counts = Counter(poses)
    total = sum(counts.values())
    return {pose: round((count / total) * 100, 1) for pose, count in counts.items()}


def _ratio_for_pose(poses: list[str], target_pose: str) -> float | None:
    if not poses:
        return None
    count = sum(1 for pose in poses if pose == target_pose)
    return round((count / len(poses)) * 100, 1)


def _active_pose_ratio(poses: list[str]) -> float | None:
    if not poses:
        return None
    count = sum(1 for pose in poses if pose in ACTIVE_POSES)
    return round((count / len(poses)) * 100, 1)


def _settings_summary(db: Session, user_id: int) -> dict:
    empty_settings = {
        "default_feed_amount_g": None,
        "default_water_amount_ml": None,
        "feed_schedule": None,
        "water_schedule": None,
    }
    try:
        settings = (
            db.query(
                Settings.feed_amount,
                Settings.water_amount,
                Settings.feed_schedule,
                Settings.water_schedule,
            )
            .filter(Settings.user_id == user_id)
            .first()
        )
    except SQLAlchemyError:
        return empty_settings

    if not settings:
        return empty_settings

    feed_amount, water_amount, feed_schedule, water_schedule = settings
    return {
        "default_feed_amount_g": _to_float(feed_amount),
        "default_water_amount_ml": _to_float(water_amount),
        "feed_schedule": feed_schedule,
        "water_schedule": water_schedule,
    }


def _vs_default_percent(actual_avg: float | None, default_amount: float | None) -> float | None:
    if actual_avg is None or default_amount is None or abs(default_amount) < 1e-9:
        return None
    return round(((actual_avg - default_amount) / default_amount) * 100, 1)


def build_pet_health_summary(db: Session, user_id: int, pet_id: int, days: int = 7) -> dict:
    if days < 1:
        raise ValueError("days must be greater than 0")

    pet = db.query(Pet).filter(Pet.user_id == user_id, Pet.pet_id == pet_id).first()
    if not pet:
        raise ValueError("Pet not found")

    period_end = today_kst()
    period_start = period_end - timedelta(days=days - 1)
    start_dt = datetime.combine(period_start, time.min)
    end_dt = datetime.combine(period_end + timedelta(days=1), time.min)
    dates = _date_range(period_start, days)

    feed_logs = (
        db.query(FeedLog)
        .filter(
            FeedLog.user_id == user_id,
            FeedLog.pet_id == pet_id,
            FeedLog.created_at >= start_dt,
            FeedLog.created_at < end_dt,
        )
        .all()
    )
    water_logs = (
        db.query(WaterLog)
        .filter(
            WaterLog.user_id == user_id,
            WaterLog.pet_id == pet_id,
            WaterLog.created_at >= start_dt,
            WaterLog.created_at < end_dt,
            WaterLog.water_type == "consumed",
        )
        .all()
    )
    activity_summaries = (
        db.query(DailyActivitySummary)
        .filter(
            DailyActivitySummary.user_id == user_id,
            DailyActivitySummary.pet_id == pet_id,
            DailyActivitySummary.summary_date >= period_start,
            DailyActivitySummary.summary_date <= period_end,
        )
        .all()
    )

    food_by_date: dict[date, float] = defaultdict(float)
    for log in feed_logs:
        food_by_date[log.created_at.date()] += float(log.food_amount_g or 0)

    water_by_date: dict[date, float] = defaultdict(float)
    for log in water_logs:
        water_by_date[log.created_at.date()] += float(log.water_amount_ml or 0)

    activity_by_date, poses_by_date, valid_poses = _activity_entries(activity_summaries)

    daily = []
    activity_values: list[float | None] = []
    for day in dates:
        avg_activity = None
        if activity_by_date.get(day):
            avg_activity = _weighted_activity(activity_by_date[day])
        activity_values.append(avg_activity)

        daily.append(
            {
                "date": day.isoformat(),
                "food_g": round(food_by_date.get(day, 0.0), 1),
                "water_ml": round(water_by_date.get(day, 0.0), 1),
                "avg_activity_level": _round_or_none(avg_activity),
                "most_common_pose": _most_common_pose(poses_by_date.get(day, [])),
            }
        )

    food_values = [food_by_date.get(day, 0.0) for day in dates]
    water_values = [water_by_date.get(day, 0.0) for day in dates]
    feed_days = sum(1 for day in dates if day in food_by_date)
    water_days = sum(1 for day in dates if day in water_by_date)
    activity_days = sum(1 for value in activity_values if value is not None)

    first_days = dates[:3]
    last_days = dates[-3:]
    first_food_avg = sum(food_by_date.get(day, 0.0) for day in first_days) / len(first_days)
    last_food_avg = sum(food_by_date.get(day, 0.0) for day in last_days) / len(last_days)
    first_water_avg = sum(water_by_date.get(day, 0.0) for day in first_days) / len(first_days)
    last_water_avg = sum(water_by_date.get(day, 0.0) for day in last_days) / len(last_days)
    first_activity_avg = _avg_or_none([activity_values[dates.index(day)] for day in first_days])
    last_activity_avg = _avg_or_none([activity_values[dates.index(day)] for day in last_days])
    food_change_percent = _change_percent(first_food_avg, last_food_avg)
    water_change_percent = _change_percent(first_water_avg, last_water_avg)
    activity_change_percent = _change_percent(first_activity_avg, last_activity_avg)
    avg_food = round(sum(food_values) / days, 1)
    avg_water = round(sum(water_values) / days, 1)
    avg_activity = _round_or_none(_avg_or_none(activity_values))
    pose_distribution = _pose_distribution(valid_poses)
    settings = _settings_summary(db, user_id)

    pet_age_months = _age_months(pet.birth_date, period_end)
    breed_context = _breed_context(pet.species, pet.breed)

    summary = {
        "pet": {
            "pet_id": pet.pet_id,
            "name": pet.name,
            "species": pet.species,
            "breed": pet.breed,
            "gender": pet.gender,
            "birth_date": _date_to_iso(pet.birth_date),
            "age_months": pet_age_months,
            "age_years": round(pet_age_months / 12, 1) if pet_age_months is not None else None,
            "life_stage": _life_stage(pet.species, pet_age_months),
            "weight_kg": _to_float(pet.weight_kg),
            "height_cm": _to_float(pet.height_cm),
            "circumference": _to_float(pet.circumference),
            "leg_length": _to_float(pet.leg_length),
            "notes": pet.notes,
            "breed_context": breed_context,
        },
        "period": {
            "start": period_start.isoformat(),
            "end": period_end.isoformat(),
            "days": days,
        },
        "daily": daily,
        "settings": settings,
        "llm_analysis_request": {
            "goal": "pet의 품종, 나이, 체중을 참고해 일반적인 급식량과 급수량 기준을 추정하고 실제 최근 평균과 비교한다.",
            "compare_targets": [
                "avg_food_g_per_day",
                "avg_water_ml_per_day",
                "last_3_days_avg_food_g",
                "last_3_days_avg_water_ml",
            ],
            "tone": "사용자가 바로 이해할 수 있게 대략적인 기준 비교와 생활 조언을 제공한다.",
        },
        "computed_metrics": {
            "avg_food_g_per_day": avg_food,
            "first_3_days_avg_food_g": round(first_food_avg, 1),
            "last_3_days_avg_food_g": round(last_food_avg, 1),
            "food_change_percent": _round_or_none(food_change_percent),
            "food_trend": _trend_from_change(food_change_percent),
            "avg_water_ml_per_day": avg_water,
            "first_3_days_avg_water_ml": round(first_water_avg, 1),
            "last_3_days_avg_water_ml": round(last_water_avg, 1),
            "water_change_percent": _round_or_none(water_change_percent),
            "water_trend": _trend_from_change(water_change_percent),
            "avg_activity_level": avg_activity,
            "first_3_days_avg_activity": _round_or_none(first_activity_avg),
            "last_3_days_avg_activity": _round_or_none(last_activity_avg),
            "activity_change_percent": _round_or_none(activity_change_percent),
            "activity_trend": _trend_from_change(activity_change_percent),
            "most_common_pose_overall": _most_common_pose(valid_poses),
            "lying_pose_ratio_percent": _ratio_for_pose(valid_poses, "lying"),
            "active_pose_ratio_percent": _active_pose_ratio(valid_poses),
            "pose_distribution": pose_distribution,
            "avg_food_vs_default_percent": _vs_default_percent(
                avg_food,
                settings["default_feed_amount_g"],
            ),
            "avg_water_vs_default_percent": _vs_default_percent(
                avg_water,
                settings["default_water_amount_ml"],
            ),
        },
        "data_quality": {
            "feed_days": feed_days,
            "water_days": water_days,
            "activity_days": activity_days,
            "missing_feed_days": days - feed_days,
            "missing_water_days": days - water_days,
            "missing_activity_days": days - activity_days,
            "pose_sample_count": len(valid_poses),
            "activity_summary_count": len(activity_summaries),
            "activity_detected_minutes": sum(row.detected_minutes or 0 for row in activity_summaries),
            "activity_sample_count": sum(len(values) for values in activity_by_date.values()),
        },
    }
    return summary
