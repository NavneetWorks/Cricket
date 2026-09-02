#pragma once
#include <thread>
#include <iostream>
#include <App.h> 
#include <unordered_map>
#include "Player.h"

class NetworkManager {
public:
    NetworkManager();
    ~NetworkManager();

    void start(int port); // Server ko port par listen karwane ke liye
    void stop();

private:
    void runServer(int port); 
    std::thread networkThread; 
    std::unordered_map<void*,Player*> connectedPlayers;
    Player* waitingPlayer = nullptr;
    int nextPlayerId = 1;
};