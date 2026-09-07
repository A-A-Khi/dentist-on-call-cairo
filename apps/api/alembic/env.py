from logging.config import fileConfig

import app.models  # noqa: F401  # Import models to populate Base.metadata.
from alembic import context
from app.core.config import get_settings
from app.database.base import Base
from app.database.session import get_engine_url

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# declarative metadata for autogeneration.
target_metadata = Base.metadata
db_url = get_engine_url(get_settings().database_url)
config.set_main_option("sqlalchemy.url", db_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    context.configure(
        url=db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    from app.database.session import engine

    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
