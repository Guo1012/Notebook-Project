import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path


LOG_FORMAT = "%(asctime)s %(levelname)s service=%(name)s %(message)s"


def configure_logging(service_name: str) -> logging.Logger:
    logger = logging.getLogger(service_name)
    if logger.handlers:
        return logger

    level_name = os.getenv("LUMEN_LOG_LEVEL", "INFO").upper()
    logger.setLevel(getattr(logging, level_name, logging.INFO))
    logger.propagate = False

    formatter = logging.Formatter(LOG_FORMAT)
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    logger.addHandler(console)

    log_dir = Path(
        os.getenv("LUMEN_LOG_DIR", Path(__file__).resolve().parents[2] / "logs")
    )
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        file_handler = RotatingFileHandler(
            log_dir / f"{service_name}.log",
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
    except OSError as error:
        logger.warning(
            "event=file_logging_unavailable path=%s error=%r", log_dir, error
        )
    else:
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    return logger
