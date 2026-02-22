"""Custom exceptions for the pro worker."""


class DataIntegrityError(Exception):
    """Raised when data from GRID is missing or ambiguous.

    Instead of fabricating fallback values (fake format, unknown team names,
    guessed sides, etc.), we raise this so the series can be marked as failed
    and retried later when the data might be available.
    """

    def __init__(self, reason: str, context: dict | None = None):
        self.reason = reason
        self.context = context or {}
        super().__init__(reason)
