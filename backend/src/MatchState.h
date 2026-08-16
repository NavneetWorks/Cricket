#pragma once

enum class MatchState {
    LOBBY,           // Waiting for players
    BOWLER_RUNUP,    // Bowler is swinging
    BALL_IN_FLIGHT,  // Ball is released, moving towards batter
    BATTING,         // Batter is swinging
    SCORE_UPDATE,    // Ball is dead, updating runs
    MATCH_OVER       // Game finished
};