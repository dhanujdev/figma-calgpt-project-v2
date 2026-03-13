# Instrumentation Checklist

- Verify `dashboard_open` rows land in `analytics_events` after `@GPT-Calories V2 show my dashboard`.
- Verify `meal_logged` rows land after a successful `log_meal` flow.
- Verify `weight_logged` rows land after a successful `log_weight` flow.
- Verify `daily_checkin_run` rows land after a successful daily check-in.
- Verify `weekly_review_run` rows land after a successful weekly review.
- Verify any surfaced tool failure includes `toolName`, `widgetVersion`, and `failureClass`.
