#pragma once
#include <thread>
#include <atomic>
#include "MatchState.h"
#include "Config.h"


class GameServer {
    public:
        GameServer();
        ~GameServer();

        void start();
        void stop();

    private:
        void runTickLoop();

        std::atomic<bool> isRunning;
        std::thread serverThread;
        MatchState currentState;
};                                

