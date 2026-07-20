"""SETTINGS.onboarded 컬럼을 배포 DB에 안전하게 추가하는 러너.

- backend/.env 의 Oracle 접속 정보를 그대로 사용(앱과 동일 연결).
- 컬럼이 이미 있으면 건너뛴다(idempotent) → 여러 번 실행해도 안전.
- 비파괴적: 기존 SETTINGS 행/데이터는 그대로, 기존 행은 기본값 'N' 으로 채워진다.

실행:  python database/apply_settings_onboarded.py
"""

from sqlalchemy import text

from database.base import engine


def main() -> None:
    if engine is None:
        raise RuntimeError(
            "Oracle 접속이 설정되지 않았습니다. backend/.env 의 ORACLE_* 값을 확인하세요."
        )

    with engine.begin() as conn:
        exists = conn.execute(
            text(
                "SELECT COUNT(*) FROM user_tab_columns "
                "WHERE table_name = 'SETTINGS' AND column_name = 'ONBOARDED'"
            )
        ).scalar()

        if exists:
            print("이미 SETTINGS.ONBOARDED 컬럼이 있습니다. (건너뜀)")
            return

        conn.execute(
            text("ALTER TABLE SETTINGS ADD onboarded VARCHAR2(1) DEFAULT 'N'")
        )
        print("SETTINGS.ONBOARDED 컬럼을 추가했습니다. (기존 행은 'N')")


if __name__ == "__main__":
    main()
