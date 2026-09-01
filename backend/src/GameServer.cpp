#include "GameServer.h"
#include <iostream>
#include <chrono>

GameServer::GameServer() : isRunning(false) , currentState(MatchState::LOBBY){}

GameServer::~GameServer() {
    stop();
}

void GameServer::start(){
    if(!isRunning){
        isRunning = true;

        serverThread = std::thread(&GameServer::runTickLoop,this);
        std::cout << "Game Server started 60 Hz physics loop .\n";
    }

}

void GameServer::stop(){
    if(isRunning){
        isRunning = false;
        if(serverThread.joinable()){
            serverThread.join();
        }
        std::cout << "Game Server stopped.\n";
    }
}

void GameServer::runTickLoop(){
    using namespace std::chrono;
    const duration<double,std::milli> tickDuration(Config::TICK_DURATION_MS);


    while(isRunning){
        auto frameStart = steady_clock::now();

        auto frameEnd = steady_clock::now();
        auto elapsedTime = duration_cast<duration<double,std::milli>>(frameEnd - frameStart);

        auto sleepTime = tickDuration - elapsedTime;

        if(sleepTime.count() > 0){
            std::this_thread::sleep_for(sleepTime);
        } else {
            std::cout << "Warning Server Tick Dropped! Calculation Took: " << elapsedTime.count() << "ms\n";
        }
    }
}

