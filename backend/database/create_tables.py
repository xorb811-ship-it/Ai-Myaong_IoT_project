from database.base import Base, engine
from database.base import SessionLocal

import database.alerts
import database.clips
import database.daily_activity_summaries
import database.detection_logs
import database.emergency_clips
import database.feed_logs
import database.pet_health_reports
import database.pets
import database.oauth2_providers
import database.settings
import database.user
import database.user_credentials
import database.user_oauth_connections
import database.water_logs
from database.oauth2_providers import OAuth2Provider


def main() -> None:
    if engine is None:
        raise RuntimeError("Database engine is not configured.")

    # Base.metadata.drop_all(bind=engine)   #  실행 후  제거
    Base.metadata.create_all(bind=engine)
    seed_oauth2_providers()
    print("Tables created or already exist:")
    for table_name in sorted(Base.metadata.tables):
        print(f"- {table_name}")


def seed_oauth2_providers() -> None:
    if SessionLocal is None:
        return

    db = SessionLocal()
    try:
        for provider_name in ("GOOGLE", "NAVER", "KAKAO"):
            exists = (
                db.query(OAuth2Provider)
                .filter(OAuth2Provider.provider_name == provider_name)
                .first()
            )
            if not exists:
                db.add(OAuth2Provider(provider_name=provider_name))
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
