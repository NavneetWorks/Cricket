#pragma once

namespace Config {
    constexpr int SERVER_PORT = 9001;

    constexpr int TICK_RATE = 128;

    constexpr double TICK_DURATION_MS = 1000.0 / TICK_RATE;

    constexpr int PLAYERS_PER_MATCH = 2;
}