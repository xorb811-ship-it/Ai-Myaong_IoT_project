# from sqlalchemy.orm import declarative_base;

# Base = declarative_base()

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import declarative_base, sessionmaker

BACKEND_ENV = Path(__file__).resolve().parents[1] / "backend" / ".env"
load_dotenv(BACKEND_ENV)

ORACLE_USER = os.getenv("ORACLE_USER")
ORACLE_PASSWORD = os.getenv("ORACLE_PASSWORD")
ORACLE_DSN = os.getenv("ORACLE_DSN")
ORACLE_WALLET_DIR = os.getenv("ORACLE_WALLET_DIR")
ORACLE_WALLET_PASSWORD = os.getenv("ORACLE_WALLET_PASSWORD")

Base = declarative_base()

engine = None
SessionLocal = None


def is_database_configured() -> bool:
    return all(
        [
            ORACLE_USER,
            ORACLE_PASSWORD,
            ORACLE_DSN,
            ORACLE_WALLET_DIR,
            ORACLE_USER != "your_oracle_user",
            ORACLE_PASSWORD != "your_oracle_password",
        ]
    )


if is_database_configured():
    connect_args = {
        "config_dir": ORACLE_WALLET_DIR,
        "wallet_location": ORACLE_WALLET_DIR,
    }

    if ORACLE_WALLET_PASSWORD:
        connect_args["wallet_password"] = ORACLE_WALLET_PASSWORD

    database_url = URL.create(
        "oracle+oracledb",
        username=ORACLE_USER,
        password=ORACLE_PASSWORD,
        host=ORACLE_DSN,
    )

    engine = create_engine(
        database_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )

    SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
    )


def get_db():
    if SessionLocal is None:
        raise RuntimeError(
            "Oracle database is not configured. Set ORACLE_USER and ORACLE_PASSWORD in backend/.env."
        )

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
