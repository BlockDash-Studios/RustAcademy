// Throttling configuration for session endpoints (login and refresh)
pub struct AuthRateLimitConfig {
    pub max_requests: u32,
    pub window_seconds: u64,
}

impl Default for AuthRateLimitConfig {
    fn default() -> Self {
        Self {
            max_requests: 5, // 5 attempts per window
            window_seconds: 60, // per minute
        }
    }
}
