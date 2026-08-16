#include "GameServer.h"
#include "NetworkManager.h"
#include "Config.h"
#include <iostream>
#include <thread>
#include <chrono>

int main() {
    std::cout << "Starting Cricket Game Server...\n";

    GameServer gameServer;
    gameServer.start();

    NetworkManager networkManager;
    networkManager.start(Config::SERVER_PORT);

    std::cout << "Server is running on port " << Config::SERVER_PORT << "! Press Ctrl+C to stop.\n";

    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    networkManager.stop();
    gameServer.stop();

    return 0;
}